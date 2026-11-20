// src/pages/Careers.tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { groupByFacultyAndDepartment } from "../lib/careers";
import { normalizeText } from "../lib/text";
import {
    createCareer, listCareers, seedCareers, setCareerActive, updateCareer,
} from "../services/careersService";
import type { AcademicLevel, Campus, Career, Modality } from "../types";

interface CareerForm {
    code: string;
    name: string;
    faculty: string;
    department: string;
    level: AcademicLevel;
    campus: Campus;
    modality: Modality;
}

const EMPTY_FORM: CareerForm = {
    code: "",
    name: "",
    faculty: "",
    department: "",
    level: "pregrado",
    campus: "cucuta",
    modality: "presencial",
};

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

    const departments = useMemo(() => {
        const filtered = form.faculty.trim()
            ? careers.filter((c) => c.faculty === form.faculty.trim())
            : careers;
        return [...new Set(filtered.map((c) => c.department))].sort((a, b) => a.localeCompare(b));
    }, [careers, form.faculty]);

    const visible = useMemo(() => {
        const term = normalizeText(search.trim());
        return careers.filter((c) => {
            const statusOk = status === "all" || c.active === (status === "active");
            const textOk =
                term === "" ||
                normalizeText(`${c.code} ${(c.alternateCodes ?? []).join(" ")} ${c.name} ${c.department} ${c.faculty}`).includes(term);
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
            code: career.code,
            name: career.name,
            faculty: career.faculty,
            department: career.department,
            level: career.level,
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

        const code = form.code.replace(/\D+/g, "").slice(0, 3);
        const faculty = form.faculty.trim();
        const department = form.department.trim();
        let name = form.name.trim();
        if (code.length !== 3) {
            setError("El código de la carrera debe tener 3 dígitos numéricos (ej. 115 para Ingeniería de Sistemas).");
            return;
        }
        if (!name || !faculty || !department) {
            setError("Escribe el nombre del programa, la facultad y el departamento.");
            return;
        }
        if (form.campus === "ocana" && !/oca[ñn]a/i.test(name)) {
            name = `${name} (Ocaña)`;
        }

        setSaving(true);
        try {
            const input = {
                code,
                name,
                faculty,
                department,
                level: form.level,
                campus: form.campus,
                modality: form.modality,
            };
            if (editingId) {
                await updateCareer(editingId, input);
                resetForm();
                setMessage("Programa académico actualizado.");
            } else {
                const nextOrder = Math.max(0, ...careers.map((c) => c.order)) + 1;
                await createCareer(input, nextOrder);
                resetForm();
                setMessage("Programa académico agregado y habilitado.");
            }
            await reload();
        } catch {
            setError("No se pudo guardar el programa académico.");
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
            setError("No se pudo cambiar el estado del programa.");
        }
    };

    const handleSeed = async () => {
        setError("");
        setMessage("");
        try {
            const created = await seedCareers();
            setMessage(
                created === 0
                    ? "Toda la estructura (Códigos de 3 dígitos, Facultad → Departamento → Programa) ya estaba sincronizada."
                    : `Se sincronizaron ${created} programas con sus códigos institucionales en Firestore.`,
            );
            await reload();
        } catch {
            setError("No se pudo sincronizar la estructura inicial.");
        }
    };

    return (
        <>
            <form className="card" onSubmit={handleSubmit}>
                <h2>{editingId ? "Editar programa académico" : "Nuevo programa académico"}</h2>
                <p className="muted">
                    Estructura en Firestore: <strong>Código (3 dígitos) · Facultad → Departamento → Programa</strong>.
                    Los primeros 3 dígitos del código estudiantil de 7 dígitos (ej. <code>115</code> en <code>1151594</code>)
                    identifican automáticamente la carrera del estudiante.
                </p>

                <div className="row">
                    <label style={{ flex: "0 0 180px" }}>
                        Código carrera (3 dígitos)
                        <input
                            value={form.code}
                            onChange={(e) => setField("code", e.target.value.replace(/\D+/g, "").slice(0, 3))}
                            placeholder="Ej. 115"
                            maxLength={3}
                            required
                        />
                    </label>
                    <label style={{ flex: "1 1 280px" }}>
                        Nombre del programa (pregrado o posgrado)
                        <input value={form.name} onChange={(e) => setField("name", e.target.value)} required />
                    </label>
                </div>

                <div className="row">
                    <label>Facultad
                        <input
                            list="faculties"
                            value={form.faculty}
                            onChange={(e) => setField("faculty", e.target.value)}
                            placeholder="Ej. Facultad de Ingeniería"
                            required
                        />
                        <datalist id="faculties">
                            {faculties.map((f) => <option key={f} value={f} />)}
                        </datalist>
                    </label>

                    <label>Departamento
                        <input
                            list="departments"
                            value={form.department}
                            onChange={(e) => setField("department", e.target.value)}
                            placeholder="Ej. Departamento de Sistemas e Informática"
                            required
                        />
                        <datalist id="departments">
                            {departments.map((d) => <option key={d} value={d} />)}
                        </datalist>
                    </label>
                </div>

                <div className="row">
                    <label>Nivel académico
                        <select value={form.level} onChange={(e) => setField("level", e.target.value as AcademicLevel)}>
                            <option value="pregrado">Pregrado</option>
                            <option value="posgrado">Posgrado</option>
                        </select>
                    </label>
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
                {message && <p className="ok">{message}</p>}

                <div className="row">
                    <button type="submit" disabled={saving}>
                        {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar programa"}
                    </button>
                    {editingId && (
                        <button type="button" className="secondary" onClick={resetForm}>Cancelar edición</button>
                    )}
                </div>
            </form>

            <div className="section-head">
                <h2>Estructura académica (Código · Facultad → Departamento → Programa)</h2>
                <span className="muted">{activeCount} habilitados de {careers.length}</span>
            </div>

            <div className="toolbar">
                <input
                    className="search"
                    type="search"
                    placeholder="Buscar por código (ej. 115), programa, departamento o facultad"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
                    <option value="all">Todos</option>
                    <option value="active">Habilitados</option>
                    <option value="inactive">Inhabilitados</option>
                </select>
            </div>

            {visible.length === 0 && <p className="empty">No hay programas para este filtro.</p>}

            {groupByFacultyAndDepartment(visible).map((facultyGroup) => (
                <div className="card" key={facultyGroup.title}>
                    <strong>{facultyGroup.title}</strong>
                    {facultyGroup.departments.map((dept) => (
                        <div className="dept-group" key={dept.departmentId}>
                            <div className="dept-title">{dept.department}</div>
                            <div>
                                {dept.careers.map((c) => (
                                    <div className="list-row" key={c.id}>
                                        <div className="row">
                                            {c.code && (
                                                <span className="tag active-day" title="Código institucional UFPS">
                                                    Cód. {c.code}
                                                </span>
                                            )}
                                            <span>{c.name}</span>
                                            {c.level === "posgrado" && <span className="tag">Posgrado</span>}
                                            {c.modality === "distancia" && <span className="tag">Distancia</span>}
                                            {!c.active && <span className="tag off">Inhabilitado</span>}
                                        </div>
                                        <div className="row">
                                            <label className="switch">
                                                <input type="checkbox" checked={c.active} onChange={() => toggleActive(c)} />
                                                Habilitado
                                            </label>
                                            <button className="ghost" onClick={() => startEdit(c)}>Editar</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ))}

            <details className="card">
                <summary>Herramientas</summary>
                <p className="muted">
                    Sincroniza la estructura inicial de Códigos (3 dígitos), Facultades, Departamentos y Programas en Firestore.
                </p>
                <div>
                    <button className="ghost" onClick={handleSeed}>Sincronizar códigos y estructura inicial</button>
                </div>
            </details>
        </>
    );
}
