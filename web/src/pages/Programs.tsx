// src/pages/Programs.tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import DriveImageField from "../components/DriveImageField";
import TimeInput from "../components/TimeInput";
import { DAYS } from "../constants/audiences";
import {
    addMinutes,
    currentTimeString,
    formatTime12h,
    timeToMinutes,
    todayIsoWeekday,
} from "../lib/dates";
import { driveViewUrl, extractDriveId } from "../lib/drive";
import { normalizeText } from "../lib/text";
import {
    createProgram,
    disableProgram,
    enableProgram,
    listPrograms,
    updateProgram,
} from "../services/programsService";
import type { Program } from "../types";

interface ProgramForm {
    name: string;
    days: number[];
    startTime: string;
    durationMinutes: string;
    collective: string;
    hosts: string;
    active: boolean;
    artworkLink: string;
}

const EMPTY_FORM: ProgramForm = {
    name: "",
    days: [],
    startTime: "",
    durationMinutes: "60",
    collective: "",
    hosts: "",
    active: true,
    artworkLink: "",
};

type StatusFilter = "all" | "active" | "inactive";

interface EnableConflictState {
    targetProgram: Program;
    conflictingPrograms: Program[];
    reason: string;
}

const SCHEDULE_HOURS = Array.from({ length: 24 }, (_, h) => h);

