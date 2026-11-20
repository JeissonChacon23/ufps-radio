// src/services/audienceService.ts
import {
    collection,
    doc,
    onSnapshot,
    serverTimestamp,
    setDoc,
    Timestamp,
    type Unsubscribe,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import type {
    ActiveListenerDevice,
    RegisteredAppUser,
    RegisteredUserInput,
    UserProfileType,
} from "../types";

/**
 * Same 150-second active presence window as `ListenerPresenceService.activeWindow = 150` in the iOS app.
 * The iOS app renews its heartbeat every 60 seconds while streaming live audio.
 */
export const ACTIVE_LISTENER_WINDOW_MS = 150_000;

const VALID_PROFILES = new Set<UserProfileType>([
    "estudiante",
    "egresado",
    "docente",
    "administrativo",
    "invitado",
    "externo",
]);

function toDate(value: unknown): Date | null {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    if (
        typeof value === "object" &&
        value !== null &&
        "seconds" in value &&
        typeof (value as { seconds: unknown }).seconds === "number"
    ) {
        return new Date((value as { seconds: number }).seconds * 1000);
    }
    return null;
}

function normalizeProfileType(raw: unknown): UserProfileType {
    if (raw === "personal_ufps") {
        return "docente";
    }
    if (typeof raw === "string" && VALID_PROFILES.has(raw as UserProfileType)) {
        return raw as UserProfileType;
    }
    return "invitado";
}

function extractString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

/**
 * Derives a friendly display name when a user document only has an email or UID.
 */
export function resolveDisplayName(name: string, email: string, uid: string): string {
    if (name.trim()) return name.trim();
    if (email.trim() && email.includes("@")) {
        const local = email.split("@")[0];
        const parts = local
            .replace(/[._-]+/g, " ")
            .replace(/\d+/g, " ")
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        if (parts.length > 0) {
            return parts
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" ");
        }
        return local;
    }
    return `Usuario ${uid.slice(0, 6)}`;
}

function splitUidAndDevice(docId: string, explicitUid?: unknown): { uid: string; deviceId: string } {
    if (typeof explicitUid === "string" && explicitUid.trim() !== "") {
        const prefix = `${explicitUid.trim()}_`;
        const deviceId = docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;
        return { uid: explicitUid.trim(), deviceId };
    }
    const lastUnderscore = docId.lastIndexOf("_");
    if (lastUnderscore > 0) {
        return {
            uid: docId.slice(0, lastUnderscore),
            deviceId: docId.slice(lastUnderscore + 1),
        };
    }
    return { uid: docId, deviceId: docId };
}

/**
 * RF05 / HU-03: Only counts users listening from the mobile app (platform "ios"),
 * never web or FM listeners, whose `lastSeen` heartbeat is within the 150-second window.
 */
export function isListenerActive(
    device: ActiveListenerDevice,
    nowMs: number = Date.now(),
): boolean {
    const platform = (device.platform || "ios").toLowerCase();
    if (platform !== "ios" && platform !== "app") {
        return false;
    }
    if (!device.lastSeen) return false;
    const elapsed = nowMs - device.lastSeen.getTime();
    return elapsed <= ACTIVE_LISTENER_WINDOW_MS;
}

export function subscribeToListeners(
    onData: (devices: ActiveListenerDevice[]) => void,
    onError?: (err: Error) => void,
): Unsubscribe {
    const ref = collection(db, "listeners");
    return onSnapshot(
        ref,
        (snapshot) => {
            const devices: ActiveListenerDevice[] = snapshot.docs.map((d) => {
                const data = d.data();
                const { uid, deviceId } = splitUidAndDevice(d.id, data.uid);
                const rawCareer = extractString(data.careerId) || null;
                const rawDept = extractString(data.departmentId) || null;

                let careerId = rawCareer;
                let departmentId = rawDept;
                if (careerId && careerId.startsWith("dept:")) {
                    departmentId = departmentId ?? careerId;
                    careerId = null;
                }

                const name =
                    extractString(data.name) ||
                    extractString(data.displayName) ||
                    extractString(data.fullName) ||
                    extractString(data.nombre);
                const email = extractString(data.email);

                return {
                    docId: d.id,
                    uid,
                    deviceId,
                    lastSeen: toDate(data.lastSeen),
                    expireAt: toDate(data.expireAt),
                    platform: typeof data.platform === "string" ? data.platform : "ios",
                    name: name || undefined,
                    email: email || undefined,
                    profileType: data.profileType ? normalizeProfileType(data.profileType) : undefined,
                    careerId,
                    departmentId,
                };
            });
            onData(devices);
        },
        (err) => {
            if (onError) onError(err);
        },
    );
}

