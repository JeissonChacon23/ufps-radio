// src/pages/Podcasts.tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import DriveImage from "../components/DriveImage";
import DriveImageField from "../components/DriveImageField";
import { driveAudioUrl, extractDriveId } from "../lib/drive";
import { formatDate, fromDateInput, toDateInput } from "../lib/dates";
import { normalizeText } from "../lib/text";
import { createPodcast, deletePodcast, observePodcasts, retryPodcast } from "../services/podcastsService";
import { listPrograms } from "../services/programsService";
import type { Podcast, PodcastStatus, Program } from "../types";

interface EpisodeForm {
    programId: string;
    airDate: string;
    audioLink: string;
    imageLink: string;
}

const EMPTY_FORM: EpisodeForm = { programId: "", airDate: "", audioLink: "", imageLink: "" };

const STATUS_LABEL: Record<PodcastStatus, string> = {
    pendiente: "Pendiente",
    en_proceso: "En proceso",
    lista: "Lista",
    error: "Error",
};
const STATUS_CLASS: Record<PodcastStatus, string> = {
    pendiente: "tag",
    en_proceso: "tag warn",
    lista: "tag ok",
    error: "tag err",
};
const STATUSES: PodcastStatus[] = ["pendiente", "en_proceso", "lista", "error"];

type StatusFilter = "all" | PodcastStatus;

