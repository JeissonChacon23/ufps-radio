// src/services/podcastsService.ts
import {
    addDoc, collection, deleteField, doc, getDoc, getDocs, onSnapshot, serverTimestamp,
    Timestamp, updateDoc,
} from "firebase/firestore";
import { toTimeInput } from "../lib/dates";
import { extractDriveId } from "../lib/drive";
import { db } from "../lib/firebase";
import {
    deletePodcastFromQdrant,
    pruneOrphanPodcastsFromQdrant,
    upsertPodcastInQdrant,
} from "../lib/qdrant";
import type { Podcast, PodcastInput, PodcastStatus } from "../types";

const podcastsRef = collection(db, "podcasts");
const syncedInSession = new Set<string>();

export async function createPodcast(input: PodcastInput): Promise<void> {
    await addDoc(podcastsRef, {
        programId: input.programId,
        programName: input.programName,
        airDate: Timestamp.fromDate(input.airDate),
        airTime: input.airTime,
        audioUrl: input.audioUrl,
        imageUrl: input.imageUrl,
        status: "pendiente",
        active: true,
        disableReason: "",
        createdAt: serverTimestamp(),
    });
}

export async function updatePodcast(id: string, input: PodcastInput): Promise<void> {
    const ref = doc(db, "podcasts", id);
    const snap = await getDoc(ref);
    const prev = snap.exists() ? snap.data() : {};
    const audioChanged = String(prev.audioUrl ?? "") !== input.audioUrl;

    const payload: Record<string, unknown> = {
        programId: input.programId,
        programName: input.programName,
        airDate: Timestamp.fromDate(input.airDate),
        airTime: input.airTime,
        audioUrl: input.audioUrl,
        imageUrl: input.imageUrl,
        updatedAt: serverTimestamp(),
    };

    // If audio changed, mark as pending so the transcriber re-transcribes it
    if (audioChanged) {
        syncedInSession.delete(id);
        await deletePodcastFromQdrant(id);
        if ((prev.active ?? true) === true) {
            payload.status = "pendiente";
            payload.errorMessage = deleteField();
        } else {
            payload.savedStatus = "pendiente";
        }
    }

    await updateDoc(ref, payload);
}

/** Live list: the status changes while the transcriber works. Returns the unsubscribe function. */
export function observePodcasts(
    onChange: (podcasts: Podcast[]) => void,
    onError: () => void,
): () => void {
    return onSnapshot(
        podcastsRef,
        (snapshot) => {
            const podcasts: Podcast[] = [];
            for (const d of snapshot.docs) {
                const data = d.data();
                const airDate = data.airDate as Timestamp | undefined;
                if (!airDate) continue; // documents from the first version of this page
                const dateObj = airDate.toDate();
                const disabledAt = data.disabledAt ? (data.disabledAt as Timestamp).toDate() : null;
                const airTime: string =
                    typeof data.airTime === "string" && data.airTime
                        ? data.airTime
                        : toTimeInput(dateObj);
                const active = data.active ?? true;
                const rawStatus = (data.status ?? "pendiente") as string;
                const savedStatus = (data.savedStatus as PodcastStatus | undefined) ?? undefined;
                const displayStatus: PodcastStatus =
                    rawStatus === "deshabilitado"
                        ? (savedStatus ?? "lista")
                        : (rawStatus as PodcastStatus);

                podcasts.push({
                    id: d.id,
                    programId: data.programId ?? "",
                    programName: data.programName ?? "",
                    airDate: dateObj,
                    airTime,
                    audioUrl: data.audioUrl ?? "",
                    imageUrl: data.imageUrl ?? null,
                    status: displayStatus,
                    errorMessage: data.errorMessage ?? "",
                    active,
                    disableReason: typeof data.disableReason === "string" ? data.disableReason : "",
                    disabledAt,
                });

                // Automatically index active & ready episodes into Qdrant if not yet synced in this session
                if (active && rawStatus === "lista" && !syncedInSession.has(d.id)) {
                    syncedInSession.add(d.id);
                    const audioId = extractDriveId(String(data.audioUrl ?? "")) ?? "";
                    const imageId = extractDriveId(String(data.imageUrl ?? "")) ?? "";
                    if (audioId) {
                        void upsertPodcastInQdrant({
                            id: d.id,
                            programId: String(data.programId ?? ""),
                            programName: String(data.programName ?? ""),
                            airDateSeconds: Math.floor(dateObj.getTime() / 1000),
                            airTime,
                            hosts: Array.isArray(data.hosts) ? (data.hosts as string[]) : [],
                            imageId,
                            audioId,
                            transcript: String(data.transcript ?? ""),
                            keywords: Array.isArray(data.keywords) ? (data.keywords as string[]) : [],
                            segments: Array.isArray(data.segments) ? data.segments : undefined,
                        });
                    }
                }
            }
            const readyIds = new Set(
                podcasts.filter((p) => p.active && p.status === "lista").map((p) => p.id),
            );
            void pruneOrphanPodcastsFromQdrant(readyIds);
            podcasts.sort((a, b) => b.airDate.getTime() - a.airDate.getTime());
            onChange(podcasts);
        },
        () => onError(),
    );
}

