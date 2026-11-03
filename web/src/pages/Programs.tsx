// src/pages/Programs.tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import DriveImage from "../components/DriveImage";
import DriveImageField from "../components/DriveImageField";
import { DAYS } from "../constants/audiences";
import { addMinutes } from "../lib/dates";
import { driveViewUrl, extractDriveId } from "../lib/drive";
import { normalizeText } from "../lib/text";
import { createProgram, deleteProgram, listPrograms, updateProgram } from "../services/programsService";
import type { Program } from "../types";

interface ProgramForm {
    name: string;
    days: number[];
    startTime: string;
    durationMinutes: number;
    collective: string;
    hosts: string;
    active: boolean;
    artworkLink: string;
}

const EMPTY_FORM: ProgramForm = {
    name: "", days: [], startTime: "", durationMinutes: 60, collective: "", hosts: "",
    active: true, artworkLink: "",
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
            durationMinutes: p.durationMinutes,
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
            setError("Selecciona al menos un día.");
            return;
        }
        const artworkDriveId = extractDriveId(form.artworkLink);
        if (!artworkDriveId) {
            setError("Pega un enlace válido de Google Drive para la imagen del programa.");
            return;
        }
        setSaving(true);
        try {
            const input = {
                name: form.name.trim(),
                days: form.days,
                startTime: form.startTime,
                durationMinutes: form.durationMinutes,
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

    return (
        <>
            <form className="card" onSubmit={handleSubmit}>
                <h2>{editingId ? "Editar programa" : "Nuevo programa"}</h2>

                <label>Nombre del programa
                    <input value={form.name} onChange={(e) => setField("name", e.target.value)} required />
                </label>

                <DriveImageField
                    label="Imagen del programa (artwork)"
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
                        <input type="time" value={form.startTime} onChange={(e) => setField("startTime", e.target.value)} required />
                    </label>
                    <label>Duración (minutos)
                        <input
                            type="number"
                            min={5}
                            step={5}
                            value={form.durationMinutes}
                            onChange={(e) => setField("durationMinutes", Number(e.target.value))}
                            required
                        />
                    </label>
                </div>

                <label>Colectivo
                    <input value={form.collective} onChange={(e) => setField("collective", e.target.value)} />
                </label>

                <label>Locutores (separados por coma)
                    <input value={form.hosts} onChange={(e) => setField("hosts", e.target.value)} />
                </label>

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
                <h2>Programación publicada</h2>
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
                        {d.short} <small>{programs.filter((p) => p.days.includes(d.value)).length}</small>
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

            {filteredPrograms.map((p) => (
                <div className="card media-card" key={p.id}>
                    {p.artworkDriveId
                        ? <DriveImage id={p.artworkDriveId} size={160} />
                        : <div className="thumb placeholder" />}
                    <div className="media-body">
                        <div className="row">
                            <strong>{p.name}</strong>
                            {!p.active && <span className="tag off">Inactivo</span>}
                        </div>
                        <div>
                            {DAYS.filter((d) => p.days.includes(d.value)).map((d) => d.short).join(", ")} ·{" "}
                            {p.startTime} – {addMinutes(p.startTime, p.durationMinutes)} ({p.durationMinutes} min)
                        </div>
                        {p.collective && <div>Colectivo: {p.collective}</div>}
                        <div>Locutores: {p.hosts.join(", ") || "—"}</div>
                        <div className="row">
                            <button onClick={() => startEdit(p)}>Editar</button>
                            <button className="danger" onClick={() => handleDelete(p.id)}>Eliminar</button>
                        </div>
                    </div>
                </div>
            ))}
        </>
    );
}