export default function Programs() {
    const [programs, setPrograms] = useState<Program[]>([]);
    const [form, setForm] = useState<ProgramForm>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [statusMessage, setStatusMessage] = useState("");
    const [dayFilter, setDayFilter] = useState<number | "all">("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [search, setSearch] = useState("");

    // Edit popup modal state
    const [editingProgram, setEditingProgram] = useState<Program | null>(null);
    const [editForm, setEditForm] = useState<ProgramForm>(EMPTY_FORM);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState("");

    // Disable with observation modal state
    const [disablingProgram, setDisablingProgram] = useState<Program | null>(null);
    const [disableReason, setDisableReason] = useState("");
    const [disableError, setDisableError] = useState("");
    const [disabling, setDisabling] = useState(false);

    // One-click conflict resolution modal when re-enabling a disabled program
    const [enableConflict, setEnableConflict] = useState<EnableConflictState | null>(null);
    const [resolvingConflict, setResolvingConflict] = useState(false);

    useEffect(() => {
        listPrograms().then(setPrograms);
    }, []);

    // Close edit modal on Escape
    useEffect(() => {
        if (!editingProgram) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !editSaving) setEditingProgram(null);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [editingProgram, editSaving]);

    const filteredPrograms = useMemo(() => {
        const term = normalizeText(search.trim());
        return programs.filter((p) => {
            const dayOk = dayFilter === "all" || p.days.includes(dayFilter);
            const statusOk = statusFilter === "all" || p.active === (statusFilter === "active");
            const textOk =
                term === "" ||
                normalizeText([p.name, p.collective, p.disableReason, ...p.hosts].join(" ")).includes(term);
            return dayOk && statusOk && textOk;
        });
    }, [programs, dayFilter, statusFilter, search]);

    /** Finds the earliest ACTIVE program starting at or after `hhmm` on any of `days` (ignoring `excludeId`). Disabled programs are ignored so their slot can be reused. */
    const computeNextProgramLimit = (
        days: number[],
        hhmm: string,
        excludeId: string | null,
    ): { maxDuration: number; nextProgram: Program | null; limitTime: string } => {
        const fallbackMax = 720;
        if (!hhmm || days.length === 0) {
            return { maxDuration: fallbackMax, nextProgram: null, limitTime: "" };
        }
        const start = timeToMinutes(hhmm);
        if (start < 0) return { maxDuration: fallbackMax, nextProgram: null, limitTime: "" };

        let bestGap = Math.min(fallbackMax, 1440 - start);
        let nextProgram: Program | null = null;
        let limitTime = "24:00";

        for (const other of programs) {
            if (other.id === excludeId || !other.active) continue;
            const sharedDays = days.filter((d) => other.days.includes(d));
            if (sharedDays.length === 0) continue;

            const otherStart = timeToMinutes(other.startTime);
            if (otherStart >= start) {
                const gap = otherStart - start;
                if (gap < bestGap) {
                    bestGap = gap;
                    nextProgram = other;
                    limitTime = other.startTime;
                }
            }
        }

        return {
            maxDuration: Math.max(0, bestGap),
            nextProgram,
            limitTime,
        };
    };

    /** Returns a conflict message if starting at `hhmm` with `duration` overlaps any ACTIVE program (disabled programs never block new ones). */
    const computeConflict = (
        days: number[],
        hhmm: string,
        duration: number,
        excludeId: string | null,
        blockPastToday: boolean,
    ): string | null => {
        if (!hhmm || days.length === 0) return null;
        const start = timeToMinutes(hhmm);
        if (start < 0) return null;
        const end = start + duration;

        if (blockPastToday) {
            const todayIso = todayIsoWeekday();
            const nowTime = currentTimeString();
            if (days.includes(todayIso) && hhmm < nowTime) {
                return `Hora pasada (hoy después de ${formatTime12h(nowTime)})`;
            }
        }

        for (const other of programs) {
            if (other.id === excludeId || !other.active) continue;
            const sharedDays = days.filter((d) => other.days.includes(d));
            if (sharedDays.length === 0) continue;

            const otherStart = timeToMinutes(other.startTime);
            const otherEnd = otherStart + other.durationMinutes;
            if (start < otherEnd && otherStart < end) {
                const dayNames = DAYS.filter((d) => sharedDays.includes(d.value))
                    .map((d) => d.label)
                    .join(", ");
                const otherEndStr = addMinutes(other.startTime, other.durationMinutes);
                return `Se cruza el ${dayNames} con «${other.name}» (${formatTime12h(other.startTime)} – ${formatTime12h(otherEndStr)}).`;
            }
        }
        return null;
    };

    // --- New Program Form helpers ---
    const setField = <K extends keyof ProgramForm>(key: K, value: ProgramForm[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const toggleDay = (day: number) =>
        setField(
            "days",
            form.days.includes(day) ? form.days.filter((d) => d !== day) : [...form.days, day].sort(),
        );

    const parsedDuration = useMemo(() => {
        const d = Math.round(Number(form.durationMinutes));
        return Number.isFinite(d) && d >= 1 && d <= 720 ? d : 60;
    }, [form.durationMinutes]);

    const durationLimit = useMemo(
        () => computeNextProgramLimit(form.days, form.startTime, null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [programs, form.days, form.startTime],
    );

    const currentStartConflict = form.startTime
        ? computeConflict(form.days, form.startTime, parsedDuration, null, true)
        : null;

    const selectStartTime = (hhmm: string) => {
        setForm((prev) => {
            if (!hhmm) return { ...prev, startTime: "" };
            const limit = computeNextProgramLimit(prev.days, hhmm, null);
            const currDur = Math.round(Number(prev.durationMinutes)) || 60;
            const cappedDur =
                limit.maxDuration > 0 && currDur > limit.maxDuration
                    ? String(limit.maxDuration)
                    : prev.durationMinutes;
            return { ...prev, startTime: hhmm, durationMinutes: cappedDur };
        });
    };

    const hourSlots = useMemo(() => {
        return SCHEDULE_HOURS.map((h) => {
            const hhmm = `${String(h).padStart(2, "0")}:00`;
            const startConflict = computeConflict(form.days, hhmm, 1, null, true);
            const limit = computeNextProgramLimit(form.days, hhmm, null);
            return {
                hhmm,
                label: formatTime12h(hhmm),
                conflict: startConflict,
                maxDuration: limit.maxDuration,
                limitTime: limit.limitTime,
                nextProgramName: limit.nextProgram?.name ?? null,
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [programs, form.days]);

    const handleCreateSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setStatusMessage("");

        if (form.days.length === 0) {
            setError("Selecciona al menos un día de emisión.");
            return;
        }
        if (!form.startTime || !/^\d{2}:\d{2}$/.test(form.startTime)) {
            setError("Selecciona la hora de inicio del programa.");
            return;
        }

        const duration = Math.round(Number(form.durationMinutes));
        const maxAllowed = durationLimit.maxDuration > 0 ? durationLimit.maxDuration : 720;
        if (!Number.isFinite(duration) || duration < 1 || duration > maxAllowed) {
            setError(
                durationLimit.nextProgram
                    ? `La duración máxima desde las ${formatTime12h(form.startTime)} es de ${maxAllowed} min (hasta las ${formatTime12h(durationLimit.limitTime)}, inicio de «${durationLimit.nextProgram.name}»).`
                    : `Ingresa una duración válida entre 1 y ${maxAllowed} minutos.`,
            );
            return;
        }

        const artworkDriveId = extractDriveId(form.artworkLink);
        if (!artworkDriveId) {
            setError("Pega un enlace válido de Google Drive para la imagen del programa.");
            return;
        }

        const conflict = computeConflict(form.days, form.startTime, duration, null, true);
        if (conflict) {
            setError(`Cruce de horario: ${conflict}`);
            return;
        }

        setSaving(true);
        try {
            await createProgram({
                name: form.name.trim(),
                days: form.days,
                startTime: form.startTime,
                durationMinutes: duration,
                collective: form.collective.trim(),
                hosts: form.hosts.split(",").map((h) => h.trim()).filter(Boolean),
                active: form.active,
                artworkDriveId,
            });
            setForm(EMPTY_FORM);
            setPrograms(await listPrograms());
            setStatusMessage("Programa publicado correctamente.");
        } catch {
            setError("No se pudo guardar el programa.");
        } finally {
            setSaving(false);
        }
    };

    // --- Edit Program Popup helpers ---
    const openEditModal = (p: Program) => {
        setEditingProgram(p);
        setEditForm({
            name: p.name,
            days: p.days,
            startTime: p.startTime,
            durationMinutes: String(p.durationMinutes),
            collective: p.collective,
            hosts: p.hosts.join(", "),
            active: p.active,
            artworkLink: p.artworkDriveId ? driveViewUrl(p.artworkDriveId) : "",
        });
        setEditError("");
        setStatusMessage("");
    };

    const setEditField = <K extends keyof ProgramForm>(key: K, value: ProgramForm[K]) =>
        setEditForm((prev) => ({ ...prev, [key]: value }));

    const toggleEditDay = (day: number) =>
        setEditField(
            "days",
            editForm.days.includes(day)
                ? editForm.days.filter((d) => d !== day)
                : [...editForm.days, day].sort(),
        );

    const editParsedDuration = useMemo(() => {
        const d = Math.round(Number(editForm.durationMinutes));
        return Number.isFinite(d) && d >= 1 && d <= 720 ? d : 60;
    }, [editForm.durationMinutes]);

    const editDurationLimit = useMemo(
        () =>
            editingProgram
                ? computeNextProgramLimit(editForm.days, editForm.startTime, editingProgram.id)
                : { maxDuration: 720, nextProgram: null, limitTime: "" },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [programs, editForm.days, editForm.startTime, editingProgram?.id],
    );

    const editStartConflict =
        editingProgram && editForm.startTime && editForm.active
            ? computeConflict(editForm.days, editForm.startTime, editParsedDuration, editingProgram.id, false)
            : null;

    const selectEditStartTime = (hhmm: string) => {
        setEditForm((prev) => {
            if (!hhmm || !editingProgram) return { ...prev, startTime: hhmm };
            const limit = computeNextProgramLimit(prev.days, hhmm, editingProgram.id);
            const currDur = Math.round(Number(prev.durationMinutes)) || 60;
            const cappedDur =
                limit.maxDuration > 0 && currDur > limit.maxDuration
                    ? String(limit.maxDuration)
                    : prev.durationMinutes;
            return { ...prev, startTime: hhmm, durationMinutes: cappedDur };
        });
    };

    const handleEditSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!editingProgram) return;
        setEditError("");

        if (editForm.days.length === 0) {
            setEditError("Selecciona al menos un día de emisión.");
            return;
        }
        if (!editForm.startTime || !/^\d{2}:\d{2}$/.test(editForm.startTime)) {
            setEditError("Selecciona la hora de inicio del programa.");
            return;
        }

        const duration = Math.round(Number(editForm.durationMinutes));
        const maxAllowed = editDurationLimit.maxDuration > 0 ? editDurationLimit.maxDuration : 720;
        if (!Number.isFinite(duration) || duration < 1 || (editForm.active && duration > maxAllowed)) {
            setEditError(
                editDurationLimit.nextProgram
                    ? `La duración máxima permitida desde las ${formatTime12h(editForm.startTime)} es de ${maxAllowed} min (hasta las ${formatTime12h(editDurationLimit.limitTime)}, inicio de «${editDurationLimit.nextProgram.name}»).`
                    : `Ingresa una duración válida entre 1 y ${maxAllowed} minutos.`,
            );
            return;
        }

        const artworkDriveId = extractDriveId(editForm.artworkLink);
        if (!artworkDriveId) {
            setEditError("Pega un enlace válido de Google Drive para la imagen del programa.");
            return;
        }

        if (editForm.active) {
            const conflict = computeConflict(
                editForm.days,
                editForm.startTime,
                duration,
                editingProgram.id,
                false,
            );
            if (conflict) {
                setEditError(`Cruce de horario: ${conflict}`);
                return;
            }
        }

        setEditSaving(true);
        try {
            await updateProgram(editingProgram.id, {
                name: editForm.name.trim(),
                days: editForm.days,
                startTime: editForm.startTime,
                durationMinutes: duration,
                collective: editForm.collective.trim(),
                hosts: editForm.hosts.split(",").map((h) => h.trim()).filter(Boolean),
                active: editForm.active,
                artworkDriveId,
            });
            setEditingProgram(null);
            setPrograms(await listPrograms());
            setStatusMessage(`Programa «${editForm.name.trim()}» actualizado.`);
        } catch {
            setEditError("No se pudieron guardar los cambios del programa.");
        } finally {
            setEditSaving(false);
        }
    };

    // --- Disable & Enable with One-Click Conflict Resolution ---
    const openDisableModal = (p: Program) => {
        setDisablingProgram(p);
        setDisableReason(p.disableReason || "");
        setDisableError("");
    };

    const handleConfirmDisable = async (e: FormEvent) => {
        e.preventDefault();
        if (!disablingProgram) return;
        const cleanReason = disableReason.trim();
        if (!cleanReason) {
            setDisableError("Escribe una observación o motivo para deshabilitar el programa.");
            return;
        }
        setDisabling(true);
        setDisableError("");
        try {
            await disableProgram(disablingProgram.id, cleanReason);
            if (editingProgram?.id === disablingProgram.id) setEditingProgram(null);
            const disabledName = disablingProgram.name;
            setDisablingProgram(null);
            setDisableReason("");
            setPrograms(await listPrograms());
            setStatusMessage(
                `«${disabledName}» fue deshabilitado. Su franja horaria ya está disponible para asignar otro programa.`,
            );
        } catch {
            setDisableError("No se pudo deshabilitar el programa.");
        } finally {
            setDisabling(false);
        }
    };

    const findConflictingActivePrograms = (target: Program): Program[] => {
        const pStart = timeToMinutes(target.startTime);
        const pEnd = pStart + target.durationMinutes;
        return programs.filter((other) => {
            if (other.id === target.id || !other.active) return false;
            const sharedDays = target.days.filter((d) => other.days.includes(d));
            if (sharedDays.length === 0) return false;
            const otherStart = timeToMinutes(other.startTime);
            const otherEnd = otherStart + other.durationMinutes;
            return pStart < otherEnd && otherStart < pEnd;
        });
    };

    const handleRequestEnable = async (p: Program) => {
        setError("");
        setStatusMessage("");
        const conflicts = findConflictingActivePrograms(p);
        if (conflicts.length > 0) {
            setEnableConflict({
                targetProgram: p,
                conflictingPrograms: conflicts,
                reason: `Reemplazado al reactivar «${p.name}»`,
            });
            return;
        }
        await enableProgram(p.id);
        if (editingProgram?.id === p.id) setEditingProgram(null);
        setPrograms(await listPrograms());
        setStatusMessage(`Programa «${p.name}» habilitado nuevamente.`);
    };

    const handleResolveEnableConflict = async () => {
        if (!enableConflict) return;
        setResolvingConflict(true);
        try {
            const { targetProgram, conflictingPrograms, reason } = enableConflict;
            const obs = reason.trim() || `Deshabilitado para reactivar «${targetProgram.name}»`;
            for (const c of conflictingPrograms) {
                await disableProgram(c.id, obs);
            }
            await enableProgram(targetProgram.id);
            if (editingProgram?.id === targetProgram.id) setEditingProgram(null);
            setEnableConflict(null);
            setPrograms(await listPrograms());
            const disabledNames = conflictingPrograms.map((c) => `«${c.name}»`).join(", ");
            setStatusMessage(
                `Se deshabilitó ${disabledNames} y se habilitó nuevamente «${targetProgram.name}».`,
            );
        } finally {
            setResolvingConflict(false);
        }
    };

    /** Groups filtered programs by their starting hour (0..23) so the left column shows hours vertically. */
    const timelineRows = useMemo(() => {
        const byHour = new Map<number, Program[]>();
        for (const p of filteredPrograms) {
            const startMin = timeToMinutes(p.startTime);
            const hour = startMin >= 0 ? Math.floor(startMin / 60) % 24 : 0;
            const list = byHour.get(hour) ?? [];
            list.push(p);
            byHour.set(hour, list);
        }
        for (const list of byHour.values()) {
            list.sort((a, b) => {
                if (a.active !== b.active) return a.active ? -1 : 1;
                return a.startTime.localeCompare(b.startTime) || a.name.localeCompare(b.name);
            });
        }

        // Show all 24 hours when browsing normally, or only matching hours when searching
        const hoursToShow =
            search.trim() !== ""
                ? SCHEDULE_HOURS.filter((h) => (byHour.get(h)?.length ?? 0) > 0)
                : SCHEDULE_HOURS;

        return hoursToShow.map((h) => {
            const hhmm = `${String(h).padStart(2, "0")}:00`;
            return {
                hour: h,
                hhmm,
                label: formatTime12h(hhmm),
                programs: byHour.get(h) ?? [],
            };
        });
    }, [filteredPrograms, search]);

    const selectedDayLabel =
        dayFilter === "all"
            ? "Toda la semana"
            : DAYS.find((d) => d.value === dayFilter)?.label ?? "";

    return (
        <>
            <form className="card" onSubmit={handleCreateSubmit}>
                <h2>Nuevo programa</h2>

                <label>Nombre del programa
                    <input value={form.name} onChange={(e) => setField("name", e.target.value)} required />
                </label>

                <DriveImageField
                    label="Imagen del programa (artwork 1024x1024)"
                    value={form.artworkLink}
                    onChange={(value) => setField("artworkLink", value)}
                />

                <fieldset>
                    <legend>Días de emisión</legend>
                    <div className="row">
                        {DAYS.map((d) => (
                            <label key={d.value} className="check">
                                <input
                                    type="checkbox"
                                    checked={form.days.includes(d.value)}
                                    onChange={() => toggleDay(d.value)}
                                />
                                {d.label}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div className="row">
                    <label>Hora de inicio
                        <TimeInput
                            value={form.startTime}
                            onChange={selectStartTime}
                            isTimeDisabled={(hhmm) => computeConflict(form.days, hhmm, 1, null, true)}
                            disabled={form.days.length === 0}
                            required
                        />
                        {form.days.length === 0 && (
                            <small className="muted">
                                Selecciona primero los días de emisión para ver las horas disponibles.
                            </small>
                        )}
                        {currentStartConflict && (
                            <small className="error">Cruce de horario: {currentStartConflict}</small>
                        )}
                    </label>
                    <label>
                        Duración (minutos{form.startTime && durationLimit.maxDuration > 0 ? ` · máx. ${durationLimit.maxDuration}` : ""})
                        <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={durationLimit.maxDuration > 0 ? durationLimit.maxDuration : 720}
                            step={1}
                            value={form.durationMinutes}
                            onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === "") {
                                    setField("durationMinutes", "");
                                    return;
                                }
                                const n = Math.round(Number(raw));
                                if (!Number.isFinite(n)) return;
                                const cap = durationLimit.maxDuration > 0 ? durationLimit.maxDuration : 720;
                                setField("durationMinutes", String(Math.min(Math.max(n, 0), cap)));
                            }}
                            placeholder="Ej. 20, 60"
                            required
                        />
                        {form.startTime && durationLimit.maxDuration > 0 && (
                            <small className="muted">
                                {durationLimit.nextProgram
                                    ? `Límite: máx. ${durationLimit.maxDuration} min — hasta las ${formatTime12h(durationLimit.limitTime)} (inicio de «${durationLimit.nextProgram.name}»).`
                                    : `Termina a las ${formatTime12h(addMinutes(form.startTime, Math.min(parsedDuration, durationLimit.maxDuration)))} (máx. ${durationLimit.maxDuration} min).`}
                            </small>
                        )}
                    </label>
                </div>

                {form.days.length > 0 && (
                    <div className="slot-picker-box">
                        <div className="slot-picker-head">
                            <strong>Disponibilidad de franjas horarias</strong>
                            <small className="muted">
                                Los programas deshabilitados liberan su horario. Al elegir una franja disponible, la duración máxima se limita automáticamente hasta el siguiente programa activo.
                            </small>
                        </div>
                        <div className="slot-grid">
                            {hourSlots.map((slot) => {
                                const isSelected = form.startTime === slot.hhmm;
                                const isBlocked = Boolean(slot.conflict);
                                const shortStatus = slot.conflict?.startsWith("Hora pasada")
                                    ? "Pasada"
                                    : isBlocked
                                      ? "Ocupada"
                                      : slot.nextProgramName
                                        ? `Hasta ${formatTime12h(slot.limitTime)}`
                                        : "Disponible";
                                return (
                                    <button
                                        key={slot.hhmm}
                                        type="button"
                                        disabled={isBlocked}
                                        title={
                                            slot.conflict ??
                                            (slot.nextProgramName
                                                ? `Disponible desde ${slot.label} hasta ${formatTime12h(slot.limitTime)} (máx. ${slot.maxDuration} min antes de «${slot.nextProgramName}»)`
                                                : `Disponible desde ${slot.label}`)
                                        }
                                        className={`slot-btn ${isSelected ? "selected" : ""} ${isBlocked ? "occupied" : ""}`}
                                        onClick={() => selectStartTime(slot.hhmm)}
                                    >
                                        <span>{slot.label}</span>
                                        <small>{shortStatus}</small>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="row">
                    <label>Colectivo
                        <input value={form.collective} onChange={(e) => setField("collective", e.target.value)} />
                    </label>

                    <label>Locutores (separados por coma)
                        <input value={form.hosts} onChange={(e) => setField("hosts", e.target.value)} />
                    </label>
                </div>

                {error && <p className="error">{error}</p>}
                {statusMessage && <p className="ok">{statusMessage}</p>}

                <div className="row">
                    <button type="submit" disabled={saving || Boolean(currentStartConflict)}>
                        {saving ? "Guardando…" : "Publicar programa"}
                    </button>
                </div>
            </form>

            {/* Parrilla de programación: horas en vertical a la izquierda y programas al frente */}
            <div className="section-head">
                <div>
                    <h2>Parrilla de programación · {selectedDayLabel}</h2>
                </div>
                <span className="muted">
                    {filteredPrograms.length} {filteredPrograms.length === 1 ? "programa" : "programas"}
                </span>
            </div>

            <div className="chips">
                <button
                    type="button"
                    className={dayFilter === "all" ? "chip active" : "chip"}
                    onClick={() => setDayFilter("all")}
                >
                    Todos <small>{programs.length}</small>
                </button>
                {DAYS.map((d) => (
                    <button
                        type="button"
                        key={d.value}
                        className={dayFilter === d.value ? "chip active" : "chip"}
                        onClick={() => setDayFilter(d.value)}
                    >
                        {d.label} <small>{programs.filter((p) => p.days.includes(d.value)).length}</small>
                    </button>
                ))}
            </div>

            <div className="toolbar">
                <input
                    className="search"
                    type="search"
                    placeholder="Buscar por nombre, colectivo, locutor u observación"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                    <option value="all">Todos</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Deshabilitados</option>
                </select>
            </div>

            <div className="card schedule-timeline-card">
                {timelineRows.length === 0 ? (
                    <p className="empty">No hay programas para este filtro.</p>
                ) : (
                    <div className="schedule-timeline">
                        {timelineRows.map((row) => (
                            <div
                                key={row.hour}
                                className={`timeline-row ${row.programs.length === 0 ? "timeline-row-empty" : ""}`}
                            >
                                <div className="timeline-hour">{row.label}</div>
                                <div className="timeline-programs">
                                    {row.programs.length === 0 ? (
                                        <span className="timeline-free-label">Sin programa asignado</span>
                                    ) : (
                                        row.programs.map((p) => {
                                            const endStr = addMinutes(p.startTime, p.durationMinutes);
                                            const dayShorts = DAYS.filter((d) => p.days.includes(d.value))
                                                .map((d) => d.short)
                                                .join(" · ");
                                            return (
                                                <div
                                                    key={p.id}
                                                    className={`timeline-program-line ${p.active ? "" : "is-disabled"}`}
                                                >
                                                    <div className="timeline-program-info">
                                                        <strong className="timeline-program-name">{p.name}</strong>
                                                        <span className="muted timeline-program-meta">
                                                            {formatTime12h(p.startTime)} – {formatTime12h(endStr)}
                                                            {dayFilter === "all" && dayShorts ? ` · ${dayShorts}` : ""}
                                                        </span>
                                                        {!p.active && (
                                                            <span
                                                                className="tag off"
                                                                title={p.disableReason || "Programa deshabilitado"}
                                                            >
                                                                Deshabilitado
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="timeline-program-actions">
                                                        {!p.active && (
                                                            <button
                                                                type="button"
                                                                className="secondary btn-sm"
                                                                onClick={() => handleRequestEnable(p)}
                                                            >
                                                                Habilitar
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="ghost btn-sm"
                                                            onClick={() => openEditModal(p)}
                                                        >
                                                            Editar
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* POPUP 1: EDITAR PROGRAMA */}
            {editingProgram && (
                <div
                    className="modal-backdrop"
                    onClick={() => !editSaving && setEditingProgram(null)}
                >
                    <form
                        className="card modal-card modal-card-wide"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={handleEditSubmit}
                    >
                        <div className="section-head">
                            <h2 style={{ margin: 0 }}>Editar programa</h2>
                            <button
                                type="button"
                                className="ghost btn-sm"
                                onClick={() => setEditingProgram(null)}
                                disabled={editSaving}
                            >
                                ✕
                            </button>
                        </div>

                        {!editingProgram.active && editingProgram.disableReason && (
                            <div className="note-box">
                                <strong>Observación de deshabilitación:</strong> {editingProgram.disableReason}
                            </div>
                        )}

                        <label>Nombre del programa
                            <input
                                value={editForm.name}
                                onChange={(e) => setEditField("name", e.target.value)}
                                required
                            />
                        </label>

                        <DriveImageField
                            label="Imagen del programa (artwork 1024x1024)"
                            value={editForm.artworkLink}
                            onChange={(value) => setEditField("artworkLink", value)}
                        />

                        <fieldset>
                            <legend>Días de emisión</legend>
                            <div className="row">
                                {DAYS.map((d) => (
                                    <label key={d.value} className="check">
                                        <input
                                            type="checkbox"
                                            checked={editForm.days.includes(d.value)}
                                            onChange={() => toggleEditDay(d.value)}
                                        />
                                        {d.label}
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        <div className="row">
                            <label>Hora de inicio
                                <TimeInput
                                    value={editForm.startTime}
                                    onChange={selectEditStartTime}
                                    isTimeDisabled={
                                        editForm.active
                                            ? (hhmm) =>
                                                  computeConflict(
                                                      editForm.days,
                                                      hhmm,
                                                      1,
                                                      editingProgram.id,
                                                      false,
                                                  )
                                            : undefined
                                    }
                                    disabled={editForm.days.length === 0}
                                    required
                                />
                                {editStartConflict && (
                                    <small className="error">Cruce: {editStartConflict}</small>
                                )}
                            </label>
                            <label>
                                Duración (minutos{editForm.startTime && editDurationLimit.maxDuration > 0 ? ` · máx. ${editDurationLimit.maxDuration}` : ""})
                                <input
                                    type="number"
                                    inputMode="numeric"
                                    min={1}
                                    max={editDurationLimit.maxDuration > 0 ? editDurationLimit.maxDuration : 720}
                                    step={1}
                                    value={editForm.durationMinutes}
                                    onChange={(e) => {
                                        const raw = e.target.value;
                                        if (raw === "") {
                                            setEditField("durationMinutes", "");
                                            return;
                                        }
                                        const n = Math.round(Number(raw));
                                        if (!Number.isFinite(n)) return;
                                        const cap =
                                            editForm.active && editDurationLimit.maxDuration > 0
                                                ? editDurationLimit.maxDuration
                                                : 720;
                                        setEditField("durationMinutes", String(Math.min(Math.max(n, 0), cap)));
                                    }}
                                    required
                                />
                                {editForm.startTime && editDurationLimit.nextProgram && (
                                    <small className="muted">
                                        Máx. {editDurationLimit.maxDuration} min — hasta las{" "}
                                        {formatTime12h(editDurationLimit.limitTime)} (inicio de «
                                        {editDurationLimit.nextProgram.name}»).
                                    </small>
                                )}
                            </label>
                        </div>

                        <div className="row">
                            <label>Colectivo
                                <input
                                    value={editForm.collective}
                                    onChange={(e) => setEditField("collective", e.target.value)}
                                />
                            </label>
                            <label>Locutores (separados por coma)
                                <input
                                    value={editForm.hosts}
                                    onChange={(e) => setEditField("hosts", e.target.value)}
                                />
                            </label>
                        </div>

                        {editError && <p className="error">{editError}</p>}

                        <div
                            className="row"
                            style={{ justifyContent: "space-between", alignItems: "center", marginTop: "6px" }}
                        >
                            <div>
                                {editingProgram.active ? (
                                    <button
                                        type="button"
                                        className="danger"
                                        onClick={() => openDisableModal(editingProgram)}
                                        disabled={editSaving}
                                    >
                                        Deshabilitar programa
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="secondary"
                                        onClick={() => handleRequestEnable(editingProgram)}
                                        disabled={editSaving}
                                    >
                                        Habilitar nuevamente
                                    </button>
                                )}
                            </div>
                            <div className="row">
                                <button
                                    type="button"
                                    className="ghost"
                                    onClick={() => setEditingProgram(null)}
                                    disabled={editSaving}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={editSaving || Boolean(editStartConflict)}
                                >
                                    {editSaving ? "Guardando…" : "Guardar cambios"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* POPUP 2: DESHABILITAR CON OBSERVACIÓN */}
            {disablingProgram && (
                <div
                    className="modal-backdrop"
                    onClick={() => !disabling && setDisablingProgram(null)}
                >
                    <form
                        className="card modal-card"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={handleConfirmDisable}
                    >
                        <div className="section-head">
                            <h2 style={{ margin: 0 }}>Deshabilitar programa</h2>
                            <button
                                type="button"
                                className="ghost btn-sm"
                                onClick={() => setDisablingProgram(null)}
                                disabled={disabling}
                            >
                                ✕
                            </button>
                        </div>

                        <p className="muted" style={{ margin: 0 }}>
                            El programa <strong>«{disablingProgram.name}»</strong> no se eliminará de la base de datos, dejará de mostrarse en la app móvil y <strong>su franja horaria quedará libre</strong> para asignar otro programa.
                        </p>

                        <label>
                            Observación / motivo de deshabilitación
                            <textarea
                                value={disableReason}
                                onChange={(e) => setDisableReason(e.target.value)}
                                rows={3}
                                placeholder="Ej. Programa en receso semestral, reemplazo temporal, cambio de temporada…"
                                required
                            />
                        </label>

                        {disableError && <p className="error">{disableError}</p>}

                        <div className="row" style={{ justifyContent: "flex-end" }}>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => setDisablingProgram(null)}
                                disabled={disabling}
                            >
                                Cancelar
                            </button>
                            <button type="submit" className="danger" disabled={disabling}>
                                {disabling ? "Deshabilitando…" : "Confirmar deshabilitación"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* POPUP 3: RESOLVER CRUCE AL HABILITAR UN PROGRAMA CON UN SOLO CLIC */}
            {enableConflict && (
                <div
                    className="modal-backdrop"
                    onClick={() => !resolvingConflict && setEnableConflict(null)}
                >
                    <div
                        className="card modal-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="section-head">
                            <h2 style={{ margin: 0 }}>Cruce de horario al habilitar</h2>
                            <button
                                type="button"
                                className="ghost btn-sm"
                                onClick={() => setEnableConflict(null)}
                                disabled={resolvingConflict}
                            >
                                ✕
                            </button>
                        </div>

                        <p style={{ margin: 0 }}>
                            Para volver a habilitar <strong>«{enableConflict.targetProgram.name}»</strong> (
                            {formatTime12h(enableConflict.targetProgram.startTime)} –{" "}
                            {formatTime12h(
                                addMinutes(
                                    enableConflict.targetProgram.startTime,
                                    enableConflict.targetProgram.durationMinutes,
                                ),
                            )}
                            ), se deshabilitará automáticamente{" "}
                            {enableConflict.conflictingPrograms.length === 1
                                ? "el siguiente programa que actualmente ocupa ese horario:"
                                : "los siguientes programas que actualmente ocupan ese horario:"}
                        </p>

                        <div className="note-box" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            {enableConflict.conflictingPrograms.map((c) => {
                                const cEnd = addMinutes(c.startTime, c.durationMinutes);
                                const cDays = DAYS.filter((d) => c.days.includes(d.value))
                                    .map((d) => d.label)
                                    .join(", ");
                                return (
                                    <div key={c.id}>
                                        <strong>«{c.name}»</strong> · {formatTime12h(c.startTime)} –{" "}
                                        {formatTime12h(cEnd)} ({cDays})
                                    </div>
                                );
                            })}
                        </div>

                        <label>
                            Observación para el programa que se deshabilitará
                            <input
                                type="text"
                                value={enableConflict.reason}
                                onChange={(e) =>
                                    setEnableConflict({
                                        ...enableConflict,
                                        reason: e.target.value,
                                    })
                                }
                            />
                        </label>

                        <div className="row" style={{ justifyContent: "flex-end", marginTop: "4px" }}>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => setEnableConflict(null)}
                                disabled={resolvingConflict}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="danger"
                                onClick={handleResolveEnableConflict}
                                disabled={resolvingConflict}
                            >
                                {resolvingConflict
                                    ? "Aplicando cambio…"
                                    : enableConflict.conflictingPrograms.length === 1
                                      ? `Deshabilitar «${enableConflict.conflictingPrograms[0].name}» y habilitar «${enableConflict.targetProgram.name}»`
                                      : `Deshabilitar programas en cruce y habilitar «${enableConflict.targetProgram.name}»`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