export async function retryPodcast(id: string): Promise<void> {
    syncedInSession.delete(id);
    await deletePodcastFromQdrant(id);
    await updateDoc(doc(db, "podcasts", id), {
        status: "pendiente",
        active: true,
        disableReason: "",
        disabledAt: deleteField(),
        savedStatus: deleteField(),
        errorMessage: deleteField(),
    });
}

/**
 * Soft-disables a podcast episode with an administrative observation (never hard-deletes).
 * Also saves `status` -> `savedStatus`, sets `status: "deshabilitado"` and removes its vectors from Qdrant
 * so it disappears immediately from ALL iOS app versions and search results.
 */
export async function disablePodcast(id: string, reason: string): Promise<void> {
    syncedInSession.delete(id);
    const ref = doc(db, "podcasts", id);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const currentStatus = typeof data.status === "string" ? data.status : "lista";
    const preservedStatus =
        currentStatus !== "deshabilitado"
            ? currentStatus
            : (typeof data.savedStatus === "string" ? data.savedStatus : "lista");

    await deletePodcastFromQdrant(id);
    await updateDoc(ref, {
        active: false,
        savedStatus: preservedStatus,
        status: "deshabilitado",
        disableReason: reason.trim(),
        disabledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

/** Re-enables a previously disabled podcast episode, restores its status, and re-indexes it in Qdrant if ready. */
export async function enablePodcast(id: string): Promise<void> {
    const ref = doc(db, "podcasts", id);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const restoredStatus =
        typeof data.savedStatus === "string" && data.savedStatus !== "deshabilitado"
            ? data.savedStatus
            : typeof data.status === "string" && data.status !== "deshabilitado"
              ? data.status
              : "lista";

    await updateDoc(ref, {
        active: true,
        status: restoredStatus,
        savedStatus: deleteField(),
        disableReason: "",
        disabledAt: deleteField(),
        updatedAt: serverTimestamp(),
    });

    syncedInSession.delete(id);
    if (restoredStatus === "lista") {
        const airDate = data.airDate as Timestamp | undefined;
        const dateObj = airDate ? airDate.toDate() : new Date();
        const audioId = extractDriveId(String(data.audioUrl ?? "")) ?? "";
        const imageId = extractDriveId(String(data.imageUrl ?? "")) ?? "";
        if (audioId) {
            await upsertPodcastInQdrant({
                id,
                programId: String(data.programId ?? ""),
                programName: String(data.programName ?? ""),
                airDateSeconds: Math.floor(dateObj.getTime() / 1000),
                airTime: typeof data.airTime === "string" ? data.airTime : toTimeInput(dateObj),
                hosts: Array.isArray(data.hosts) ? (data.hosts as string[]) : [],
                imageId,
                audioId,
                transcript: String(data.transcript ?? ""),
                keywords: Array.isArray(data.keywords) ? (data.keywords as string[]) : [],
                segments: Array.isArray(data.segments) ? data.segments : undefined,
            });
            syncedInSession.add(id);
        }
    }
}

/** Manual or batch sync of all active & ready episodes from Firestore to Qdrant. */
export async function syncAllPodcastsToQdrant(): Promise<number> {
    const [programsSnap, podcastsSnap] = await Promise.all([
        getDocs(collection(db, "programs")),
        getDocs(podcastsRef),
    ]);

    const programMeta = new Map<string, { hosts: string[]; imageId: string }>();
    for (const p of programsSnap.docs) {
        const pd = p.data();
        programMeta.set(p.id, {
            hosts: Array.isArray(pd.hosts) ? (pd.hosts as string[]) : [],
            imageId: extractDriveId(String(pd.artworkDriveId ?? "")) ?? "",
        });
    }

    let totalPoints = 0;
    for (const d of podcastsSnap.docs) {
        const data = d.data();
        const isActive = data.active ?? true;
        if (!isActive || data.status !== "lista") continue;
        const airDate = data.airDate as Timestamp | undefined;
        if (!airDate) continue;
        const dateObj = airDate.toDate();
        const airTime: string =
            typeof data.airTime === "string" && data.airTime ? data.airTime : toTimeInput(dateObj);
        const audioId = extractDriveId(String(data.audioUrl ?? "")) ?? "";
        if (!audioId) continue;

        const progInfo = programMeta.get(String(data.programId ?? ""));
        const imageId =
            extractDriveId(String(data.imageUrl ?? "")) || progInfo?.imageId || "";
        const hosts =
            Array.isArray(data.hosts) && data.hosts.length > 0
                ? (data.hosts as string[])
                : (progInfo?.hosts ?? []);

        const count = await upsertPodcastInQdrant({
            id: d.id,
            programId: String(data.programId ?? ""),
            programName: String(data.programName ?? ""),
            airDateSeconds: Math.floor(dateObj.getTime() / 1000),
            airTime,
            hosts,
            imageId,
            audioId,
            transcript: String(data.transcript ?? ""),
            keywords: Array.isArray(data.keywords) ? (data.keywords as string[]) : [],
            segments: Array.isArray(data.segments) ? data.segments : undefined,
        });
        syncedInSession.add(d.id);
        totalPoints += count;
    }

    const readyIds = new Set(
        podcastsSnap.docs
            .filter((d) => (d.data().active ?? true) && d.data().status === "lista")
            .map((d) => d.id),
    );
    await pruneOrphanPodcastsFromQdrant(readyIds);

    return totalPoints;
}
