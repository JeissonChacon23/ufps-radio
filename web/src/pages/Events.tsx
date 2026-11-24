// src/pages/Events.tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import MonthNav from "../components/MonthNav";
import TimeInput from "../components/TimeInput";
import { PROFILE_AUDIENCES } from "../constants/audiences";
import {
    formatDate,
    formatTime12h,
    fromDateInput,
    overlapsMonth,
    startOfMonth,
    toDateInput,
} from "../lib/dates";
import { groupByFacultyAndDepartment, type DepartmentGroup } from "../lib/careers";
import { normalizeText } from "../lib/text";
import { createEvent, disableEvent, enableEvent, listEvents, updateEvent } from "../services/eventsService";
import { listCareers } from "../services/careersService";
import type { Career, RadioEvent } from "../types";

interface EventForm {
    title: string;
    date: string;
    startTime: string;
    endDate: string;
    endTime: string;
    specialGuest: string;
    description: string;
    link: string;
    audience: string[];
}

const EMPTY_FORM: EventForm = {
    title: "",
    date: "",
    startTime: "",
    endDate: "",
    endTime: "",
    specialGuest: "",
    description: "",
    link: "",
    audience: [],
};

const PROFILE_IDS = new Set(PROFILE_AUDIENCES.map((o) => o.id));

type EventStatusFilter = "all" | "active" | "disabled";

