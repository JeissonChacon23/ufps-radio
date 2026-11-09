// src/services/careersService.ts
import {
    collection, doc, getDoc, getDocs, setDoc, updateDoc, writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { CAREERS_SEED, makeDepartmentId } from "../data/careersSeed";
import { slugify } from "../lib/text";
import type { AcademicLevel, Campus, Career, Modality } from "../types";

const careersRef = collection(db, "careers");
const SEED_MAP = new Map(CAREERS_SEED.map((s) => [s.id, s]));

export interface CareerInput {
    name: string;
    faculty: string;
    department: string;
    level: AcademicLevel;
    campus: Campus;
    modality: Modality;
}

export async function listCareers(): Promise<Career[]> {
    let snapshot = await getDocs(careersRef);

    // Auto-seed or auto-migrate legacy documents that lack department/posgrado entries
    const needsSync =
        snapshot.empty ||
        snapshot.docs.some((d) => !d.data().department || !d.data().departmentId);

    if (needsSync) {
        try {
            await seedCareers();
            snapshot = await getDocs(careersRef);
        } catch {
            // Continue with local fallback if offline or permission restricted
        }
    }

    return snapshot.docs
        .map((d) => {
            const data = d.data();
            const seed = SEED_MAP.get(d.id);
            const campus: Campus = data.campus ?? seed?.campus ?? "cucuta";
            const faculty: string = data.faculty ?? seed?.faculty ?? "Otras facultades";
            const department: string =
                data.department ?? seed?.department ?? `Departamento de ${faculty.replace(/^Facultad de\s+/i, "")}`;
            const departmentId: string =
                data.departmentId ?? seed?.departmentId ?? makeDepartmentId(department, campus);
            const level: AcademicLevel = data.level ?? seed?.level ?? "pregrado";

            return {
                id: d.id,
                name: data.name ?? seed?.name ?? d.id,
                faculty,
                department,
                departmentId,
                level,
                campus,
                modality: data.modality ?? seed?.modality ?? "presencial",
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
    const departmentId = makeDepartmentId(input.department, input.campus);
    await setDoc(doc(careersRef, id), {
        ...input,
        departmentId,
        active: true,
        order,
    });
}

export async function updateCareer(id: string, input: CareerInput): Promise<void> {
    const departmentId = makeDepartmentId(input.department, input.campus);
    await updateDoc(doc(careersRef, id), {
        ...input,
        departmentId,
    });
}

export async function setCareerActive(id: string, active: boolean): Promise<void> {
    await updateDoc(doc(careersRef, id), { active });
}

// Creates missing programs and upgrades legacy documents with department + level.
export async function seedCareers(): Promise<number> {
    const existingDocs = new Map((await getDocs(careersRef)).docs.map((d) => [d.id, d.data()]));
    const batch = writeBatch(db);
    let touched = 0;

    CAREERS_SEED.forEach((career, index) => {
        const order = index + 1;
        const { id, ...rest } = career;
        const current = existingDocs.get(id);
        if (!current) {
            batch.set(doc(careersRef, id), { ...rest, order, active: true });
            touched += 1;
        } else if (!current.department || !current.departmentId || !current.level) {
            batch.update(doc(careersRef, id), {
                department: current.department ?? rest.department,
                departmentId: current.departmentId ?? rest.departmentId,
                level: current.level ?? rest.level,
                order: current.order ?? order,
            });
            touched += 1;
        }
    });

    if (touched === 0) return 0;
    await batch.commit();
    return touched;
}