export default function Podcasts() {
    const [programs, setPrograms] = useState<Program[]>([]);
    const [episodes, setEpisodes] = useState<Podcast[]>([]);
    const [form, setForm] = useState<EpisodeForm>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [search, setSearch] = useState("");

    useEffect(() => {
        listPrograms().then(setPrograms);
    }, []);

    useEffect(
        () => observePodcasts(setEpisodes, () => setError("No se pudo cargar la lista de episodios.")),
        [],
    );

    const audioId = extractDriveId(form.audioLink);
    const today = toDateInput(new Date());

    const filtered = useMemo(() => {
        const term = normalizeText(search.trim());
        return episodes.filter((ep) => {
            const statusOk = statusFilter === "all" || ep.status === statusFilter;
            const textOk = term === "" || normalizeText(ep.programName).includes(term);
            return statusOk && textOk;
        });
    }, [episodes, statusFilter, search]);

    const setField = <K extends keyof EpisodeForm>(key: K, value: EpisodeForm[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    // The episode image, or the program image when the episode has none.
    const imageIdFor = (ep: Podcast): string | null =>
        (ep.imageUrl ? extractDriveId(ep.imageUrl) : null) ??
        extractDriveId(programs.find((p) => p.id === ep.programId)?.artworkDriveId ?? "");

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setMessage("");

        const program = programs.find((p) => p.id === form.programId);
        if (!program) {
            setError("Elige el programa del episodio.");
            return;
        }
        const audio = extractDriveId(form.audioLink);
        if (!audio) {
            setError("Pega el enlace de Google Drive del audio.");
            return;
        }
        if (form.airDate > today) {
            setError("La fecha de emisión no puede ser posterior a hoy.");
            return;
        }
        const imageText = form.imageLink.trim();
        const image = imageText ? extractDriveId(imageText) : null;
        if (imageText && !image) {
            setError("El enlace de la imagen no es de Google Drive. Pégalo de nuevo o déjalo vacío.");
            return;
        }

        setSaving(true);
        try {
            await createPodcast({
                programId: program.id,
                programName: program.name,
                airDate: fromDateInput(form.airDate),
                audioUrl: audio,
                imageUrl: image,
            });
            setForm(EMPTY_FORM);
            setMessage("Episodio registrado. La transcripción iniciará automáticamente.");
        } catch {
            setError("No se pudo registrar el episodio.");
        } finally {
            setSaving(false);
        }
    };

    const handleRetry = async (id: string) => {
        try {
            await retryPodcast(id);
        } catch {
            setError("No se pudo reintentar la transcripción.");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("¿Eliminar este episodio?")) return;
        try {
            await deletePodcast(id);
        } catch {
            setError("No se pudo eliminar el episodio.");
        }
    };

    return (
        <>
            <form className="card" onSubmit={handleSubmit}>
                <h2>Nuevo episodio</h2>

                <label>Programa
                    <select value={form.programId} onChange={(e) => setField("programId", e.target.value)} required>
                        <option value="">Elige un programa</option>
                        {programs.map((p) => (
                            <option key={p.id} value={p.id}>{p.name}{!p.active && " (inactivo)"}</option>
                        ))}
                    </select>
                </label>
                {programs.length === 0 && (
                    <p className="muted">Primero registra al menos un programa en la sección Programación.</p>
                )}

                <label>Fecha de emisión
                    <input
                        type="date"
                        value={form.airDate}
                        max={today}
                        onChange={(e) => setField("airDate", e.target.value)}
                        required
                    />
                </label>

                <div className="drive-field">
                    <label>Enlace de Google Drive del audio
                        <input
                            value={form.audioLink}
                            onChange={(e) => setField("audioLink", e.target.value)}
                            placeholder="Pega el enlace de Google Drive"
                            required
                        />
                    </label>
                    {form.audioLink.trim() && !audioId && (
                        <p className="error">Pega el enlace de Google Drive del audio.</p>
                    )}
                    {audioId && <audio controls preload="none" src={driveAudioUrl(audioId)} />}
                    <p className="muted">
                        El archivo debe estar compartido como «Cualquier persona con el enlace». Si no, ni el
                        transcriptor ni la app pueden leerlo.
                    </p>
                </div>

                <DriveImageField
                    label="Enlace de la imagen del episodio (opcional)"
                    value={form.imageLink}
                    onChange={(value) => setField("imageLink", value)}
                    required={false}
                    hint="Si lo dejas vacío, se usa la imagen del programa."
                />

                {error && <p className="error">{error}</p>}
                {message && <p className="ok">{message}</p>}

                <div className="row">
                    <button type="submit" disabled={saving}>
                        {saving ? "Guardando…" : "Registrar episodio"}
                    </button>
                </div>
            </form>

            <div className="section-head">
                <h2>Episodios</h2>
                <span className="muted">
          {filtered.length} {filtered.length === 1 ? "episodio" : "episodios"}
        </span>
            </div>

            <div className="chips">
                <button
                    type="button"
                    className={statusFilter === "all" ? "chip active" : "chip"}
                    onClick={() => setStatusFilter("all")}
                >
                    Todos <small>{episodes.length}</small>
                </button>
                {STATUSES.map((s) => (
                    <button
                        type="button"
                        key={s}
                        className={statusFilter === s ? "chip active" : "chip"}
                        onClick={() => setStatusFilter(s)}
                    >
                        {STATUS_LABEL[s]} <small>{episodes.filter((ep) => ep.status === s).length}</small>
                    </button>
                ))}
            </div>

            <div className="toolbar">
                <input
                    className="search"
                    type="search"
                    placeholder="Buscar por programa"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>

            {filtered.length === 0 && (
                <p className="empty">
                    {episodes.length === 0 ? "Aún no hay episodios." : "No hay episodios para este filtro."}
                </p>
            )}

            {filtered.map((ep) => {
                const imageId = imageIdFor(ep);
                return (
                    <div className="card media-card" key={ep.id}>
                        {imageId ? <DriveImage id={imageId} size={160} /> : <div className="thumb placeholder" />}
                        <div className="media-body">
                            <div className="row">
                                <strong>{ep.programName}</strong>
                                <span className={STATUS_CLASS[ep.status]}>{STATUS_LABEL[ep.status]}</span>
                            </div>
                            <div>{formatDate(ep.airDate)}</div>
                            {ep.status === "error" && ep.errorMessage && <p className="error">{ep.errorMessage}</p>}
                            <div className="row">
                                {ep.status === "error" && (
                                    <button onClick={() => handleRetry(ep.id)}>Reintentar</button>
                                )}
                                <button className="danger" onClick={() => handleDelete(ep.id)}>Eliminar</button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </>
    );
}