export default function Events() {
    const [events, setEvents] = useState<RadioEvent[]>([]);
    const [careers, setCareers] = useState<Career[]>([]);
    const [form, setForm] = useState<EventForm>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<EventStatusFilter>("all");
    const [showAll, setShowAll] = useState(false);
    const [disablingEvent, setDisablingEvent] = useState<RadioEvent | null>(null);
    const [disableReason, setDisableReason] = useState("");
    const [disableError, setDisableError] = useState("");
    const [disabling, setDisabling] = useState(false);

    useEffect(() => {
        listEvents().then(setEvents);
        listCareers().then(setCareers);
    }, []);

    const today = toDateInput(new Date());

    /** Returns a conflict reason if the given "HH:mm" on `form.date` overlaps an existing active event or is in the past. */
    const getEventStartTimeConflict = (hhmm: string): string | null => {
        if (!form.date || !hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;

        const candidateStart = fromDateInput(form.date, hhmm);
        const nowFloor = new Date();
        nowFloor.setSeconds(0, 0);
        if (candidateStart < nowFloor) {
            return "Hora pasada";
        }

        const candidateEnd = new Date(candidateStart.getTime() + 60 * 60 * 1000);
        for (const ev of events) {
            if (ev.id === editingId || !ev.active) continue;
            const evStart = ev.date;
            const evEnd = ev.endDate ?? new Date(evStart.getTime() + 60 * 60 * 1000);
            if (candidateStart < evEnd && evStart < candidateEnd) {
                return `Ocupada por «${ev.title}» (${formatTime12h(ev.startTime)})`;
            }
        }
        return null;
    };

    const currentEventStartConflict =
        form.date && form.startTime ? getEventStartTimeConflict(form.startTime) : null;

    const eventHourSlots = useMemo(() => {
        if (!form.date) return [];
        return Array.from({ length: 24 }, (_, h) => {
            const hhmm = `${String(h).padStart(2, "0")}:00`;
            const conflict = getEventStartTimeConflict(hhmm);
            return {
                hhmm,
                label: formatTime12h(hhmm),
                conflict,
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, form.date, editingId]);

    const audienceLabel = (id: string) => {
        const profile = PROFILE_AUDIENCES.find((o) => o.id === id);
        if (profile) return profile.label;
        const deptCareer = careers.find((c) => c.departmentId === id);
        if (deptCareer) return deptCareer.department;
        const career = careers.find((c) => c.id === id);
        if (career) return career.name;
        return id;
    };

    // Disabled careers stay visible only when the event already uses them.
    const selectableCareers = useMemo(
        () =>
            careers.filter(
                (c) =>
                    c.active ||
                    form.audience.includes(c.id) ||
                    form.audience.includes(c.departmentId),
            ),
        [careers, form.audience],
    );

    const hierarchy = useMemo(
        () => groupByFacultyAndDepartment(selectableCareers),
        [selectableCareers],
    );

    const isTodos = form.audience.includes("todos");
    const hasStudentOrGrad =
        form.audience.includes("estudiante") || form.audience.includes("egresado");
    const hasDocente =
        form.audience.includes("docente") || form.audience.includes("personal_ufps");

    const filteredEvents = useMemo(() => {
        const term = normalizeText(search.trim());
        const list = events.filter((ev) => {
            const inRange = showAll || overlapsMonth(ev.date, ev.endDate, month);
            const statusOk =
                statusFilter === "all" ||
                (statusFilter === "active" ? ev.active : !ev.active);
            const matches =
                term === "" ||
                normalizeText(
                    `${ev.title} ${ev.description} ${ev.specialGuest} ${ev.disableReason}`,
                ).includes(term);
            return inRange && statusOk && matches;
        });
        return list.sort((a, b) =>
            showAll ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime(),
        );
    }, [events, month, search, statusFilter, showAll]);

    const setField = <K extends keyof EventForm>(key: K, value: EventForm[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const toggleProfileAudience = (id: string) => {
        if (id === "todos") {
            setField("audience", form.audience.includes("todos") ? [] : ["todos"]);
            return;
        }
        const withoutTodos = form.audience.filter((a) => a !== "todos");
        const exists = withoutTodos.includes(id);
        let next = exists ? withoutTodos.filter((a) => a !== id) : [...withoutTodos, id];

        // Clean up academic filters that no longer apply to the remaining profiles
        const nextHasStudentOrGrad = next.includes("estudiante") || next.includes("egresado");
        const nextHasDocente = next.includes("docente") || next.includes("personal_ufps");
        if (!nextHasStudentOrGrad) {
            const careerIds = new Set(careers.map((c) => c.id));
            next = next.filter((a) => !careerIds.has(a));
        }
        if (!nextHasDocente) {
            next = next.filter((a) => !a.startsWith("dept:"));
        }
        setField("audience", next);
    };

    const toggleAudienceItem = (id: string) =>
        setField(
            "audience",
            form.audience.includes(id) ? form.audience.filter((a) => a !== id) : [...form.audience, id],
        );

    const toggleDepartment = (dept: DepartmentGroup) => {
        const targetIds: string[] = [];
        if (hasDocente) targetIds.push(dept.departmentId);
        if (hasStudentOrGrad) targetIds.push(...dept.careers.map((c) => c.id));
        if (targetIds.length === 0) return;

        const allSelected = targetIds.every((id) => form.audience.includes(id));
        if (allSelected) {
            const removeSet = new Set(targetIds);
            setField("audience", form.audience.filter((a) => !removeSet.has(a)));
        } else {
            const merged = new Set([...form.audience, ...targetIds]);
            setField("audience", [...merged]);
        }
    };

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setError("");
    };

    const startEdit = (ev: RadioEvent) => {
        setForm({
            title: ev.title,
            date: toDateInput(ev.date),
            startTime: ev.startTime,
            endDate: ev.endDate ? toDateInput(ev.endDate) : "",
            endTime: ev.endTime,
            specialGuest: ev.specialGuest,
            description: ev.description,
            link: ev.link,
            audience: ev.audience,
        });
        setEditingId(ev.id);
        setError("");
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");

        const selectedProfiles = form.audience.filter((a) => PROFILE_IDS.has(a));
        if (selectedProfiles.length === 0) {
            setError("Selecciona al menos un perfil en Público objetivo.");
            return;
        }
        if (!form.date) {
            setError("Selecciona la fecha del evento.");
            return;
        }
        if (!form.startTime || !/^\d{2}:\d{2}$/.test(form.startTime)) {
            setError("Selecciona la hora de inicio del evento.");
            return;
        }

        const startDateTime = fromDateInput(form.date, form.startTime);
        const nowFloor = new Date();
        nowFloor.setSeconds(0, 0);

        // W5: Reject creating or moving an event to a past date/time.
        if (startDateTime < nowFloor) {
            setError(
                "No se puede crear ni mover un evento a una fecha u hora que ya pasó.",
            );
            return;
        }

        let endDateTime: Date | null = null;
        if (form.endDate || form.endTime) {
            const effectiveEndDate = form.endDate || form.date;
            const effectiveEndTime = form.endTime || "23:59";
            endDateTime = fromDateInput(effectiveEndDate, effectiveEndTime);
            if (endDateTime <= startDateTime) {
                setError("La fecha y hora final debe ser posterior a la fecha y hora de inicio.");
                return;
            }
        }

        setSaving(true);
        try {
            const input = {
                title: form.title.trim(),
                audience: form.audience,
                description: form.description.trim(),
                link: form.link.trim(),
                specialGuest: form.specialGuest.trim(),
                startTime: form.startTime,
                endTime: form.endTime,
                date: startDateTime,
                endDate: endDateTime,
            };
            if (editingId) {
                await updateEvent(editingId, input);
            } else {
                await createEvent(input);
            }
            // Jump to the month of the saved event so it is visible in the list.
            if (!showAll) setMonth(startOfMonth(input.date));
            resetForm();
            setEvents(await listEvents());
        } catch {
            setError("No se pudo guardar el evento.");
        } finally {
            setSaving(false);
        }
    };

    const openDisableModal = (ev: RadioEvent) => {
        setDisablingEvent(ev);
        setDisableReason(ev.disableReason || "");
        setDisableError("");
    };

    const handleConfirmDisable = async (e: FormEvent) => {
        e.preventDefault();
        if (!disablingEvent) return;
        const cleanReason = disableReason.trim();
        if (!cleanReason) {
            setDisableError("Escribe una observación o motivo para deshabilitar el evento.");
            return;
        }
        setDisabling(true);
        setDisableError("");
        try {
            await disableEvent(disablingEvent.id, cleanReason);
            if (editingId === disablingEvent.id) resetForm();
            setDisablingEvent(null);
            setDisableReason("");
            setEvents(await listEvents());
        } catch {
            setDisableError("No se pudo deshabilitar el evento.");
        } finally {
            setDisabling(false);
        }
    };

    const handleEnable = async (ev: RadioEvent) => {
        await enableEvent(ev.id);
        setEvents(await listEvents());
    };

    return (
        <>
            <form className="card" onSubmit={handleSubmit}>
                <h2>{editingId ? "Editar evento" : "Nuevo evento"}</h2>

                <div className="row">
                    <label>Título del evento
                        <input value={form.title} onChange={(e) => setField("title", e.target.value)} required />
                    </label>
                    <label>Invitado especial (opcional)
                        <input
                            value={form.specialGuest}
                            onChange={(e) => setField("specialGuest", e.target.value)}
                            placeholder="Ej. Dr. Juan Pérez, Conferencista invitado"
                        />
                    </label>
                </div>

                <div className="row">
                    <label>Fecha de inicio
                        <input
                            type="date"
                            value={form.date}
                            min={today}
                            onChange={(e) => setField("date", e.target.value)}
                            required
                        />
                    </label>
                    <label>Hora de inicio
                        <TimeInput
                            value={form.startTime}
                            onChange={(val) => setField("startTime", val)}
                            isTimeDisabled={getEventStartTimeConflict}
                            disabled={!form.date}
                            required
                        />
                        {!form.date && (
                            <small className="muted">
                                Selecciona primero la fecha de inicio para ver las horas disponibles.
                            </small>
                        )}
                        {currentEventStartConflict && (
                            <small className="error">No disponible: {currentEventStartConflict}</small>
                        )}
                    </label>
                </div>

                {form.date && (
                    <div className="slot-picker-box">
                        <div className="slot-picker-head">
                            <strong>Disponibilidad de horarios para el {form.date}</strong>
                            <small className="muted">
                                Las horas pasadas u ocupadas por otros eventos aparecen inhabilitadas; toca una disponible para seleccionarla.
                            </small>
                        </div>
                        <div className="slot-grid">
                            {eventHourSlots.map((slot) => {
                                const isSelected = form.startTime === slot.hhmm;
                                const isBlocked = Boolean(slot.conflict);
                                const shortStatus = slot.conflict === "Hora pasada" ? "Pasada" : isBlocked ? "Ocupada" : "Disponible";
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
                    <label>Fecha final (opcional)
                        <input
                            type="date"
                            value={form.endDate}
                            min={form.date || today}
                            onChange={(e) => setField("endDate", e.target.value)}
                        />
                    </label>
                    <label>Hora final (opcional)
                        <TimeInput
                            value={form.endTime}
                            onChange={(val) => setField("endTime", val)}
                            required={false}
                        />
                    </label>
                </div>

                <fieldset>
                    <legend>Público objetivo</legend>
                    <div className="row">
                        {PROFILE_AUDIENCES.map((o) => (
                            <label key={o.id} className="check">
                                <input
                                    type="checkbox"
                                    checked={form.audience.includes(o.id)}
                                    onChange={() => toggleProfileAudience(o.id)}
                                />
                                {o.label}
                            </label>
                        ))}
                    </div>
                    {isTodos && (
                        <small className="muted">
                            Al elegir «Todos», el evento será visible para toda la comunidad universitaria sin filtrar por departamento ni programa.
                        </small>
                    )}
                </fieldset>

                {!isTodos && (hasDocente || hasStudentOrGrad) && (
                    <fieldset>
                        <legend>
                            Segmentación académica opcional (Facultad → Departamento
                            {hasStudentOrGrad ? " → Programa" : ""})
                        </legend>
                        <small className="muted">
                            {hasDocente && !hasStudentOrGrad
                                ? "Los docentes se segmentan por departamento. Si no marcas ninguno, aplica a todos los departamentos."
                                : hasStudentOrGrad && !hasDocente
                                  ? "Estudiantes y egresados se segmentan por programa (puedes marcar un departamento entero o programas específicos). Si no marcas ninguno, aplica a todos los programas."
                                  : "Marca departamentos para docentes y programas para estudiantes/egresados. Si no marcas ninguno, aplica a toda la facultad/universidad del perfil elegido."}
                        </small>
                        {careers.length === 0 && (
                            <p className="muted">Aún no hay programas cargados en Firestore.</p>
                        )}
                        <div className="scroll-box">
                            {hierarchy.map((facultyGroup) => (
                                <div className="faculty-block" key={facultyGroup.title}>
                                    <strong className="faculty-title">{facultyGroup.title}</strong>
                                    {facultyGroup.departments.map((dept) => {
                                        const deptTargets = [
                                            ...(hasDocente ? [dept.departmentId] : []),
                                            ...(hasStudentOrGrad ? dept.careers.map((c) => c.id) : []),
                                        ];
                                        const deptChecked =
                                            deptTargets.length > 0 &&
                                            deptTargets.every((id) => form.audience.includes(id));

                                        return (
                                            <div className="dept-group" key={dept.departmentId}>
                                                <label className="check dept-check">
                                                    <input
                                                        type="checkbox"
                                                        checked={deptChecked}
                                                        onChange={() => toggleDepartment(dept)}
                                                    />
                                                    <strong>{dept.department}</strong>
                                                    {hasDocente && (
                                                        <span className="tag">Docentes</span>
                                                    )}
                                                </label>
                                                {hasStudentOrGrad && (
                                                    <div className="program-list">
                                                        {dept.careers.map((c) => (
                                                            <label key={c.id} className="check">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={form.audience.includes(c.id)}
                                                                    onChange={() => toggleAudienceItem(c.id)}
                                                                />
                                                                <span>
                                                                    {c.name}
                                                                    {c.level === "posgrado" ? " (Posgrado)" : ""}
                                                                    {!c.active ? " (inhabilitado)" : ""}
                                                                </span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </fieldset>
                )}

                <label>Descripción
                    <textarea
                        value={form.description}
                        onChange={(e) => setField("description", e.target.value)}
                        rows={4}
                        required
                    />
                </label>

                <label>Enlace de la fuente (opcional)
                    <input
                        type="url"
                        value={form.link}
                        onChange={(e) => setField("link", e.target.value)}
                        placeholder="https://"
                    />
                </label>

                {error && <p className="error">{error}</p>}

                <div className="row">
                    <button type="submit" disabled={saving}>
                        {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Publicar evento"}
                    </button>
                    {editingId && (
                        <button type="button" className="secondary" onClick={resetForm}>
                            Cancelar edición
                        </button>
                    )}
                </div>
            </form>

            <div className="section-head">
                <h2>Eventos publicados</h2>
                <span className="muted">
                    {filteredEvents.length} {filteredEvents.length === 1 ? "evento" : "eventos"}
                </span>
            </div>

            <div className="toolbar">
                {!showAll && <MonthNav month={month} onChange={setMonth} />}
                <input
                    className="search"
                    type="search"
                    placeholder="Buscar por título, invitado, descripción u observación"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as EventStatusFilter)}
                >
                    <option value="all">Todos</option>
                    <option value="active">Activos</option>
                    <option value="disabled">Deshabilitados</option>
                </select>
                <label className="check">
                    <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
                    Ver todos los meses
                </label>
            </div>

            {filteredEvents.length === 0 && (
                <p className="empty">
                    {events.length === 0 ? "Aún no hay eventos." : "No hay eventos para este filtro."}
                </p>
            )}

            {filteredEvents.map((ev) => (
                <div className="card" key={ev.id} style={ev.active ? undefined : { opacity: 0.85 }}>
                    <div className="row" style={{ alignItems: "center" }}>
                        <strong>{ev.title}</strong>
                        {!ev.active && <span className="tag off">Deshabilitado · No visible en la app</span>}
                    </div>
                    <div className="muted">
                        {formatDate(ev.date)}
                        {ev.startTime && ` · ${formatTime12h(ev.startTime)}`}
                        {ev.endDate && (
                            <>
                                {" — "}
                                {toDateInput(ev.endDate) !== toDateInput(ev.date) && `${formatDate(ev.endDate)} `}
                                {ev.endTime && formatTime12h(ev.endTime)}
                            </>
                        )}
                    </div>
                    {ev.specialGuest && (
                        <div>
                            <strong>Invitado especial:</strong> {ev.specialGuest}
                        </div>
                    )}
                    <div className="row">
                        {ev.audience.map((a) => (
                            <span className="tag" key={a}>{audienceLabel(a)}</span>
                        ))}
                    </div>
                    <p>{ev.description}</p>
                    {!ev.active && ev.disableReason && (
                        <div className="note-box">
                            <strong>Observación de deshabilitación:</strong> {ev.disableReason}
                        </div>
                    )}
                    <div className="row">
                        {ev.link && <a href={ev.link} target="_blank" rel="noreferrer">Ver fuente</a>}
                        <button onClick={() => startEdit(ev)}>Editar</button>
                        {ev.active ? (
                            <button className="danger" onClick={() => openDisableModal(ev)}>
                                Deshabilitar
                            </button>
                        ) : (
                            <button className="secondary" onClick={() => handleEnable(ev)}>
                                Habilitar nuevamente
                            </button>
                        )}
                    </div>
                </div>
            ))}

            {disablingEvent && (
                <div
                    className="modal-backdrop"
                    onClick={() => !disabling && setDisablingEvent(null)}
                >
                    <form
                        className="card modal-card"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={handleConfirmDisable}
                    >
                        <div className="section-head">
                            <h2 style={{ margin: 0 }}>Deshabilitar evento</h2>
                            <button
                                type="button"
                                className="ghost btn-sm"
                                onClick={() => setDisablingEvent(null)}
                                disabled={disabling}
                            >
                                ✕
                            </button>
                        </div>

                        <p className="muted" style={{ margin: 0 }}>
                            El evento <strong>«{disablingEvent.title}»</strong> no se eliminará de la base de datos, pero dejará de ser visible para todos los usuarios en la app móvil.
                        </p>

                        <label>
                            Observación / motivo de deshabilitación
                            <textarea
                                value={disableReason}
                                onChange={(e) => setDisableReason(e.target.value)}
                                rows={3}
                                placeholder="Ej. Evento aplazado por la facultad, cambio de fecha, cancelado por el organizador…"
                                required
                            />
                        </label>

                        {disableError && <p className="error">{disableError}</p>}

                        <div className="row" style={{ justifyContent: "flex-end" }}>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => setDisablingEvent(null)}
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
