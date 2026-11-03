// src/services/programsService.ts
import {
    addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type { Program, ProgramInput } from "../types";

const programsRef = collection(db, "programs");

export async function createProgram(input: ProgramInput): Promise<void> {
    await addDoc(programsRef, {
        ...input,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}

export async function updateProgram(id: string, input: ProgramInput): Promise<void> {
    await updateDoc(doc(db, "programs", id), {
        ...input,
        updatedAt: serverTimestamp(),
    });
}

export async function listPrograms(): Promise<Program[]> {
    const snapshot = await getDocs(programsRef);
    const programs = snapshot.docs.map((d) => {
        const data = d.data();
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
        } satisfies Program;
    });
    // Sorted on the client, so no Firestore index is needed.
    return programs.sort(
        (a, b) => a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name),
    );
}

export async function deleteProgram(id: string): Promise<void> {
    await deleteDoc(doc(db, "programs", id));
}