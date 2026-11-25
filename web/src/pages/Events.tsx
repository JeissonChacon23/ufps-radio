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
const WEEKDAY_HEADERS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

type EventStatusFilter = "all" | "active" | "disabled";

function eventCoversDay(ev: RadioEvent, dayKey: string): boolean {
    const startKey = toDateInput(ev.date);
    const endKey = ev.endDate ? toDateInput(ev.endDate) : startKey;
    return dayKey >= startKey && dayKey <= endKey;
}

function buildCalendarCells(monthStart: Date): Array<{ date: Date; key: string; inMonth: boolean }> {
    const year = monthStart.getFullYear();
    const month = monthStart.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    // ISO Monday-first offset: Monday=0 ... Sunday=6
    const startOffset = (first.getDay() + 6) % 7;
    const totalDays = last.getDate();
    const totalCells = Math.ceil((startOffset + totalDays) / 7) * 7;

    const cells: Array<{ date: Date; key: string; inMonth: boolean }> = [];
    for (let i = 0; i < totalCells; i++) {
        const d = new Date(year, month, 1 - startOffset + i);
        cells.push({
            date: d,
            key: toDateInput(d),
            inMonth: d.getMonth() === month,
        });
    }
    return cells;
}

export default function Events() {
    const [events, setEvents] = useState<RadioEvent[]>([]);
    const [careers, setCareers] = useState<Career[]>([]);
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [selectedDay, setSelectedDay] = useState<string>(() => toDateInput(new Date()));
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<EventStatusFilter>("all");
    const [showAllMonth, setShowAllMonth] = useState(false);

    // Create / Edit event popup modal state
    const [showEventModal, setShowEventModal] = useState(false);
    const [form, setForm] = useState<EventForm>(EMPTY_FORM);
    const [editingEvent, setEditingEvent] = useState<RadioEvent | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [statusMessage, setStatusMessage] = useState("");

    // Disable with observation modal state
    const [disablingEvent, setDisablingEvent] = useState<RadioEvent | null>(null);
    const [disableReason, setDisableReason] = useState("");
    const [disableError, setDisableError] = useState("");
    const [disabling, setDisabling] = useState(false);

    useEffect(() => {
        listEvents().then(setEvents);
        listCareers().then(setCareers);
    }, []);

    // Close modals on Escape
    useEffect(() => {
        if (!showEventModal && !disablingEvent) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (disablingEvent && !disabling) setDisablingEvent(null);
                else if (showEventModal && !saving) setShowEventModal(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showEventModal, saving, disablingEvent, disabling]);

    const today = toDateInput(new Date());
    const editingId = editingEvent?.id ?? null;

    const audienceLabel = (id: string) => {
        const profile = PROFILE_AUDIENCES.find((o) => o.id === id);
        if (profile) return profile.label;
        const deptCareer = careers.find((c) => c.departmentId === id);
        if (deptCareer) return deptCareer.department;
        const career = careers.find((c) => c.id === id);
        if (career) return career.name;
        return id;
    };

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

    // Calendar cells for the displayed month + counts per day
    const calendarCells = useMemo(() => buildCalendarCells(month), [month]);

    const dayEventCounts = useMemo(() => {
        const map = new Map<string, { active: number; disabled: number }>();
        for (const cell of calendarCells) {
            let active = 0;
            let disabled = 0;
            for (const ev of events) {
                if (eventCoversDay(ev, cell.key)) {
                    if (ev.active) active += 1;
                    else disabled += 1;
                }
            }
            if (active > 0 || disabled > 0) {
                map.set(cell.key, { active, disabled });
            }
        }
        return map;
    }, [calendarCells, events]);

    const filteredEvents = useMemo(() => {
        const term = normalizeText(search.trim());
        const list = events.filter((ev) => {
            const statusOk =
                statusFilter === "all" ||
                (statusFilter === "active" ? ev.active : !ev.active);
            if (!statusOk) return false;

            const matchesText =
                term === "" ||
                normalizeText(
                    `${ev.title} ${ev.description} ${ev.specialGuest} ${ev.disableReason}`,
                ).includes(term);
            if (!matchesText) return false;

            if (showAllMonth) {
                return overlapsMonth(ev.date, ev.endDate, month);
            }
            return eventCoversDay(ev, selectedDay);
        });
        return list.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [events, month, selectedDay, search, statusFilter, showAllMonth]);

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

    const openCreateModal = (prefillDate?: string) => {
        const targetDate = prefillDate && prefillDate >= today ? prefillDate : today;
        setEditingEvent(null);
        setForm({
            ...EMPTY_FORM,
            date: targetDate,
        });
        setError("");
        setStatusMessage("");
        setShowEventModal(true);
    };

    const openEditModal = (ev: RadioEvent) => {
        setEditingEvent(ev);
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
        setError("");
        setStatusMessage("");
        setShowEventModal(true);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setStatusMessage("");

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

        if (startDateTime < nowFloor) {
            setError("No se puede crear ni mover un evento a una fecha u hora que ya pasó.");
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
                setStatusMessage(`Evento «${input.title}» actualizado.`);
            } else {
                await createEvent(input);
                setStatusMessage(`Evento «${input.title}» publicado.`);
            }
            setMonth(startOfMonth(input.date));
            setSelectedDay(toDateInput(input.date));
            setShowAllMonth(false);
            setShowEventModal(false);
            setEditingEvent(null);
            setForm(EMPTY_FORM);
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
            if (editingEvent?.id === disablingEvent.id) {
                setShowEventModal(false);
                setEditingEvent(null);
            }
            const title = disablingEvent.title;
            setDisablingEvent(null);
            setDisableReason("");
            setEvents(await listEvents());
            setStatusMessage(`Evento «${title}» deshabilitado (oculto en la app).`);
        } catch {
            setDisableError("No se pudo deshabilitar el evento.");
        } finally {
            setDisabling(false);
        }
    };

    const handleEnable = async (ev: RadioEvent) => {
        await enableEvent(ev.id);
        if (editingEvent?.id === ev.id) {
            setShowEventModal(false);
            setEditingEvent(null);
        }
        setEvents(await listEvents());
        setStatusMessage(`Evento «${ev.title}» habilitado nuevamente.`);
    };

    const selectedDayLabel = useMemo(() => {
        const [y, m, d] = selectedDay.split("-").map(Number);
        const dt = new Date(y, (m || 1) - 1, d || 1);
        return dt.toLocaleDateString("es-CO", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
        });
    }, [selectedDay]);

    const selectedDayIsPast = selectedDay < today;

    return (
        <>
            {/* Encabezado limpio + botón '+' para nuevo evento */}
            <div className="section-head">
                <div>
                    <h2>Calendario de Eventos</h2>
                </div>
                <div className="row" style={{ alignItems: "center", gap: "10px" }}>
                    <MonthNav month={month} onChange={setMonth} />
                    <button
                        type="button"
                        className="add-program-btn"
                        onClick={() => openCreateModal(selectedDay)}
                        title="Registrar nuevo evento"
                    >
                        <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                        >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Nuevo evento
                    </button>
                </div>
            </div>

            {statusMessage && (
                <div className="card" style={{ gridColumn: "1 / -1", padding: "12px 16px" }}>
                    <p className="ok" style={{ margin: 0 }}>{statusMessage}</p>
                </div>
            )}

            {/* Calendario mensual interactivo */}
            <div className="card calendar-card">
                <div className="calendar-weekdays">
                    {WEEKDAY_HEADERS.map((w) => (
                        <div key={w} className="calendar-weekday">
                            {w}
                        </div>
                    ))}
                </div>
                <div className="calendar-grid">
                    {calendarCells.map((cell) => {
                        const counts = dayEventCounts.get(cell.key);
                        const isSelected = !showAllMonth && selectedDay === cell.key;
                        const isToday = cell.key === today;
                        return (
                            <button
                                key={cell.key}
                                type="button"
                                className={`calendar-day ${cell.inMonth ? "" : "outside"} ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
                                onClick={() => {
                                    setSelectedDay(cell.key);
                                    setShowAllMonth(false);
                                    if (!cell.inMonth) {
                                        setMonth(startOfMonth(cell.date));
                                    }
                                }}
                            >
                                <span className="calendar-day-num">{cell.date.getDate()}</span>
                                {counts && (
                                    <span className="calendar-dots">
                                        {counts.active > 0 && (
                                            <span
                                                className="calendar-dot active"
                                                title={`${counts.active} activo(s)`}
                                            />
                                        )}
                                        {counts.disabled > 0 && (
                                            <span
                                                className="calendar-dot disabled"
                                                title={`${counts.disabled} deshabilitado(s)`}
                                            />
                                        )}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Encabezado del día seleccionado + acción directa para agregar evento en ese día */}
            <div className="section-head">
                <div>
                    <h3 style={{ margin: 0, textTransform: "capitalize" }}>
                        {showAllMonth ? "Todos los eventos del mes" : selectedDayLabel}
                    </h3>
                    <small className="muted">
                        {filteredEvents.length}{" "}
                        {filteredEvents.length === 1 ? "evento" : "eventos"}
                    </small>
                </div>
                <div className="row" style={{ alignItems: "center", gap: "8px" }}>
                    {!showAllMonth && !selectedDayIsPast && (
                        <button
                            type="button"
                            className="secondary add-program-btn"
                            onClick={() => openCreateModal(selectedDay)}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                            >
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            Agregar evento para este día
                        </button>
                    )}
                    <button
                        type="button"
                        className="ghost"
                        onClick={() => setShowAllMonth((prev) => !prev)}
                    >
                        {showAllMonth ? "Ver solo día seleccionado" : "Ver todo el mes"}
                    </button>
                </div>
            </div>

            {/* Buscador y filtro de estado */}
            <div className="toolbar">
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
            </div>

            {/* Lista de eventos del día seleccionado (o del mes) a ancho completo */}
            <div className="card" style={{ gridColumn: "1 / -1", padding: 0, overflow: "hidden" }}>
                {filteredEvents.length === 0 ? (
                    <div className="empty-day-box">
                        <p className="empty" style={{ margin: 0 }}>
                            {showAllMonth
                                ? "No hay eventos registrados en este mes para el filtro actual."
                                : "No hay eventos programados para este día."}
                        </p>
                        {!showAllMonth && !selectedDayIsPast && (
                            <button
                                type="button"
                                className="add-program-btn"
                                onClick={() => openCreateModal(selectedDay)}
                            >
                                + Agregar evento para este día
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="event-day-list">
                        {filteredEvents.map((ev) => (
                            <div
                                key={ev.id}
                                className={`event-list-row ${ev.active ? "" : "is-disabled"}`}
                            >
                                <div className="event-list-main">
                                    <div className="row" style={{ alignItems: "center", gap: "8px" }}>
                                        <strong>{ev.title}</strong>
                                        {!ev.active && (
                                            <span className="tag off">Deshabilitado</span>
                                        )}
                                    </div>
                                    <div className="muted" style={{ fontSize: "13px" }}>
                                        {formatDate(ev.date)}
                                        {ev.startTime && ` · ${formatTime12h(ev.startTime)}`}
                                        {ev.endDate && (
                                            <>
                                                {" — "}
                                                {toDateInput(ev.endDate) !== toDateInput(ev.date) &&
                                                    `${formatDate(ev.endDate)} `}
                                                {ev.endTime && formatTime12h(ev.endTime)}
                                            </>
                                        )}
                                        {ev.specialGuest && <> · Invitado: {ev.specialGuest}</>}
                                    </div>
                                    <div className="row" style={{ gap: "6px" }}>
                                        {ev.audience.map((a) => (
                                            <span className="tag" key={a}>
                                                {audienceLabel(a)}
                                            </span>
                                        ))}
                                    </div>
                                    {ev.description && (
                                        <p className="event-list-desc">{ev.description}</p>
                                    )}
                                    {!ev.active && ev.disableReason && (
                                        <div className="note-box">
                                            <strong>Observación:</strong> {ev.disableReason}
                                        </div>
                                    )}
                                </div>
                                <div className="event-list-actions">
                                    {ev.link && (
                                        <a
                                            href={ev.link}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="muted"
                                            style={{ fontSize: "13px" }}
                                        >
                                            Fuente ↗
                                        </a>
                                    )}
                                    <button
                                        type="button"
                                        className="ghost icon-btn"
                                        onClick={() => openEditModal(ev)}
                                        title={`Editar ${ev.title}`}
                                        aria-label={`Editar ${ev.title}`}
                                    >
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            aria-hidden="true"
                                        >
                                            <path d="M12 20h9" />
                                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* POPUP 1: CREAR / EDITAR EVENTO */}
            {showEventModal && (
                <div
                    className="modal-backdrop"
                    onClick={() => !saving && setShowEventModal(false)}
                >
                    <form
                        className="card modal-card modal-card-wide"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={handleSubmit}
                    >
                        <div className="section-head">
                            <h2 style={{ margin: 0 }}>
                                {editingEvent ? "Editar evento" : "Nuevo evento"}
                            </h2>
                            <button
                                type="button"
                                className="ghost btn-sm"
                                onClick={() => setShowEventModal(false)}
                                disabled={saving}
                            >
                                ✕
                            </button>
                        </div>

                        {editingEvent && !editingEvent.active && editingEvent.disableReason && (
                            <div className="note-box">
                                <strong>Observación de deshabilitación:</strong>{" "}
                                {editingEvent.disableReason}
                            </div>
                        )}

                        <div className="row">
                            <label>Título del evento
                                <input
                                    value={form.title}
                                    onChange={(e) => setField("title", e.target.value)}
                                    required
                                />
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
                            <label>Hora de inicio (hora militar 24h)
                                <TimeInput
                                    value={form.startTime}
                                    onChange={(val) => setField("startTime", val)}
                                    required
                                />
                            </label>
                        </div>

                        <div className="row">
                            <label>Fecha final (opcional)
                                <input
                                    type="date"
                                    value={form.endDate}
                                    min={form.date || today}
                                    onChange={(e) => setField("endDate", e.target.value)}
                                />
                            </label>
                            <label>Hora final (opcional · 24h)
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
                                          ? "Estudiantes y egresados se segmentan por programa. Si no marcas ninguno, aplica a todos los programas."
                                          : "Marca departamentos para docentes y programas para estudiantes/egresados."}
                                </small>
                                <div className="scroll-box">
                                    {hierarchy.map((facultyGroup) => (
                                        <div className="faculty-block" key={facultyGroup.title}>
                                            <strong className="faculty-title">
                                                {facultyGroup.title}
                                            </strong>
                                            {facultyGroup.departments.map((dept) => {
                                                const deptTargets = [
                                                    ...(hasDocente ? [dept.departmentId] : []),
                                                    ...(hasStudentOrGrad
                                                        ? dept.careers.map((c) => c.id)
                                                        : []),
                                                ];
                                                const deptChecked =
                                                    deptTargets.length > 0 &&
                                                    deptTargets.every((id) =>
                                                        form.audience.includes(id),
                                                    );

                                                return (
                                                    <div
                                                        className="dept-group"
                                                        key={dept.departmentId}
                                                    >
                                                        <label className="check dept-check">
                                                            <input
                                                                type="checkbox"
                                                                checked={deptChecked}
                                                                onChange={() =>
                                                                    toggleDepartment(dept)
                                                                }
                                                            />
                                                            <strong>{dept.department}</strong>
                                                            {hasDocente && (
                                                                <span className="tag">
                                                                    Docentes
                                                                </span>
                                                            )}
                                                        </label>
                                                        {hasStudentOrGrad && (
                                                            <div className="program-list">
                                                                {dept.careers.map((c) => (
                                                                    <label
                                                                        key={c.id}
                                                                        className="check"
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={form.audience.includes(
                                                                                c.id,
                                                                            )}
                                                                            onChange={() =>
                                                                                toggleAudienceItem(
                                                                                    c.id,
                                                                                )
                                                                            }
                                                                        />
                                                                        <span>
                                                                            {c.name}
                                                                            {c.level === "posgrado"
                                                                                ? " (Posgrado)"
                                                                                : ""}
                                                                            {!c.active
                                                                                ? " (inhabilitado)"
                                                                                : ""}
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
                                rows={3}
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

                        <div
                            className="row"
                            style={{
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginTop: "6px",
                            }}
                        >
                            <div>
                                {editingEvent &&
                                    (editingEvent.active ? (
                                        <button
                                            type="button"
                                            className="danger"
                                            onClick={() => openDisableModal(editingEvent)}
                                            disabled={saving}
                                        >
                                            Deshabilitar evento
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="secondary"
                                            onClick={() => handleEnable(editingEvent)}
                                            disabled={saving}
                                        >
                                            Habilitar nuevamente
                                        </button>
                                    ))}
                            </div>
                            <div className="row">
                                <button
                                    type="button"
                                    className="ghost"
                                    onClick={() => setShowEventModal(false)}
                                    disabled={saving}
                                >
                                    Cancelar
                                </button>
                                <button type="submit" disabled={saving}>
                                    {saving
                                        ? "Guardando…"
                                        : editingEvent
                                          ? "Guardar cambios"
                                          : "Publicar evento"}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            )}

            {/* POPUP 2: DESHABILITAR EVENTO CON OBSERVACIÓN */}
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
