// src/pages/Careers.tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { groupCareers } from "../lib/careers";
import { normalizeText } from "../lib/text";
import {
    createCareer, listCareers, seedCareers, setCareerActive, updateCareer,
} from "../services/careersService";
import type { Campus, Career, Modality } from "../types";

interface CareerForm {
    name: string;
    faculty: string;
    campus: Campus;
    modality: Modality;
}

const EMPTY_FORM: CareerForm = { name: "", faculty: "", campus: "cucuta", modality: "presencial" };

type StatusFilter = "all" | "active" | "inactive";

export default function Careers() {
    const [careers, setCareers] = useState<Career[]>([]);
    const [form, setForm] = useState<CareerForm>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState<StatusFilter>("all");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");

    const reload = async () => setCareers(await listCareers());

    useEffect(() => {
        listCareers().then(setCareers);
    }, []);

    const faculties = useMemo(
        () => [...new Set(careers.map((c) => c.faculty))].sort((a, b) => a.localeCompare(b)),
        [careers],
    );

    const visible = useMemo(() => {
        const term = normalizeText(search.trim());
        return careers.filter((c) => {
            const statusOk = status === "all" || c.active === (status === "active");
            const textOk = term === "" || normalizeText(c.name).includes(term);
            return statusOk && textOk;
        });
    }, [careers, search, status]);

    const activeCount = careers.filter((c) => c.active).length;

    const setField = <K extends keyof CareerForm>(key: K, value: CareerForm[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
    };

    const startEdit = (career: Career) => {
        setForm({
            name: career.name,
            faculty: career.faculty,
            campus: career.campus,
            modality: career.modality,
        });
        setEditingId(career.id);
        setError("");
        setMessage("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setMessage("");

        const faculty = form.faculty.trim();
        let name = form.name.trim();
        if (!name || !faculty) {
            setError("Escribe el nombre de la carrera y la facultad.");
            return;
        }
        if (form.campus === "ocana" && !/oca[ñn]a/i.test(name)) {
            name = `${name} (Ocaña)`;
        }

        setSaving(true);
        try {
            const input = { name, faculty, campus: form.campus, modality: form.modality };
            if (editingId) {
                await updateCareer(editingId, input);
                resetForm();
                setMessage("Carrera actualizada.");
            } else {
                const nextOrder = Math.max(0, ...careers.map((c) => c.order)) + 1;
                await createCareer(input, nextOrder);
                resetForm();
                setMessage("Carrera agregada y habilitada.");
            }
            await reload();
        } catch {
            setError("No se pudo guardar la carrera.");
        } finally {
            setSaving(false);
        }
    };

    const toggleActive = async (career: Career) => {
        setError("");
        setMessage("");
        try {
            await setCareerActive(career.id, !career.active);
            setCareers((prev) =>
                prev.map((c) => (c.id === career.id ? { ...c, active: !c.active } : c)),
            );
        } catch {
            setError("No se pudo cambiar el estado de la carrera.");
        }
    };

    const handleSeed = async () => {
        setError("");
        setMessage("");
        try {
            const created = await seedCareers();
            setMessage(
                created === 0 ? "Todas las carreras iniciales ya estaban cargadas." : `Se cargaron ${created} carreras.`,
            );
            await reload();
        } catch {
            setError("No se pudieron cargar las carreras iniciales.");
        }
    };

    return (
        <>
            <form className="card" onSubmit={handleSubmit}>
                <h2>{editingId ? "Editar carrera" : "Nueva carrera"}</h2>
                <p className="muted">
                    Las carreras inhabilitadas no aparecen en el registro de la app ni al crear eventos.
                    Los estudiantes que ya se registraron conservan su perfil.
                </p>

                <label>Nombre
                    <input value={form.name} onChange={(e) => setField("name", e.target.value)} required />
                </label>

                <label>Facultad
                    <input list="faculties" value={form.faculty} onChange={(e) => setField("faculty", e.target.value)} required />
                    <datalist id="faculties">
                        {faculties.map((f) => <option key={f} value={f} />)}
                    </datalist>
                </label>

                <div className="row">
                    <label>Sede
                        <select value={form.campus} onChange={(e) => setField("campus", e.target.value as Campus)}>
                            <option value="cucuta">Cúcuta</option>
                            <option value="ocana">Ocaña</option>
                        </select>
                    </label>
                    <label>Modalidad
                        <select value={form.modality} onChange={(e) => setField("modality", e.target.value as Modality)}>
                            <option value="presencial">Presencial</option>
                            <option value="distancia">A distancia</option>
                        </select>
                    </label>
                </div>

                {error && <p className="error">{error}</p>}
                {message && <p className="muted">{message}</p>}

                <div className="row">
                    <button type="submit" disabled={saving}>
                        {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar carrera"}
                    </button>
                    {editingId && (
                        <button type="button" className="secondary" onClick={resetForm}>Cancelar edición</button>
                    )}
                </div>
            </form>

            <div className="section-head">
                <h2>Carreras</h2>
                <span className="muted">{activeCount} habilitadas de {careers.length}</span>
            </div>

            <div className="toolbar">
                <input
                    className="search"
                    type="search"
                    placeholder="Buscar carrera"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                    <option value="all">Todas</option>
                    <option value="active">Habilitadas</option>
                    <option value="inactive">Inhabilitadas</option>
                </select>
            </div>

            {visible.length === 0 && <p className="empty">No hay carreras para este filtro.</p>}

            {groupCareers(visible).map((group) => (
                <div className="card" key={group.title}>
                    <strong>{group.title}</strong>
                    <div>
                        {group.careers.map((c) => (
                            <div className="list-row" key={c.id}>
                                <div>
                                    {c.name}{" "}
                                    {c.modality === "distancia" && <span className="tag">Distancia</span>}{" "}
                                    {!c.active && <span className="tag off">Inhabilitada</span>}
                                </div>
                                <div className="row">
                                    <label className="switch">
                                        <input type="checkbox" checked={c.active} onChange={() => toggleActive(c)} />
                                        Habilitada
                                    </label>
                                    <button className="ghost" onClick={() => startEdit(c)}>Editar</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            <details className="card">
                <summary>Herramientas</summary>
                <p className="muted">Carga las carreras iniciales que falten. No toca las que ya existen.</p>
                <div>
                    <button className="ghost" onClick={handleSeed}>Cargar carreras iniciales</button>
                </div>
            </details>
        </>
    );
}