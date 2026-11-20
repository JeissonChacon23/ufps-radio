// src/pages/Home.tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CAREERS_SEED, findCareerByStudentCode } from "../data/careersSeed";
import { careerGroup } from "../lib/careers";
import { formatTime12h, timeToMinutes, todayIsoWeekday } from "../lib/dates";
import { normalizeText } from "../lib/text";
import {
    isListenerActive,
    PROFILE_TYPE_LABELS,
    resolveDisplayName,
    subscribeToListeners,
    subscribeToRegisteredUsers,
    updateRegisteredUser,
} from "../services/audienceService";
import { listCareers } from "../services/careersService";
import { listPrograms } from "../services/programsService";
import type {
    AcademicLevel,
    ActiveListenerDevice,
    Career,
    Program,
    RegisteredAppUser,
    UserProfileType,
} from "../types";

type ViewMode = "users" | "faculties" | "careers";
type ListeningFilter = "all" | "listening";
type LevelFilter = "all" | AcademicLevel;
type ProfileFilter = "all" | UserProfileType;

interface EnrichedUser {
    uid: string;
    firstName: string;
    lastName: string;
    name: string;
    displayName: string;
    email: string;
    phone: string | null;
    studentCode: string | null;
    programCode: string | null;
    profileType: UserProfileType;
    profileLabel: string;
    careerId: string | null;
    careerName: string;
    level: AcademicLevel | null;
    departmentId: string | null;
    departmentName: string;
    facultyName: string;
    facultyGroupTitle: string;
    campus: "cucuta" | "ocana" | null;
    isListening: boolean;
    activeDevicesCount: number;
    lastSeen: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

interface EditUserForm {
    uid: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    studentCode: string;
    profileType: UserProfileType;
    careerId: string;
    departmentId: string;
}

function findProgramOnAir(programs: Program[], now: Date): Program | null {
    const isoDay = todayIsoWeekday(now);
    const prevDay = isoDay === 1 ? 7 : isoDay - 1;
    const currentMin = now.getHours() * 60 + now.getMinutes();

    const active = programs.filter((p) => {
        if (!p.active) return false;
        const start = timeToMinutes(p.startTime);
        if (start < 0) return false;
        const end = start + p.durationMinutes;
        if (p.days.includes(isoDay) && currentMin >= start && currentMin < end) {
            return true;
        }
        return p.days.includes(prevDay) && end > 1440 && currentMin + 1440 < end;
    });

    if (active.length === 0) return null;
    return active.reduce((best, curr) => {
        const bestStart = timeToMinutes(best.startTime);
        const currStart = timeToMinutes(curr.startTime);
        if (currStart !== bestStart) return currStart > bestStart ? curr : best;
        return curr.durationMinutes < best.durationMinutes ? curr : best;
    });
}

function formatRelativeAgo(date: Date | null, nowMs: number): string {
    if (!date) return "—";
    const diffSec = Math.max(0, Math.floor((nowMs - date.getTime()) / 1000));
    if (diffSec < 15) return "hace instantes";
    if (diffSec < 60) return `hace ${diffSec} s`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `hace ${mins} min`;
    return date.toLocaleString("es-CO", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getInitials(displayName: string): string {
    const words = displayName.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return "U";
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

export default function Home() {
    const [careers, setCareers] = useState<Career[]>([]);
    const [programs, setPrograms] = useState<Program[]>([]);
    const [registeredUsers, setRegisteredUsers] = useState<RegisteredAppUser[]>([]);
    const [listenerDevices, setListenerDevices] = useState<ActiveListenerDevice[]>([]);
    const [nowMs, setNowMs] = useState<number>(() => Date.now());
    const [loadingUsers, setLoadingUsers] = useState(true);
    const [loadingListeners, setLoadingListeners] = useState(true);
    const [error, setError] = useState("");
    const [statusMessage, setStatusMessage] = useState("");

    // Clean, compact UI state
    const [viewMode, setViewMode] = useState<ViewMode>("users");
    const [listeningFilter, setListeningFilter] = useState<ListeningFilter>("all");
    const [showFiltersPopup, setShowFiltersPopup] = useState(false);
    const [facultyFilter, setFacultyFilter] = useState<string>("all");
    const [careerFilter, setCareerFilter] = useState<string>("all");
    const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
    const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");
    const [search, setSearch] = useState<string>("");
    const [expandedFaculties, setExpandedFaculties] = useState<Record<string, boolean>>({});

    // Edit user popup modal state
    const [editingUser, setEditingUser] = useState<EditUserForm | null>(null);
    const [savingUser, setSavingUser] = useState(false);
    const [editError, setEditError] = useState("");

    useEffect(() => {
        listCareers()
            .then(setCareers)
            .catch(() => {
                setCareers(
                    CAREERS_SEED.map((c, idx) => ({
                        ...c,
                        active: true,
                        order: idx + 1,
                    })),
                );
            });
        listPrograms().then(setPrograms).catch(() => {});
    }, []);

    useEffect(() => {
        const unsubListeners = subscribeToListeners(
            (devices) => {
                setListenerDevices(devices);
                setLoadingListeners(false);
            },
            () => {
                setError("No se pudo suscribir en tiempo real a los oyentes activos.");
                setLoadingListeners(false);
            },
        );

        const unsubUsers = subscribeToRegisteredUsers(
            (users) => {
                setRegisteredUsers(users);
                setLoadingUsers(false);
            },
            () => {
                setError("No se pudo suscribir en tiempo real a los usuarios registrados.");
                setLoadingUsers(false);
            },
        );

        const timer = window.setInterval(() => {
            setNowMs(Date.now());
        }, 5_000);

        return () => {
            unsubListeners();
            unsubUsers();
            window.clearInterval(timer);
        };
    }, []);

    // Close popup on Escape key
    useEffect(() => {
        if (!editingUser) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setEditingUser(null);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [editingUser]);

    const allCatalogCareers = useMemo(() => {
        return careers.length > 0
            ? careers
            : CAREERS_SEED.map((c, idx) => ({ ...c, active: true, order: idx + 1 }));
    }, [careers]);

    const { careerById, departmentById, allDepartments } = useMemo(() => {
        const cMap = new Map<string, Career>();
        const dMap = new Map<
            string,
            {
                departmentId: string;
                department: string;
                faculty: string;
                facultyGroupTitle: string;
                campus: "cucuta" | "ocana";
            }
        >();

        for (const c of allCatalogCareers) {
            cMap.set(c.id, c);
            if (c.departmentId && !dMap.has(c.departmentId)) {
                dMap.set(c.departmentId, {
                    departmentId: c.departmentId,
                    department: c.department,
                    faculty: c.faculty,
                    facultyGroupTitle: careerGroup(c),
                    campus: c.campus,
                });
            }
        }
        for (const s of CAREERS_SEED) {
            if (!cMap.has(s.id)) {
                cMap.set(s.id, { ...s, active: true, order: 999 });
            }
            if (s.departmentId && !dMap.has(s.departmentId)) {
                dMap.set(s.departmentId, {
                    departmentId: s.departmentId,
                    department: s.department,
                    faculty: s.faculty,
                    facultyGroupTitle: s.campus === "ocana" ? `Ocaña · ${s.faculty}` : s.faculty,
                    campus: s.campus,
                });
            }
        }

        const depts = [...dMap.values()].sort(
            (a, b) =>
                a.facultyGroupTitle.localeCompare(b.facultyGroupTitle) ||
                a.department.localeCompare(b.department),
        );

        return { careerById: cMap, departmentById: dMap, allDepartments: depts };
    }, [allCatalogCareers]);

    const activeDevices = useMemo(
        () => listenerDevices.filter((d) => isListenerActive(d, nowMs)),
        [listenerDevices, nowMs],
    );

    const activeByUid = useMemo(() => {
        const map = new Map<
            string,
            {
                count: number;
                lastSeen: Date | null;
                name?: string;
                email?: string;
                profileType?: UserProfileType;
                careerId?: string | null;
                departmentId?: string | null;
            }
        >();

        for (const dev of activeDevices) {
            const prev = map.get(dev.uid);
            const latestSeen =
                !prev?.lastSeen || (dev.lastSeen && dev.lastSeen > prev.lastSeen)
                    ? dev.lastSeen
                    : prev.lastSeen;
            map.set(dev.uid, {
                count: (prev?.count ?? 0) + 1,
                lastSeen: latestSeen,
                name: prev?.name ?? dev.name,
                email: prev?.email ?? dev.email,
                profileType: prev?.profileType ?? dev.profileType,
                careerId: prev?.careerId ?? dev.careerId,
                departmentId: prev?.departmentId ?? dev.departmentId,
            });
        }
        return map;
    }, [activeDevices]);

    const enrichedUsers = useMemo<EnrichedUser[]>(() => {
        const regMap = new Map<string, RegisteredAppUser>();
        for (const u of registeredUsers) {
            regMap.set(u.uid, u);
        }
        for (const [uid, activeInfo] of activeByUid.entries()) {
            if (!regMap.has(uid)) {
                regMap.set(uid, {
                    uid,
                    name: activeInfo.name ?? "",
                    email: activeInfo.email ?? "",
                    profileType: activeInfo.profileType ?? "invitado",
                    careerId: activeInfo.careerId ?? null,
                    departmentId: activeInfo.departmentId ?? null,
                    createdAt: null,
                    updatedAt: activeInfo.lastSeen,
                });
            }
        }

        const list: EnrichedUser[] = [];
        for (const u of regMap.values()) {
            const activeInfo = activeByUid.get(u.uid);
            const effectiveCareerId = u.careerId ?? activeInfo?.careerId ?? null;
            const effectiveDeptId = u.departmentId ?? activeInfo?.departmentId ?? null;
            const effectiveName = u.name || activeInfo?.name || "";
            const effectiveEmail = u.email || activeInfo?.email || "";
            const studentCode = u.studentCode ?? null;
            const programCode =
                u.programCode ?? (studentCode && studentCode.length >= 3 ? studentCode.slice(0, 3) : null);

            const careerByCode =
                studentCode || programCode
                    ? findCareerByStudentCode(studentCode ?? programCode ?? "", allCatalogCareers)
                    : null;
            const career =
                (effectiveCareerId ? careerById.get(effectiveCareerId) : undefined) ??
                careerByCode;
            const deptFromId = effectiveDeptId ? departmentById.get(effectiveDeptId) ?? null : null;

            const careerName = career
                ? career.name
                : u.careerName
                  ? u.careerName
                  : effectiveCareerId
                    ? effectiveCareerId
                    : u.profileType === "docente"
                      ? deptFromId?.department ?? u.department ?? "Docente"
                      : u.profileType === "administrativo"
                        ? "Administrativo"
                        : u.profileType === "invitado"
                          ? "Invitado"
                          : u.profileType === "externo"
                            ? "Externo"
                            : "Sin carrera asignada";

            const departmentName = career
                ? career.department
                : deptFromId
                  ? deptFromId.department
                  : u.department
                    ? u.department
                    : effectiveDeptId
                      ? effectiveDeptId.replace(/^dept:/, "")
                      : u.profileType === "administrativo"
                        ? "Dependencia administrativa"
                        : u.profileType === "invitado" || u.profileType === "externo"
                          ? "Comunidad externa"
                          : "Sin departamento";

            const facultyName = career
                ? career.faculty
                : deptFromId
                  ? deptFromId.faculty
                  : u.faculty
                    ? u.faculty
                    : u.profileType === "administrativo"
                      ? "Administración UFPS"
                      : u.profileType === "invitado" || u.profileType === "externo"
                        ? "Comunidad general"
                        : "Sin facultad";

            const facultyGroupTitle = career
                ? careerGroup(career)
                : deptFromId
                  ? deptFromId.facultyGroupTitle
                  : u.campus === "ocana" && facultyName
                    ? `Ocaña · ${facultyName}`
                    : facultyName;

            const displayName = resolveDisplayName(effectiveName, effectiveEmail, u.uid);

            list.push({
                uid: u.uid,
                firstName: u.firstName ?? "",
                lastName: u.lastName ?? "",
                name: effectiveName,
                displayName,
                email: effectiveEmail,
                phone: u.phone ?? null,
                studentCode,
                programCode: career?.code ?? programCode,
                profileType: u.profileType,
                profileLabel: PROFILE_TYPE_LABELS[u.profileType],
                careerId: career?.id ?? effectiveCareerId,
                careerName,
                level: career?.level ?? u.level ?? null,
                departmentId: career?.departmentId ?? deptFromId?.departmentId ?? effectiveDeptId,
                departmentName,
                facultyName,
                facultyGroupTitle,
                campus: career?.campus ?? deptFromId?.campus ?? u.campus ?? null,
                isListening: Boolean(activeInfo),
                activeDevicesCount: activeInfo?.count ?? 0,
                lastSeen: activeInfo?.lastSeen ?? null,
                createdAt: u.createdAt,
                updatedAt: u.updatedAt,
            });
        }

        return list.sort((a, b) => {
            if (a.isListening !== b.isListening) return a.isListening ? -1 : 1;
            return a.displayName.localeCompare(b.displayName);
        });
    }, [registeredUsers, activeByUid, careerById, departmentById, allCatalogCareers]);

    const facultyOptions = useMemo(() => {
        const set = new Set<string>();
        for (const c of allCatalogCareers) {
            set.add(careerGroup(c));
        }
        return [...set].sort((a, b) => a.localeCompare(b));
    }, [allCatalogCareers]);

    const careerOptions = useMemo(() => {
        return allCatalogCareers
            .filter((c) => {
                if (facultyFilter !== "all" && careerGroup(c) !== facultyFilter) return false;
                if (levelFilter !== "all" && c.level !== levelFilter) return false;
                return true;
            })
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [allCatalogCareers, facultyFilter, levelFilter]);

    const filteredUsers = useMemo(() => {
        const term = normalizeText(search.trim());
        return enrichedUsers.filter((u) => {
            if (listeningFilter === "listening" && !u.isListening) return false;
            if (profileFilter !== "all" && u.profileType !== profileFilter) return false;
            if (facultyFilter !== "all" && u.facultyGroupTitle !== facultyFilter) return false;
            if (careerFilter !== "all" && u.careerId !== careerFilter) return false;
            if (levelFilter !== "all" && u.level !== levelFilter) return false;
            if (term !== "") {
                const haystack = normalizeText(
                    `${u.displayName} ${u.name} ${u.email} ${u.studentCode ?? ""} ${u.programCode ?? ""} ${u.uid} ${u.profileLabel} ${u.careerName} ${u.departmentName} ${u.facultyGroupTitle}`,
                );
                if (!haystack.includes(term)) return false;
            }
            return true;
        });
    }, [
        enrichedUsers,
        listeningFilter,
        profileFilter,
        facultyFilter,
        careerFilter,
        levelFilter,
        search,
    ]);

    const totalListeningUsers = useMemo(
        () => enrichedUsers.filter((u) => u.isListening).length,
        [enrichedUsers],
    );
    const totalRegisteredUsers = enrichedUsers.length;

    const careerStats = useMemo(() => {
        const term = normalizeText(search.trim());
        return allCatalogCareers
            .filter((c) => {
                if (facultyFilter !== "all" && careerGroup(c) !== facultyFilter) return false;
                if (careerFilter !== "all" && c.id !== careerFilter) return false;
                if (levelFilter !== "all" && c.level !== levelFilter) return false;
                if (term !== "") {
                    const hay = normalizeText(`${c.name} ${c.department} ${careerGroup(c)}`);
                    if (!hay.includes(term)) return false;
                }
                return true;
            })
            .map((c) => {
                const usersInCareer = enrichedUsers.filter(
                    (u) =>
                        u.careerId === c.id &&
                        (profileFilter === "all" || u.profileType === profileFilter),
                );
                const listening = usersInCareer.filter((u) => u.isListening).length;
                return {
                    career: c,
                    facultyGroupTitle: careerGroup(c),
                    listening,
                    registered: usersInCareer.length,
                };
            })
            .filter((item) => (listeningFilter === "listening" ? item.listening > 0 : true))
            .sort((a, b) => {
                if (b.listening !== a.listening) return b.listening - a.listening;
                if (b.registered !== a.registered) return b.registered - a.registered;
                return a.career.name.localeCompare(b.career.name);
            });
    }, [
        allCatalogCareers,
        enrichedUsers,
        facultyFilter,
        careerFilter,
        levelFilter,
        profileFilter,
        listeningFilter,
        search,
    ]);

    const facultyStats = useMemo(() => {
        const term = normalizeText(search.trim());
        const map = new Map<
            string,
            {
                title: string;
                listening: number;
                registered: number;
                programs: {
                    career: Career;
                    listening: number;
                    registered: number;
                }[];
            }
        >();

        for (const c of allCatalogCareers) {
            if (facultyFilter !== "all" && careerGroup(c) !== facultyFilter) continue;
            if (levelFilter !== "all" && c.level !== levelFilter) continue;
            if (careerFilter !== "all" && c.id !== careerFilter) continue;

            const title = careerGroup(c);
            let entry = map.get(title);
            if (!entry) {
                entry = { title, listening: 0, registered: 0, programs: [] };
                map.set(title, entry);
            }

            const careerUsers = enrichedUsers.filter(
                (u) =>
                    u.careerId === c.id &&
                    (profileFilter === "all" || u.profileType === profileFilter),
            );
            entry.programs.push({
                career: c,
                listening: careerUsers.filter((u) => u.isListening).length,
                registered: careerUsers.length,
            });
        }

        for (const entry of map.values()) {
            const facUsers = enrichedUsers.filter(
                (u) =>
                    u.facultyGroupTitle === entry.title &&
                    (profileFilter === "all" || u.profileType === profileFilter) &&
                    (careerFilter === "all" || u.careerId === careerFilter) &&
                    (levelFilter === "all" || u.level === levelFilter),
            );
            entry.listening = facUsers.filter((u) => u.isListening).length;
            entry.registered = facUsers.length;
            entry.programs.sort(
                (a, b) =>
                    b.listening - a.listening ||
                    b.registered - a.registered ||
                    a.career.name.localeCompare(b.career.name),
            );
        }

        return [...map.values()]
            .filter((f) => {
                if (listeningFilter === "listening" && f.listening === 0) return false;
                if (term !== "") {
                    const progMatch = f.programs.some((p) =>
                        normalizeText(`${p.career.name} ${p.career.department}`).includes(term),
                    );
                    if (!normalizeText(f.title).includes(term) && !progMatch) return false;
                }
                return true;
            })
            .sort(
                (a, b) =>
                    b.listening - a.listening ||
                    b.registered - a.registered ||
                    a.title.localeCompare(b.title),
            );
    }, [
        allCatalogCareers,
        enrichedUsers,
        facultyFilter,
        levelFilter,
        careerFilter,
        profileFilter,
        listeningFilter,
        search,
    ]);

    const onAirProgram = useMemo(
        () => findProgramOnAir(programs, new Date(nowMs)),
        [programs, nowMs],
    );

    const activeFilterCount = [
        facultyFilter !== "all",
        careerFilter !== "all",
        levelFilter !== "all",
        profileFilter !== "all",
    ].filter(Boolean).length;

    const resetFilters = () => {
        setListeningFilter("all");
        setFacultyFilter("all");
        setCareerFilter("all");
        setLevelFilter("all");
        setProfileFilter("all");
        setSearch("");
    };

    const toggleFacultyExpand = (title: string) => {
        setExpandedFaculties((prev) => ({ ...prev, [title]: !prev[title] }));
    };

    const openEditModal = (user: EnrichedUser) => {
        setEditError("");
        setStatusMessage("");
        let first = user.firstName.trim();
        let last = user.lastName.trim();
        if (!first && !last) {
            const base = (user.name || user.displayName).trim();
            const parts = base.split(/\s+/).filter(Boolean);
            if (parts.length > 1) {
                first = parts.slice(0, Math.ceil(parts.length / 2)).join(" ");
                last = parts.slice(Math.ceil(parts.length / 2)).join(" ");
            } else {
                first = base;
            }
        }
        setEditingUser({
            uid: user.uid,
            firstName: first,
            lastName: last,
            email: user.email,
            phone: user.phone ?? "",
            studentCode: user.studentCode ?? "",
            profileType: user.profileType,
            careerId: user.careerId ?? "",
            departmentId: user.departmentId ?? "",
        });
    };

    const handleSaveUser = async (e: FormEvent) => {
        e.preventDefault();
        if (!editingUser) return;
        setEditError("");

        const cleanFirst = editingUser.firstName.trim();
        const cleanLast = editingUser.lastName.trim();
        if (!cleanFirst || !cleanLast) {
            setEditError("Escribe el nombre y los apellidos del usuario en sus respectivos campos.");
            return;
        }
        const cleanName = `${cleanFirst} ${cleanLast}`;

        const cleanStudentCode = editingUser.studentCode.replace(/\D+/g, "");
        if (editingUser.profileType === "estudiante") {
            if (cleanStudentCode.length !== 7) {
                setEditError(
                    "El código estudiantil debe tener exactamente 7 dígitos numéricos (ej. 1151594).",
                );
                return;
            }
        }

        const autoDetectedCareer =
            editingUser.profileType === "estudiante" && cleanStudentCode.length >= 3
                ? findCareerByStudentCode(cleanStudentCode, allCatalogCareers)
                : null;

        const effectiveCareerId =
            autoDetectedCareer?.id || editingUser.careerId;

        const needsCareer =
            editingUser.profileType === "estudiante" || editingUser.profileType === "egresado";
        const needsDept = editingUser.profileType === "docente";

        if (needsCareer && !effectiveCareerId) {
            setEditError(
                editingUser.profileType === "estudiante"
                    ? `No se encontró una carrera con el código ${cleanStudentCode.slice(0, 3)}. Verifica el código estudiantil.`
                    : "Selecciona la carrera o programa académico del usuario.",
            );
            return;
        }
        if (needsDept && !editingUser.departmentId) {
            setEditError("Selecciona el departamento al que pertenece el docente/personal.");
            return;
        }

        const selectedCareer = effectiveCareerId
            ? careerById.get(effectiveCareerId) ?? null
            : null;
        const selectedDept = editingUser.departmentId
            ? departmentById.get(editingUser.departmentId) ?? null
            : null;
        const resolvedDeptId = needsCareer
            ? selectedCareer?.departmentId ?? null
            : needsDept
              ? editingUser.departmentId
              : null;

        setSavingUser(true);
        try {
            await updateRegisteredUser(editingUser.uid, {
                firstName: cleanFirst,
                lastName: cleanLast,
                name: cleanName,
                email: editingUser.email.trim(),
                phone: editingUser.phone.replace(/\D+/g, "") || null,
                studentCode: editingUser.profileType === "estudiante" ? cleanStudentCode : null,
                programCode: needsCareer ? selectedCareer?.code ?? cleanStudentCode.slice(0, 3) : null,
                profileType: editingUser.profileType,
                careerId: needsCareer ? effectiveCareerId : null,
                careerName: needsCareer ? selectedCareer?.name ?? null : null,
                departmentId: resolvedDeptId,
                department: needsCareer
                    ? selectedCareer?.department ?? null
                    : needsDept
                      ? selectedDept?.department ?? null
                      : null,
                faculty: needsCareer
                    ? selectedCareer?.faculty ?? null
                    : needsDept
                      ? selectedDept?.faculty ?? null
                      : null,
                campus: needsCareer
                    ? selectedCareer?.campus ?? null
                    : needsDept
                      ? selectedDept?.campus ?? null
                      : null,
                level: needsCareer ? selectedCareer?.level ?? null : null,
                modality: needsCareer ? selectedCareer?.modality ?? null : null,
            });
            setEditingUser(null);
            setStatusMessage(`Información de "${cleanName}" actualizada.`);
        } catch {
            setEditError("No se pudieron guardar los cambios en Firestore.");
        } finally {
            setSavingUser(false);
        }
    };

    return (
        <>
            {/* Compact Header Card: RF05 / HU-03 Real-Time App Listeners */}
            <div className="card audience-compact-header">
                <div className="audience-compact-main">
                    <div className="audience-counter-block">
                        <div className="audience-big-number">
                            {loadingListeners ? "…" : totalListeningUsers}
                        </div>
                        <div>
                            <div className="row" style={{ gap: "8px", marginBottom: "2px" }}>
                                <span className="audience-live-badge">
                                    <span className="brand-dot" aria-hidden="true" />
                                    EN TIEMPO REAL · SOLO APP
                                </span>
                                {onAirProgram && (
                                    <span className="tag active-day">
                                        AL AIRE: {onAirProgram.name} ({formatTime12h(onAirProgram.startTime)})
                                    </span>
                                )}
                            </div>
                            <h2 style={{ margin: 0 }}>
                                {totalListeningUsers === 1
                                    ? "1 usuario escuchando en la app"
                                    : `${totalListeningUsers} usuarios escuchando en la app`}
                            </h2>
                            <small className="muted">
                                RF05 · HU-03: Conteo en vivo exclusivo de la app móvil (no cuenta web ni FM) ·{" "}
                                <strong>{loadingUsers ? "…" : totalRegisteredUsers}</strong> usuarios registrados en total.
                            </small>
                        </div>
                    </div>

                    <div className="audience-quick-actions">
                        <button
                            type="button"
                            className={listeningFilter === "listening" ? "" : "ghost"}
                            onClick={() =>
                                setListeningFilter((prev) =>
                                    prev === "listening" ? "all" : "listening",
                                )
                            }
                        >
                            ● Escuchando ahora ({totalListeningUsers})
                        </button>
                        <button
                            type="button"
                            className={listeningFilter === "all" ? "" : "ghost"}
                            onClick={() => setListeningFilter("all")}
                        >
                            Todos los registrados ({totalRegisteredUsers})
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="card" style={{ gridColumn: "1 / -1" }}>
                    <p className="error">{error}</p>
                </div>
            )}
            {statusMessage && (
                <div className="card" style={{ gridColumn: "1 / -1", padding: "12px 16px" }}>
                    <p className="ok">{statusMessage}</p>
                </div>
            )}

            {/* Clean Unified Bar: 3 Tabs + Search + Popup Filter Trigger */}
            <div className="audience-nav-bar">
                <div className="chips" style={{ marginBottom: 0 }}>
                    <button
                        type="button"
                        className={`chip ${viewMode === "users" ? "active" : ""}`}
                        onClick={() => setViewMode("users")}
                    >
                        Usuarios <small>{filteredUsers.length}</small>
                    </button>
                    <button
                        type="button"
                        className={`chip ${viewMode === "faculties" ? "active" : ""}`}
                        onClick={() => setViewMode("faculties")}
                    >
                        Por Facultades <small>{facultyStats.length}</small>
                    </button>
                    <button
                        type="button"
                        className={`chip ${viewMode === "careers" ? "active" : ""}`}
                        onClick={() => setViewMode("careers")}
                    >
                        Por Carreras y Programas <small>{careerStats.length}</small>
                    </button>
                </div>

                <div className="audience-search-actions">
                    <input
                        className="search"
                        type="search"
                        placeholder="Buscar por nombre, correo, carrera o facultad…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <button
                        type="button"
                        className={activeFilterCount > 0 ? "" : "ghost"}
                        onClick={() => setShowFiltersPopup(true)}
                    >
                        Filtrar{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
                    </button>
                    {(activeFilterCount > 0 || listeningFilter !== "all" || search !== "") && (
                        <button type="button" className="ghost" onClick={resetFilters}>
                            Limpiar
                        </button>
                    )}
                </div>
            </div>

            {/* Active Filter Pills (only shown when a filter is active) */}
            {activeFilterCount > 0 && (
                <div className="chips" style={{ marginTop: "-4px" }}>
                    {facultyFilter !== "all" && (
                        <span className="tag">
                            Facultad: {facultyFilter}{" "}
                            <button
                                type="button"
                                className="tag-close"
                                onClick={() => setFacultyFilter("all")}
                            >
                                ×
                            </button>
                        </span>
                    )}
                    {careerFilter !== "all" && (
                        <span className="tag">
                            Programa: {careerById.get(careerFilter)?.name ?? careerFilter}{" "}
                            <button
                                type="button"
                                className="tag-close"
                                onClick={() => setCareerFilter("all")}
                            >
                                ×
                            </button>
                        </span>
                    )}
                    {levelFilter !== "all" && (
                        <span className="tag">
                            Nivel: {levelFilter === "posgrado" ? "Posgrado" : "Pregrado"}{" "}
                            <button
                                type="button"
                                className="tag-close"
                                onClick={() => setLevelFilter("all")}
                            >
                                ×
                            </button>
                        </span>
                    )}
                    {profileFilter !== "all" && (
                        <span className="tag">
                            Vínculo: {PROFILE_TYPE_LABELS[profileFilter]}{" "}
                            <button
                                type="button"
                                className="tag-close"
                                onClick={() => setProfileFilter("all")}
                            >
                                ×
                            </button>
                        </span>
                    )}
                </div>
            )}

            {/* VIEW 1: USUARIOS (Clean table showing user Name, Email, Status, Career/Program, Faculty, and Edit Popup button) */}
            {viewMode === "users" && (
                <div className="card" style={{ gridColumn: "1 / -1" }}>
                    {filteredUsers.length === 0 ? (
                        <p className="empty">
                            {listeningFilter === "listening"
                                ? "En este momento no hay usuarios escuchando con estos filtros."
                                : "No hay usuarios registrados que coincidan con la búsqueda."}
                        </p>
                    ) : (
                        <div className="user-table-wrap">
                            <table className="user-table">
                                <thead>
                                    <tr>
                                        <th>Nombre del usuario</th>
                                        <th>Estado</th>
                                        <th>Vínculo</th>
                                        <th>Carrera / Programa</th>
                                        <th>Facultad</th>
                                        <th style={{ textAlign: "right" }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.map((u) => (
                                        <tr key={u.uid}>
                                            <td>
                                                <div className="user-identity">
                                                    <span
                                                        className={`user-avatar ${u.isListening ? "live" : ""}`}
                                                    >
                                                        {getInitials(u.displayName)}
                                                    </span>
                                                    <div>
                                                        <strong>{u.displayName}</strong>
                                                        <div className="muted" style={{ fontSize: "12px" }}>
                                                            {u.email || `ID: ${u.uid.slice(0, 10)}…`}
                                                            {u.phone && <> · Tel: {u.phone}</>}
                                                            {u.studentCode && (
                                                                <> · <strong>Cód: {u.studentCode}</strong></>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                {u.isListening ? (
                                                    <div>
                                                        <span className="tag active-day">
                                                            ● Escuchando
                                                        </span>
                                                        <div className="muted" style={{ fontSize: "11px", marginTop: "2px" }}>
                                                            {formatRelativeAgo(u.lastSeen, nowMs)}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="tag off">Registrado</span>
                                                )}
                                            </td>
                                            <td>{u.profileLabel}</td>
                                            <td>
                                                <div>{u.careerName}</div>
                                                {u.level && (
                                                    <small className="muted">
                                                        {u.level === "posgrado" ? "Posgrado" : "Pregrado"}
                                                    </small>
                                                )}
                                            </td>
                                            <td>
                                                <div>{u.facultyGroupTitle}</div>
                                                <small className="muted">{u.departmentName}</small>
                                            </td>
                                            <td style={{ textAlign: "right" }}>
                                                <button
                                                    type="button"
                                                    className="ghost btn-sm"
                                                    onClick={() => openEditModal(u)}
                                                >
                                                    Editar
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* VIEW 2: POR FACULTADES (Collapsible cards so the page stays clean and compact) */}
            {viewMode === "faculties" && (
                <div className="card" style={{ gridColumn: "1 / -1", gap: "8px" }}>
                    {facultyStats.length === 0 && (
                        <p className="empty">No hay facultades para los filtros seleccionados.</p>
                    )}

                    {facultyStats.map((fac) => {
                        const isExpanded = Boolean(expandedFaculties[fac.title]);
                        return (
                            <div className="accordion-item" key={fac.title}>
                                <div
                                    className="accordion-header"
                                    onClick={() => toggleFacultyExpand(fac.title)}
                                    role="button"
                                    tabIndex={0}
                                >
                                    <div>
                                        <strong>{fac.title}</strong>
                                        <span className="muted" style={{ marginLeft: "10px", fontSize: "13px" }}>
                                            ({fac.programs.length} programas)
                                        </span>
                                    </div>
                                    <div className="row">
                                        <span className={fac.listening > 0 ? "tag active-day" : "tag off"}>
                                            {fac.listening} escuchando
                                        </span>
                                        <span className="tag">{fac.registered} registrados</span>
                                        <button
                                            type="button"
                                            className="ghost btn-sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setFacultyFilter(fac.title);
                                                setCareerFilter("all");
                                                setViewMode("users");
                                            }}
                                        >
                                            Ver usuarios
                                        </button>
                                        <span className="muted" style={{ fontWeight: 700 }}>
                                            {isExpanded ? "▾" : "▸"}
                                        </span>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="accordion-body">
                                        {fac.programs.map(({ career, listening, registered }) => (
                                            <div className="list-row" key={career.id}>
                                                <div className="row">
                                                    <span>{career.name}</span>
                                                    <span className="tag">
                                                        {career.level === "posgrado" ? "Posgrado" : "Pregrado"}
                                                    </span>
                                                </div>
                                                <div className="row">
                                                    <span className={listening > 0 ? "tag active-day" : "tag off"}>
                                                        {listening} escuchando
                                                    </span>
                                                    <span className="tag">{registered} registrados</span>
                                                    <button
                                                        type="button"
                                                        className="ghost btn-sm"
                                                        onClick={() => {
                                                            setFacultyFilter(fac.title);
                                                            setCareerFilter(career.id);
                                                            setViewMode("users");
                                                        }}
                                                    >
                                                        Ver usuarios
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* VIEW 3: POR CARRERAS Y PROGRAMAS (Clean compact table) */}
            {viewMode === "careers" && (
                <div className="card" style={{ gridColumn: "1 / -1" }}>
                    {careerStats.length === 0 ? (
                        <p className="empty">No hay carreras o programas para este filtro.</p>
                    ) : (
                        <div className="user-table-wrap">
                            <table className="user-table">
                                <thead>
                                    <tr>
                                        <th>Carrera / Programa académico</th>
                                        <th>Nivel</th>
                                        <th>Facultad</th>
                                        <th>Escuchando ahora</th>
                                        <th>Registrados</th>
                                        <th style={{ textAlign: "right" }}>Acción</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {careerStats.map(({ career, facultyGroupTitle, listening, registered }) => (
                                        <tr key={career.id}>
                                            <td>
                                                <strong>{career.name}</strong>
                                                <div className="muted" style={{ fontSize: "12px" }}>
                                                    {career.department}
                                                </div>
                                            </td>
                                            <td>
                                                <span className="tag">
                                                    {career.level === "posgrado" ? "Posgrado" : "Pregrado"}
                                                </span>
                                            </td>
                                            <td>{facultyGroupTitle}</td>
                                            <td>
                                                <span className={listening > 0 ? "tag active-day" : "tag off"}>
                                                    {listening} escuchando
                                                </span>
                                            </td>
                                            <td>
                                                <span className="tag">{registered} registrados</span>
                                            </td>
                                            <td style={{ textAlign: "right" }}>
                                                <button
                                                    type="button"
                                                    className="ghost btn-sm"
                                                    onClick={() => {
                                                        setCareerFilter(career.id);
                                                        setViewMode("users");
                                                    }}
                                                >
                                                    Ver usuarios ({registered})
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* POPUP 1: FILTROS AVANZADOS (So filters don't clutter the page) */}
            {showFiltersPopup && (
                <div
                    className="modal-backdrop"
                    onClick={() => setShowFiltersPopup(false)}
                >
                    <div
                        className="card modal-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="section-head">
                            <h2 style={{ margin: 0 }}>Filtrar audiencia y usuarios</h2>
                            <button
                                type="button"
                                className="ghost btn-sm"
                                onClick={() => setShowFiltersPopup(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <label>
                            Estado
                            <select
                                value={listeningFilter}
                                onChange={(e) =>
                                    setListeningFilter(e.target.value as ListeningFilter)
                                }
                            >
                                <option value="all">
                                    Todos los registrados ({totalRegisteredUsers})
                                </option>
                                <option value="listening">
                                    Solo escuchando ahora en vivo ({totalListeningUsers})
                                </option>
                            </select>
                        </label>

                        <label>
                            Facultad
                            <select
                                value={facultyFilter}
                                onChange={(e) => {
                                    setFacultyFilter(e.target.value);
                                    setCareerFilter("all");
                                }}
                            >
                                <option value="all">Todas las facultades</option>
                                {facultyOptions.map((f) => (
                                    <option key={f} value={f}>
                                        {f}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Nivel académico
                            <select
                                value={levelFilter}
                                onChange={(e) => {
                                    setLevelFilter(e.target.value as LevelFilter);
                                    setCareerFilter("all");
                                }}
                            >
                                <option value="all">Todos (Pregrado y Posgrado)</option>
                                <option value="pregrado">Pregrado (Carreras)</option>
                                <option value="posgrado">Posgrado</option>
                            </select>
                        </label>

                        <label>
                            Carrera / Programa académico
                            <select
                                value={careerFilter}
                                onChange={(e) => setCareerFilter(e.target.value)}
                            >
                                <option value="all">Todas las carreras y programas</option>
                                {careerOptions.map((c) => (
                                    <option key={c.id} value={c.id}>
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>
                            Vínculo con la UFPS
                            <select
                                value={profileFilter}
                                onChange={(e) =>
                                    setProfileFilter(e.target.value as ProfileFilter)
                                }
                            >
                                <option value="all">Todos los vínculos</option>
                                <option value="estudiante">Estudiante</option>
                                <option value="egresado">Egresado</option>
                                <option value="docente">Docente</option>
                                <option value="administrativo">Administrativo</option>
                                <option value="invitado">Invitado</option>
                                <option value="externo">Externo</option>
                            </select>
                        </label>

                        <div className="row" style={{ justifyContent: "flex-end", marginTop: "4px" }}>
                            <button type="button" className="ghost" onClick={resetFilters}>
                                Restablecer
                            </button>
                            <button type="button" onClick={() => setShowFiltersPopup(false)}>
                                Aplicar filtros
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* POPUP 2: EDITAR INFORMACIÓN DEL USUARIO */}
            {editingUser && (
                <div
                    className="modal-backdrop"
                    onClick={() => !savingUser && setEditingUser(null)}
                >
                    <form
                        className="card modal-card"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={handleSaveUser}
                    >
                        <div className="section-head">
                            <h2 style={{ margin: 0 }}>Editar información del usuario</h2>
                            <button
                                type="button"
                                className="ghost btn-sm"
                                onClick={() => setEditingUser(null)}
                                disabled={savingUser}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="row">
                            <label>
                                Nombre(s)
                                <input
                                    type="text"
                                    value={editingUser.firstName}
                                    onChange={(e) =>
                                        setEditingUser({ ...editingUser, firstName: e.target.value })
                                    }
                                    placeholder="Ej. Juan Carlos"
                                    required
                                />
                            </label>

                            <label>
                                Apellidos
                                <input
                                    type="text"
                                    value={editingUser.lastName}
                                    onChange={(e) =>
                                        setEditingUser({ ...editingUser, lastName: e.target.value })
                                    }
                                    placeholder="Ej. Pérez Gómez"
                                    required
                                />
                            </label>
                        </div>

                        <div className="row">
                            <label>
                                Correo electrónico
                                <input
                                    type="email"
                                    value={editingUser.email}
                                    onChange={(e) =>
                                        setEditingUser({ ...editingUser, email: e.target.value })
                                    }
                                    placeholder="usuario@ufps.edu.co"
                                />
                            </label>

                            <label>
                                Número de celular
                                <input
                                    type="tel"
                                    inputMode="tel"
                                    value={editingUser.phone}
                                    onChange={(e) =>
                                        setEditingUser({
                                            ...editingUser,
                                            phone: e.target.value.replace(/\D+/g, "").slice(0, 15),
                                        })
                                    }
                                    placeholder="Ej. 3001234567"
                                />
                            </label>
                        </div>

                        <label>
                            Vínculo con la universidad
                            <select
                                value={editingUser.profileType}
                                onChange={(e) =>
                                    setEditingUser({
                                        ...editingUser,
                                        profileType: e.target.value as UserProfileType,
                                    })
                                }
                            >
                                <option value="estudiante">Estudiante</option>
                                <option value="egresado">Egresado</option>
                                <option value="docente">Docente</option>
                                <option value="administrativo">Administrativo</option>
                                <option value="invitado">Invitado</option>
                                <option value="externo">Externo</option>
                            </select>
                        </label>

                        {editingUser.profileType === "estudiante" && (() => {
                            const digits = editingUser.studentCode.replace(/\D+/g, "");
                            const detected = findCareerByStudentCode(digits, allCatalogCareers);
                            return (
                                <label>
                                    Código estudiantil (exactamente 7 dígitos)
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={7}
                                        value={editingUser.studentCode}
                                        onChange={(e) => {
                                            const onlyDigits = e.target.value
                                                .replace(/\D+/g, "")
                                                .slice(0, 7);
                                            const match = findCareerByStudentCode(
                                                onlyDigits,
                                                allCatalogCareers,
                                            );
                                            setEditingUser({
                                                ...editingUser,
                                                studentCode: onlyDigits,
                                                careerId: match ? match.id : editingUser.careerId,
                                            });
                                        }}
                                        placeholder="Ej. 1151594"
                                        required
                                    />
                                    {digits.length > 0 && digits.length !== 7 && (
                                        <small className="error">
                                            Debe tener exactamente 7 dígitos ({digits.length}/7).
                                        </small>
                                    )}
                                    {detected ? (
                                        <small className="ok">
                                            Carrera detectada (cód. {detected.code}):{" "}
                                            <strong>{detected.name}</strong> — {detected.faculty}
                                        </small>
                                    ) : digits.length >= 3 ? (
                                        <small className="error">
                                            No existe una carrera registrada con el código{" "}
                                            {digits.slice(0, 3)}.
                                        </small>
                                    ) : null}
                                </label>
                            );
                        })()}

                        {editingUser.profileType === "egresado" && (
                            <label>
                                Carrera / Programa académico
                                <select
                                    value={editingUser.careerId}
                                    onChange={(e) =>
                                        setEditingUser({
                                            ...editingUser,
                                            careerId: e.target.value,
                                        })
                                    }
                                    required
                                >
                                    <option value="">Selecciona un programa…</option>
                                    {allCatalogCareers.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            [{c.code}] {c.name} — {careerGroup(c)}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {editingUser.profileType === "docente" && (
                            <label>
                                Departamento académico
                                <select
                                    value={editingUser.departmentId}
                                    onChange={(e) =>
                                        setEditingUser({
                                            ...editingUser,
                                            departmentId: e.target.value,
                                        })
                                    }
                                    required
                                >
                                    <option value="">Selecciona un departamento…</option>
                                    {allDepartments.map((d) => (
                                        <option key={d.departmentId} value={d.departmentId}>
                                            {d.department} — {d.facultyGroupTitle}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {editError && <p className="error">{editError}</p>}

                        <div className="row" style={{ justifyContent: "flex-end", marginTop: "6px" }}>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => setEditingUser(null)}
                                disabled={savingUser}
                            >
                                Cancelar
                            </button>
                            <button type="submit" disabled={savingUser}>
                                {savingUser ? "Guardando…" : "Guardar cambios"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </>
    );
}
