import {
    addDoc, collection, deleteDoc, doc, getDocs, orderBy, query,
    serverTimestamp, Timestamp, updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { EventInput, RadioEvent } from "../types";

const eventsRef = collection(db, "events");

function toFirestore(input: EventInput) {
    return {
        title: input.title,
        audience: input.audience,
        description: input.description,
        link: input.link,
        date: Timestamp.fromDate(input.date),
        endDate: input.endDate ? Timestamp.fromDate(input.endDate) : null,
    };
}

export async function createEvent(input: EventInput): Promise<void> {
    await addDoc(eventsRef, {
        ...toFirestore(input),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
    await updateDoc(doc(db, "events", id), {
        ...toFirestore(input),
        updatedAt: serverTimestamp(),
    });
}

export async function listEvents(): Promise<RadioEvent[]> {
    const snapshot = await getDocs(query(eventsRef, orderBy("date", "desc")));
    return snapshot.docs.map((d) => {
        const data = d.data();
        return {
            id: d.id,
            title: data.title ?? "",
            audience: data.audience ?? [],
            // "summary" was the name used in the first version
            description: data.description ?? data.summary ?? "",
            link: data.link ?? "",
            date: (data.date as Timestamp).toDate(),
            endDate: data.endDate ? (data.endDate as Timestamp).toDate() : null,
        };
    });
}

export async function deleteEvent(id: string): Promise<void> {
    await deleteDoc(doc(db, "events", id));
}