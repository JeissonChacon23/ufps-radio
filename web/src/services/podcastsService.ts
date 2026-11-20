// src/services/podcastsService.ts
import {
    addDoc, collection, deleteDoc, deleteField, doc, getDocs, onSnapshot, serverTimestamp,
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
        createdAt: serverTimestamp(),
    });
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
                const airTime: string =
                    typeof data.airTime === "string" && data.airTime
                        ? data.airTime
                        : toTimeInput(dateObj);
                const status = (data.status ?? "pendiente") as PodcastStatus;

                podcasts.push({
                    id: d.id,
                    programId: data.programId ?? "",
                    programName: data.programName ?? "",
                    airDate: dateObj,
                    airTime,
                    audioUrl: data.audioUrl ?? "",
                    imageUrl: data.imageUrl ?? null,
                    status,
                    errorMessage: data.errorMessage ?? "",
                });

                // Automatically index ready episodes into Qdrant if not yet synced in this session
                if (status === "lista" && !syncedInSession.has(d.id)) {
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
                podcasts.filter((p) => p.status === "lista").map((p) => p.id),
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
        errorMessage: deleteField(),
    });
}

export async function deletePodcast(id: string): Promise<void> {
    syncedInSession.delete(id);
    await deletePodcastFromQdrant(id);
    await deleteDoc(doc(db, "podcasts", id));
}

/** Manual or batch sync of all ready episodes from Firestore to Qdrant. */
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
        if (data.status !== "lista") continue;
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
            .filter((d) => d.data().status === "lista")
            .map((d) => d.id),
    );
    await pruneOrphanPodcastsFromQdrant(readyIds);

    return totalPoints;
}
