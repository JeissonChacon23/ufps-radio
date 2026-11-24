// src/pages/Programs.tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import DriveImage from "../components/DriveImage";
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
import { createProgram, disableProgram, enableProgram, listPrograms, updateProgram } from "../services/programsService";
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

export default function Programs() {
    const [programs, setPrograms] = useState<Program[]>([]);
    const [form, setForm] = useState<ProgramForm>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [dayFilter, setDayFilter] = useState<number | "all">("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [search, setSearch] = useState("");
    const [disablingProgram, setDisablingProgram] = useState<Program | null>(null);
    const [disableReason, setDisableReason] = useState("");
    const [disableError, setDisableError] = useState("");
    const [disabling, setDisabling] = useState(false);

    useEffect(() => {
        listPrograms().then(setPrograms);
    }, []);

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

    const setField = <K extends keyof ProgramForm>(key: K, value: ProgramForm[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const toggleDay = (day: number) =>
        setField(
            "days",
            form.days.includes(day) ? form.days.filter((d) => d !== day) : [...form.days, day].sort(),
        );

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setError("");
    };

    const startEdit = (p: Program) => {
        setForm({
            name: p.name,
            days: p.days,
            startTime: p.startTime,
            durationMinutes: String(p.durationMinutes),
            collective: p.collective,
            hosts: p.hosts.join(", "),
            active: p.active,
            artworkLink: p.artworkDriveId ? driveViewUrl(p.artworkDriveId) : "",
        });
        setEditingId(p.id);
        setError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const parsedDuration = useMemo(() => {
        const d = Math.round(Number(form.durationMinutes));
        return Number.isFinite(d) && d >= 1 && d <= 720 ? d : 60;
    }, [form.durationMinutes]);

    /** Returns a descriptive conflict message if starting at `hhmm` overlaps any active program on the chosen days or is in the past for today. */
    const getConflictForStartTime = (hhmm: string): string | null => {
        if (!hhmm || form.days.length === 0) return null;
        const start = timeToMinutes(hhmm);
        if (start < 0) return null;
        const end = start + parsedDuration;

        // Also block past times when today's weekday is included
        const todayIso = todayIsoWeekday();
        const nowTime = currentTimeString();
        if (form.days.includes(todayIso) && hhmm < nowTime) {
            return `Hora pasada (hoy después de ${formatTime12h(nowTime)})`;
        }

        for (const other of programs) {
            if (other.id === editingId) continue;
            if (!other.active) continue;
            const sharedDays = form.days.filter((d) => other.days.includes(d));
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

    const currentStartConflict = form.startTime ? getConflictForStartTime(form.startTime) : null;

    const hourSlots = useMemo(() => {
        return Array.from({ length: 24 }, (_, h) => {
            const hhmm = `${String(h).padStart(2, "0")}:00`;
            const conflict = getConflictForStartTime(hhmm);
            return {
                hhmm,
                label: formatTime12h(hhmm),
                conflict,
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [programs, form.days, parsedDuration, editingId]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");

        if (form.days.length === 0) {
            setError("Selecciona al menos un día de emisión.");
            return;
        }
        if (!form.startTime || !/^\d{2}:\d{2}$/.test(form.startTime)) {
            setError("Selecciona la hora de inicio del programa.");
            return;
        }

        const duration = Math.round(Number(form.durationMinutes));
        if (!Number.isFinite(duration) || duration < 1 || duration > 720) {
            setError("Ingresa una duración válida entre 1 y 720 minutos.");
            return;
        }

        const artworkDriveId = extractDriveId(form.artworkLink);
        if (!artworkDriveId) {
            setError("Pega un enlace válido de Google Drive para la imagen del programa.");
            return;
        }

        // W1: Do not allow registering or moving a program on today's weekday to a past time.
        const todayIso = todayIsoWeekday();
        const nowTime = currentTimeString();
        if (form.days.includes(todayIso) && form.startTime < nowTime) {
            const todayLabel = DAYS.find((d) => d.value === todayIso)?.label ?? "hoy";
            setError(
                `No se puede registrar ni mover un programa del día de hoy (${todayLabel}) a una hora que ya pasó (${formatTime12h(form.startTime)}). Hora actual: ${formatTime12h(nowTime)}.`,
            );
            return;
        }

        // W2: Validate schedule overlaps on shared emission days (always block against active programs).
        const conflict = getConflictForStartTime(form.startTime);
        if (conflict) {
            setError(`Cruce de horario: ${conflict}`);
            return;
        }

        setSaving(true);
        try {
            const input = {
                name: form.name.trim(),
                days: form.days,
                startTime: form.startTime,
                durationMinutes: duration,
                collective: form.collective.trim(),
                hosts: form.hosts.split(",").map((h) => h.trim()).filter(Boolean),
                active: form.active,
                artworkDriveId,
            };
            if (editingId) {
                await updateProgram(editingId, input);
            } else {
                await createProgram(input);
            }
            resetForm();
            setPrograms(await listPrograms());
        } catch {
            setError("No se pudo guardar el programa.");
        } finally {
            setSaving(false);
        }
    };

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
            if (editingId === disablingProgram.id) resetForm();
            setDisablingProgram(null);
            setDisableReason("");
            setPrograms(await listPrograms());
        } catch {
            setDisableError("No se pudo deshabilitar el programa.");
        } finally {
            setDisabling(false);
        }
    };

    const handleEnable = async (p: Program) => {
        setError("");
        const pStart = timeToMinutes(p.startTime);
        const pEnd = pStart + p.durationMinutes;
        for (const other of programs) {
            if (other.id === p.id || !other.active) continue;
            const sharedDays = p.days.filter((d) => other.days.includes(d));
            if (sharedDays.length === 0) continue;
            const otherStart = timeToMinutes(other.startTime);
            const otherEnd = otherStart + other.durationMinutes;
            if (pStart < otherEnd && otherStart < pEnd) {
                const dayNames = DAYS.filter((d) => sharedDays.includes(d.value))
                    .map((d) => d.label)
                    .join(", ");
                setError(
                    `No se puede habilitar «${p.name}» porque su horario se cruza el ${dayNames} con «${other.name}» (${formatTime12h(other.startTime)}). Edita su horario antes de habilitarlo.`,
                );
                window.scrollTo({ top: 0, behavior: "smooth" });
                return;
            }
        }
        await enableProgram(p.id);
        setPrograms(await listPrograms());
    };

    const selectedDayLabel =
        dayFilter === "all"
            ? "Toda la semana"
            : DAYS.find((d) => d.value === dayFilter)?.label ?? "";

    return (
        <>
            <form className="card" onSubmit={handleSubmit}>
                <h2>{editingId ? "Editar programa" : "Nuevo programa"}</h2>

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
                                <input type="checkbox" checked={form.days.includes(d.value)} onChange={() => toggleDay(d.value)} />
                                {d.label}
                            </label>
                        ))}
                    </div>
                </fieldset>

                <div className="row">
                    <label>Hora de inicio
                        <TimeInput
                            value={form.startTime}
                            onChange={(val) => setField("startTime", val)}
                            isTimeDisabled={getConflictForStartTime}
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
                    <label>Duración (minutos)
                        <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={720}
                            step={1}
                            value={form.durationMinutes}
                            onChange={(e) => setField("durationMinutes", e.target.value)}
                            placeholder="Ej. 20, 60"
                            required
                        />
                    </label>
                </div>

                {form.days.length > 0 && (
                    <div className="slot-picker-box">
                        <div className="slot-picker-head">
                            <strong>Disponibilidad de franjas horarias ({parsedDuration} min)</strong>
                            <small className="muted">
                                Las franjas ocupadas están inhabilitadas; toca una franja disponible para seleccionarla.
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
                                      : "Disponible";
                                return (
                                    <button
                                        key={slot.hhmm}
                                        type="button"
                                        disabled={isBlocked}
                                        title={slot.conflict ?? `Disponible: ${slot.label}`}
                                        className={`slot-btn ${isSelected ? "selected" : ""} ${isBlocked ? "occupied" : ""}`}
                                        onClick={() => setField("startTime", slot.hhmm)}
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

                <label className="check">
                    <input type="checkbox" checked={form.active} onChange={(e) => setField("active", e.target.checked)} />
                    Programa activo (visible en la app)
                </label>

                {error && <p className="error">{error}</p>}

                <div className="row">
                    <button type="submit" disabled={saving || Boolean(currentStartConflict)}>
                        {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Publicar programa"}
                    </button>
                    {editingId && (
                        <button type="button" className="secondary" onClick={resetForm}>Cancelar edición</button>
                    )}
                </div>
            </form>

            <div className="section-head">
                <div>
                    <h2>Programación publicada · {selectedDayLabel}</h2>
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
                    placeholder="Buscar por nombre, colectivo o locutor"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                    <option value="all">Todos</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Deshabilitados</option>
                </select>
            </div>

            {filteredPrograms.length === 0 && (
                <p className="empty">
                    {programs.length === 0 ? "Aún no hay programas." : "No hay programas para este filtro."}
                </p>
            )}

            {filteredPrograms.map((p) => {
                const endStr = addMinutes(p.startTime, p.durationMinutes);
                return (
                    <div
                        className="card media-card"
                        key={p.id}
                        style={p.active ? undefined : { opacity: 0.85 }}
                    >
                        {p.artworkDriveId
                            ? <DriveImage id={p.artworkDriveId} size={160} />
                            : <div className="thumb placeholder" />}
                        <div className="media-body">
                            <div className="row">
                                <strong>{p.name}</strong>
                                {!p.active && <span className="tag off">Deshabilitado · No visible en la app</span>}
                            </div>
                            <div className="muted">
                                <strong>{formatTime12h(p.startTime)} – {formatTime12h(endStr)}</strong>{" "}
                                ({p.startTime} – {endStr} · {p.durationMinutes} min)
                            </div>
                            <div className="row day-tags">
                                {DAYS.filter((d) => p.days.includes(d.value)).map((d) => (
                                    <span
                                        key={d.value}
                                        className={dayFilter === d.value ? "tag active-day" : "tag"}
                                    >
                                        {d.short}
                                    </span>
                                ))}
                            </div>
                            {p.collective && <div>Colectivo: {p.collective}</div>}
                            <div>Locutores: {p.hosts.join(", ") || "—"}</div>
                            {!p.active && p.disableReason && (
                                <div className="note-box">
                                    <strong>Observación de deshabilitación:</strong> {p.disableReason}
                                </div>
                            )}
                            <div className="row">
                                <button onClick={() => startEdit(p)}>Editar</button>
                                {p.active ? (
                                    <button className="danger" onClick={() => openDisableModal(p)}>
                                        Deshabilitar
                                    </button>
                                ) : (
                                    <button className="secondary" onClick={() => handleEnable(p)}>
                                        Habilitar nuevamente
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}

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
                            El programa <strong>«{disablingProgram.name}»</strong> no se eliminará de la base de datos, pero dejará de ser visible en la programación y búsqueda de la app móvil.
                        </p>

                        <label>
                            Observación / motivo de deshabilitación
                            <textarea
                                value={disableReason}
                                onChange={(e) => setDisableReason(e.target.value)}
                                rows={3}
                                placeholder="Ej. Programa en receso semestral, cambio de temporada, fuera de parrilla…"
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
        </>
    );
}
