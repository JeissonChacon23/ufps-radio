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
import { createProgram, deleteProgram, listPrograms, updateProgram } from "../services/programsService";
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

    useEffect(() => {
        listPrograms().then(setPrograms);
    }, []);

    const filteredPrograms = useMemo(() => {
        const term = normalizeText(search.trim());
        return programs.filter((p) => {
            const dayOk = dayFilter === "all" || p.days.includes(dayFilter);
            const statusOk = statusFilter === "all" || p.active === (statusFilter === "active");
            const textOk =
                term === "" || normalizeText([p.name, p.collective, ...p.hosts].join(" ")).includes(term);
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

        // W2: Validate schedule overlaps on shared emission days.
        const newStart = timeToMinutes(form.startTime);
        const newEnd = newStart + duration;
        for (const other of programs) {
            if (other.id === editingId) continue;
            if (!other.active && !form.active) continue;
            const sharedDays = form.days.filter((d) => other.days.includes(d));
            if (sharedDays.length === 0) continue;

            const otherStart = timeToMinutes(other.startTime);
            const otherEnd = otherStart + other.durationMinutes;
            if (newStart < otherEnd && otherStart < newEnd) {
                const dayNames = DAYS.filter((d) => sharedDays.includes(d.value))
                    .map((d) => d.label)
                    .join(", ");
                const otherEndStr = addMinutes(other.startTime, other.durationMinutes);
                setError(
                    `Cruce de horario: el programa se solapa el día ${dayNames} con «${other.name}» (${other.startTime} – ${otherEndStr}).`,
                );
                return;
            }
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

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar este programa?")) return;
        await deleteProgram(id);
        if (editingId === id) resetForm();
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
                            required
                        />
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
                    <button type="submit" disabled={saving}>
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
                    <option value="inactive">Inactivos</option>
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
                    <div className="card media-card" key={p.id}>
                        {p.artworkDriveId
                            ? <DriveImage id={p.artworkDriveId} size={160} />
                            : <div className="thumb placeholder" />}
                        <div className="media-body">
                            <div className="row">
                                <strong>{p.name}</strong>
                                {!p.active && <span className="tag off">Inactivo</span>}
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
                            <div className="row">
                                <button onClick={() => startEdit(p)}>Editar</button>
                                <button className="danger" onClick={() => handleDelete(p.id)}>Eliminar</button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </>
    );
}
