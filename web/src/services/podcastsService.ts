// src/services/podcastsService.ts
import {
    addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, serverTimestamp,
    Timestamp, updateDoc,
} from "firebase/firestore";
import { toTimeInput } from "../lib/dates";
import { db } from "../lib/firebase";
import type { Podcast, PodcastInput, PodcastStatus } from "../types";

const podcastsRef = collection(db, "podcasts");

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
                podcasts.push({
                    id: d.id,
                    programId: data.programId ?? "",
                    programName: data.programName ?? "",
                    airDate: dateObj,
                    airTime,
                    audioUrl: data.audioUrl ?? "",
                    imageUrl: data.imageUrl ?? null,
                    status: (data.status ?? "pendiente") as PodcastStatus,
                    errorMessage: data.errorMessage ?? "",
                });
            }
            podcasts.sort((a, b) => b.airDate.getTime() - a.airDate.getTime());
            onChange(podcasts);
        },
        () => onError(),
    );
}

export async function retryPodcast(id: string): Promise<void> {
    await updateDoc(doc(db, "podcasts", id), {
        status: "pendiente",
        errorMessage: deleteField(),
    });
}

export async function deletePodcast(id: string): Promise<void> {
    await deleteDoc(doc(db, "podcasts", id));
}
