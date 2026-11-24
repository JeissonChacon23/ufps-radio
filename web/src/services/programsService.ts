// src/services/programsService.ts
import {
    addDoc, collection, deleteField, doc, getDocs, serverTimestamp, Timestamp, updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Program, ProgramInput } from "../types";

const programsRef = collection(db, "programs");

export async function createProgram(input: ProgramInput): Promise<void> {
    await addDoc(programsRef, {
        ...input,
        disableReason: input.active ? "" : (input.disableReason ?? ""),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

export async function updateProgram(id: string, input: ProgramInput): Promise<void> {
    await updateDoc(doc(db, "programs", id), {
        ...input,
        ...(input.active ? { disableReason: "", disabledAt: deleteField() } : {}),
        updatedAt: serverTimestamp(),
    });
}

/** Soft-disables a program with an administrative observation (never hard-deletes). */
export async function disableProgram(id: string, reason: string): Promise<void> {
    await updateDoc(doc(db, "programs", id), {
        active: false,
        disableReason: reason.trim(),
        disabledAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

/** Re-enables a previously disabled program so it becomes visible again in the app. */
export async function enableProgram(id: string): Promise<void> {
    await updateDoc(doc(db, "programs", id), {
        active: true,
        disableReason: "",
        disabledAt: deleteField(),
        updatedAt: serverTimestamp(),
    });
}

export async function listPrograms(): Promise<Program[]> {
    const snapshot = await getDocs(programsRef);
    const programs = snapshot.docs.map((d) => {
        const data = d.data();
        const disabledAt = data.disabledAt ? (data.disabledAt as Timestamp).toDate() : null;
        return {
            id: d.id,
            name: data.name ?? "",
            days: data.days ?? [],
            startTime: data.startTime ?? "00:00",
            durationMinutes: data.durationMinutes ?? 60,
            collective: data.collective ?? "",
            hosts: data.hosts ?? [],
            active: data.active ?? true,
            artworkDriveId: data.artworkDriveId ?? "",
            disableReason: typeof data.disableReason === "string" ? data.disableReason : "",
            disabledAt,
        } satisfies Program;
    });
    // Sorted on the client, so no Firestore index is needed.
    return programs.sort(
        (a, b) => a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name),
    );
}