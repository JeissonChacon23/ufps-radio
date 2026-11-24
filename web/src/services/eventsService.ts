// src/services/eventsService.ts
import {
    addDoc, collection, deleteField, doc, getDoc, getDocs, orderBy, query,
    serverTimestamp, Timestamp, updateDoc,
} from "firebase/firestore";
import { toTimeInput } from "../lib/dates";
import { db } from "../lib/firebase";
import type { EventInput, RadioEvent } from "../types";

const eventsRef = collection(db, "events");

function toFirestore(input: EventInput) {
    return {
        title: input.title,
        audience: input.audience,
        description: input.description,
        link: input.link,
        specialGuest: input.specialGuest,
        startTime: input.startTime,
        endTime: input.endTime,
        date: Timestamp.fromDate(input.date),
        endDate: input.endDate ? Timestamp.fromDate(input.endDate) : null,
    };
}

export async function createEvent(input: EventInput): Promise<void> {
    await addDoc(eventsRef, {
        ...toFirestore(input),
        active: true,
        disableReason: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

export async function updateEvent(id: string, input: EventInput): Promise<void> {
    const ref = doc(db, "events", id);
    const snap = await getDoc(ref);
    const isCurrentlyActive = snap.exists() ? (snap.data().active ?? true) : true;

    const payload: Record<string, unknown> = {
        ...toFirestore(input),
        updatedAt: serverTimestamp(),
    };

    // If the event is currently disabled, keep `audience` empty so it stays hidden from all app versions,
    // while saving any audience edits into `savedAudience`.
    if (!isCurrentlyActive) {
        payload.savedAudience = input.audience;
        payload.audience = [];
    }

    await updateDoc(ref, payload);
}

/**
 * Soft-disables an event with a mandatory administrative observation (never hard-deletes).
 * Also moves `audience` -> `savedAudience` and sets `audience: []` so the event disappears
 * immediately from Firestore `arrayContainsAny` queries on ALL installed app versions.
 */
export async function disableEvent(id: string, reason: string): Promise<void> {
    const ref = doc(db, "events", id);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const currentAudience: string[] = Array.isArray(data.audience) ? data.audience : [];
    const existingSaved: string[] = Array.isArray(data.savedAudience) ? data.savedAudience : [];
    const preservedAudience = currentAudience.length > 0 ? currentAudience : existingSaved;

    await updateDoc(ref, {
        active: false,
        savedAudience: preservedAudience,
        audience: [],
        disableReason: reason.trim(),
        disabledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

/** Re-enables a previously disabled event and restores its original audience. */
export async function enableEvent(id: string): Promise<void> {
    const ref = doc(db, "events", id);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : {};
    const currentAudience: string[] = Array.isArray(data.audience) ? data.audience : [];
    const savedAudience: string[] = Array.isArray(data.savedAudience) ? data.savedAudience : [];
    const restoredAudience =
        savedAudience.length > 0
            ? savedAudience
            : currentAudience.length > 0
              ? currentAudience
              : ["todos"];

    await updateDoc(ref, {
        active: true,
        audience: restoredAudience,
        savedAudience: deleteField(),
        disableReason: "",
        disabledAt: deleteField(),
        updatedAt: serverTimestamp(),
    });
}

export async function listEvents(): Promise<RadioEvent[]> {
    const snapshot = await getDocs(query(eventsRef, orderBy("date", "desc")));
    return snapshot.docs.map((d) => {
        const data = d.data();
        const date = (data.date as Timestamp).toDate();
        const endDate = data.endDate ? (data.endDate as Timestamp).toDate() : null;
        const disabledAt = data.disabledAt ? (data.disabledAt as Timestamp).toDate() : null;
        const active = data.active ?? true;
        const rawAudience: string[] = Array.isArray(data.audience) ? data.audience : [];
        const savedAudience: string[] = Array.isArray(data.savedAudience) ? data.savedAudience : [];
        const displayAudience =
            !active && rawAudience.length === 0 && savedAudience.length > 0
                ? savedAudience
                : rawAudience;

        const startTime: string =
            typeof data.startTime === "string" && data.startTime
                ? data.startTime
                : toTimeInput(date);
        const endTime: string =
            typeof data.endTime === "string"
                ? data.endTime
                : endDate
                  ? toTimeInput(endDate)
                  : "";
        return {
            id: d.id,
            title: data.title ?? "",
            audience: displayAudience,
            // "summary" was the name used in the first version
            description: data.description ?? data.summary ?? "",
            link: data.link ?? "",
            specialGuest: data.specialGuest ?? "",
            date,
            endDate,
            startTime,
            endTime,
            active,
            disableReason: typeof data.disableReason === "string" ? data.disableReason : "",
            disabledAt,
        };
    });
}
