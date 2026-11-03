// src/services/careersService.ts
import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { CAREERS_SEED } from "../data/careersSeed";
import { slugify } from "../lib/text";
import type { Campus, Career, Modality } from "../types";

const careersRef = collection(db, "careers");

export interface CareerInput {
    name: string;
    faculty: string;
    campus: Campus;
    modality: Modality;
}

export async function listCareers(): Promise<Career[]> {
    const snapshot = await getDocs(careersRef);
    return snapshot.docs
        .map((d) => {
            const data = d.data();
            return {
                id: d.id,
                name: data.name ?? d.id,
                faculty: data.faculty ?? "Otras carreras",
                campus: data.campus ?? "cucuta",
                modality: data.modality ?? "presencial",
                active: data.active ?? true,
                order: data.order ?? 0,
            } satisfies Career;
        })
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

export async function createCareer(input: CareerInput, order: number): Promise<void> {
    const baseId = slugify(input.name);
    let id = baseId;
    let attempt = 2;
    while ((await getDoc(doc(careersRef, id))).exists()) {
        id = `${baseId}-${attempt}`;
        attempt += 1;
    }
    await setDoc(doc(careersRef, id), { ...input, active: true, order });
}

export async function updateCareer(id: string, input: CareerInput): Promise<void> {
    await updateDoc(doc(careersRef, id), { ...input });
}

export async function setCareerActive(id: string, active: boolean): Promise<void> {
    await updateDoc(doc(careersRef, id), { active });
}

// Creates only the missing careers, so it is safe to run more than once.
export async function seedCareers(): Promise<number> {
    const existing = new Set((await getDocs(careersRef)).docs.map((d) => d.id));
    const missing = CAREERS_SEED
        .map((career, index) => ({ ...career, order: index + 1 }))
        .filter((career) => !existing.has(career.id));

    if (missing.length === 0) return 0;

    const batch = writeBatch(db);
    for (const { id, ...rest } of missing) {
        batch.set(doc(careersRef, id), { ...rest, active: true });
    }
    await batch.commit();
    return missing.length;
}