export function subscribeToRegisteredUsers(
    onData: (users: RegisteredAppUser[]) => void,
    onError?: (err: Error) => void,
): Unsubscribe {
    const ref = collection(db, "users");
    return onSnapshot(
        ref,
        (snapshot) => {
            const users: RegisteredAppUser[] = snapshot.docs.map((d) => {
                const data = d.data();
                const profileType = normalizeProfileType(data.profileType);
                const rawCareer = extractString(data.careerId) || null;
                const rawDept = extractString(data.departmentId) || null;

                let careerId = rawCareer;
                let departmentId = rawDept;
                if (careerId && careerId.startsWith("dept:")) {
                    departmentId = departmentId ?? careerId;
                    careerId = null;
                }

                const firstName =
                    extractString(data.firstName) || extractString(data.nombres);
                const lastName =
                    extractString(data.lastName) || extractString(data.apellidos);
                const combinedFromParts = [firstName, lastName].filter(Boolean).join(" ").trim();
                const name =
                    combinedFromParts ||
                    extractString(data.name) ||
                    extractString(data.displayName) ||
                    extractString(data.fullName) ||
                    extractString(data.nombre);
                const email = extractString(data.email);
                const phone =
                    extractString(data.phone) ||
                    extractString(data.phoneNumber) ||
                    extractString(data.celular) ||
                    null;
                const studentCode =
                    extractString(data.studentCode) ||
                    extractString(data.codigoEstudiantil) ||
                    extractString(data.code) ||
                    null;
                const programCode =
                    extractString(data.programCode) ||
                    (studentCode && studentCode.length >= 3 ? studentCode.slice(0, 3) : null);

                return {
                    uid: d.id,
                    firstName: firstName || undefined,
                    lastName: lastName || undefined,
                    name,
                    email,
                    phone,
                    studentCode,
                    programCode,
                    profileType,
                    careerId,
                    careerName: extractString(data.careerName) || null,
                    departmentId,
                    department: extractString(data.department) || null,
                    faculty: extractString(data.faculty) || null,
                    campus:
                        data.campus === "ocana" || data.campus === "cucuta"
                            ? data.campus
                            : null,
                    level:
                        data.level === "posgrado" || data.level === "pregrado"
                            ? data.level
                            : null,
                    modality:
                        data.modality === "distancia" || data.modality === "presencial"
                            ? data.modality
                            : null,
                    createdAt: toDate(data.createdAt),
                    updatedAt: toDate(data.updatedAt),
                };
            });
            onData(users);
        },
        (err) => {
            if (onError) onError(err);
        },
    );
}

/**
 * Updates a user's profile information (name, email, profileType, careerId, careerName, departmentId, department, faculty) in Firestore.
 */
export async function updateRegisteredUser(
    uid: string,
    input: RegisteredUserInput,
): Promise<void> {
    const needsCareer =
        input.profileType === "estudiante" || input.profileType === "egresado";
    const needsDept = input.profileType === "docente";

    const cleanFirst = (input.firstName ?? "").trim();
    const cleanLast = (input.lastName ?? "").trim();
    const fullName = [cleanFirst, cleanLast].filter(Boolean).join(" ").trim() || input.name.trim();

    const payload: Record<string, unknown> = {
        firstName: cleanFirst || null,
        lastName: cleanLast || null,
        name: fullName,
        email: input.email.trim(),
        phone: (input.phone ?? "").trim() || null,
        studentCode: input.profileType === "estudiante" ? input.studentCode || null : null,
        programCode: needsCareer ? input.programCode || null : null,
        profileType: input.profileType,
        careerId: needsCareer ? input.careerId || null : null,
        careerName: needsCareer ? input.careerName || null : null,
        departmentId: needsCareer || needsDept ? input.departmentId || null : null,
        department: needsCareer || needsDept ? input.department || null : null,
        faculty: needsCareer || needsDept ? input.faculty || null : null,
        campus: needsCareer || needsDept ? input.campus || null : null,
        level: needsCareer ? input.level || null : null,
        modality: needsCareer ? input.modality || null : null,
        updatedAt: serverTimestamp(),
    };

    await setDoc(doc(db, "users", uid), payload, { merge: true });
}

export const PROFILE_TYPE_LABELS: Record<UserProfileType, string> = {
    estudiante: "Estudiante",
    egresado: "Egresado",
    docente: "Docente",
    administrativo: "Administrativo",
    invitado: "Invitado",
    externo: "Externo",
};
