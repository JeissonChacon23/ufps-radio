// src/pages/Events.tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import MonthNav from "../components/MonthNav";
import { PROFILE_AUDIENCES } from "../constants/audiences";
import { formatDate, fromDateInput, overlapsMonth, startOfMonth, toDateInput } from "../lib/dates";
import { groupCareers } from "../lib/careers";
import { normalizeText } from "../lib/text";
import { createEvent, deleteEvent, listEvents, updateEvent } from "../services/eventsService";
import { listCareers } from "../services/careersService";
import type { Career, RadioEvent } from "../types";

interface EventForm {
    title: string;
    date: string;
    endDate: string;
    description: string;
    link: string;
    audience: string[];
}

const EMPTY_FORM: EventForm = {
    title: "", date: "", endDate: "", description: "", link: "", audience: [],
};

export default function Events() {
    const [events, setEvents] = useState<RadioEvent[]>([]);
    const [careers, setCareers] = useState<Career[]>([]);
    const [form, setForm] = useState<EventForm>(EMPTY_FORM);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [month, setMonth] = useState(() => startOfMonth(new Date()));
    const [search, setSearch] = useState("");
    const [showAll, setShowAll] = useState(false);

    useEffect(() => {
        listEvents().then(setEvents);
        listCareers().then(setCareers);
    }, []);

    const audienceLabel = (id: string) =>
        PROFILE_AUDIENCES.find((o) => o.id === id)?.label ??
        careers.find((c) => c.id === id)?.name ??
        id;

    // Disabled careers stay visible only when the event already uses them.
    const selectableCareers = careers.filter((c) => c.active || form.audience.includes(c.id));

    const filteredEvents = useMemo(() => {
        const term = normalizeText(search.trim());
        const list = events.filter((ev) => {
            const inRange = showAll || overlapsMonth(ev.date, ev.endDate, month);
            const matches = term === "" || normalizeText(`${ev.title} ${ev.description}`).includes(term);
            return inRange && matches;
        });
        return list.sort((a, b) =>
            showAll ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime(),
        );
    }, [events, month, search, showAll]);

    const setField = <K extends keyof EventForm>(key: K, value: EventForm[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const toggleAudience = (id: string) =>
        setField(
            "audience",
            form.audience.includes(id) ? form.audience.filter((a) => a !== id) : [...form.audience, id],
        );

    const resetForm = () => {
        setForm(EMPTY_FORM);
        setEditingId(null);
        setError("");
    };

    const startEdit = (ev: RadioEvent) => {
        setForm({
            title: ev.title,
            date: toDateInput(ev.date),
            endDate: ev.endDate ? toDateInput(ev.endDate) : "",
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
        if (form.audience.length === 0) {
            setError("Selecciona al menos un público objetivo.");
            return;
        }
        if (form.endDate && form.endDate < form.date) {
            setError("La fecha final no puede ser anterior a la fecha inicial.");
            return;
        }
        setSaving(true);
        try {
            const input = {
                title: form.title.trim(),
                audience: form.audience,
                description: form.description.trim(),
                link: form.link.trim(),
                date: fromDateInput(form.date),
                endDate: form.endDate ? fromDateInput(form.endDate) : null,
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

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar este evento?")) return;
        await deleteEvent(id);
        if (editingId === id) resetForm();
        setEvents(await listEvents());
    };

    return (
        <>
            <form className="card" onSubmit={handleSubmit}>
                <h2>{editingId ? "Editar evento" : "Nuevo evento"}</h2>

                <label>Título
                    <input value={form.title} onChange={(e) => setField("title", e.target.value)} required />
                </label>

                <div className="row">
                    <label>Fecha
                        <input type="date" value={form.date} onChange={(e) => setField("date", e.target.value)} required />
                    </label>
                    <label>Fecha final (opcional)
                        <input type="date" value={form.endDate} min={form.date} onChange={(e) => setField("endDate", e.target.value)} />
                    </label>
                </div>

                <fieldset>
                    <legend>Público</legend>
                    {PROFILE_AUDIENCES.map((o) => (
                        <label key={o.id} className="check">
                            <input
                                type="checkbox"
                                checked={form.audience.includes(o.id)}
                                onChange={() => toggleAudience(o.id)}
                            />
                            {o.label}
                        </label>
                    ))}
                </fieldset>

                <fieldset>
                    <legend>Carreras específicas (opcional)</legend>
                    {careers.length === 0 && <p>Aún no hay carreras. Cárgalas en la sección Carreras.</p>}
                    <div className="scroll-box">
                        {groupCareers(selectableCareers).map((group) => (
                            <div key={group.title}>
                                <strong>{group.title}</strong>
                                {group.careers.map((c) => (
                                    <label key={c.id} className="check">
                                        <input
                                            type="checkbox"
                                            checked={form.audience.includes(c.id)}
                                            onChange={() => toggleAudience(c.id)}
                                        />
                                        {c.name}{!c.active && " (inhabilitada)"}
                                    </label>
                                ))}
                            </div>
                        ))}
                    </div>
                </fieldset>

                <label>Descripción
                    <textarea value={form.description} onChange={(e) => setField("description", e.target.value)} rows={4} required />
                </label>

                <label>Enlace de la fuente (opcional)
                    <input type="url" value={form.link} onChange={(e) => setField("link", e.target.value)} placeholder="https://" />
                </label>

                {error && <p className="error">{error}</p>}

                <div className="row">
                    <button type="submit" disabled={saving}>
                        {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Publicar evento"}
                    </button>
                    {editingId && (
                        <button type="button" className="secondary" onClick={resetForm}>Cancelar edición</button>
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
                    placeholder="Buscar por título o descripción"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
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
                <div className="card" key={ev.id}>
                    <strong>{ev.title}</strong>
                    <div>
                        {formatDate(ev.date)}
                        {ev.endDate && ` — ${formatDate(ev.endDate)}`}
                    </div>
                    <div className="row">
                        {ev.audience.map((a) => (
                            <span className="tag" key={a}>{audienceLabel(a)}</span>
                        ))}
                    </div>
                    <p>{ev.description}</p>
                    <div className="row">
                        {ev.link && <a href={ev.link} target="_blank" rel="noreferrer">Ver fuente</a>}
                        <button onClick={() => startEdit(ev)}>Editar</button>
                        <button className="danger" onClick={() => handleDelete(ev.id)}>Eliminar</button>
                    </div>
                </div>
            ))}
        </>
    );
}