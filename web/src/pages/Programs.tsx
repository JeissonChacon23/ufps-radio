import { useEffect, useState, type FormEvent } from "react";
import { DAYS } from "../constants/audiences";
import { addMinutes } from "../lib/dates";
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
}

const EMPTY_FORM: ProgramForm = {
    name: "", days: [], startTime: "", durationMinutes: 60, collective: "", hosts: "", active: true,
};

export default function Programs() {
    const [programs, setPrograms] = useState<Program[]>([]);
    const [form, setForm] = useState<ProgramForm>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        listPrograms().then(setPrograms);
    }, []);

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
                        <input type="number" min={5} step={5} value={form.durationMinutes}
                               onChange={(e) => setField("durationMinutes", Number(e.target.value))} required />
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

            <h2>Programación publicada</h2>
            {programs.length === 0 && <p>Aún no hay programas.</p>}
            {programs.map((p) => (
                <div className="card" key={p.id}>
                    <strong>{p.name}</strong> {!p.active && <span className="tag">Inactivo</span>}
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
            ))}
        </>
    );
}