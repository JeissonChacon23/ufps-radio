// src/pages/Podcasts.tsx
import { useEffect, useMemo, useState, type FormEvent } from "react";
import DriveImage from "../components/DriveImage";
import DriveImageField from "../components/DriveImageField";
import TimeInput from "../components/TimeInput";
import { DAYS } from "../constants/audiences";
import { driveAudioUrl, driveViewUrl, extractDriveId } from "../lib/drive";
import {
    currentTimeString,
    formatDate,
    formatTime12h,
    fromDateInput,
    toDateInput,
    todayIsoWeekday,
} from "../lib/dates";
import { normalizeText } from "../lib/text";
import {
    createPodcast,
    disablePodcast,
    enablePodcast,
    observePodcasts,
    retryPodcast,
    syncAllPodcastsToQdrant,
    updatePodcast,
} from "../services/podcastsService";
import { listPrograms } from "../services/programsService";
import type { Podcast, PodcastStatus, Program } from "../types";

interface EpisodeForm {
    programId: string;
    airDate: string;
    airTime: string;
    audioLink: string;
    imageLink: string;
}

const EMPTY_FORM: EpisodeForm = {
    programId: "",
    airDate: "",
    airTime: "",
    audioLink: "",
    imageLink: "",
};

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

type StatusFilter = "all" | PodcastStatus | "disabled";
type SortOrder = "newest" | "oldest" | "program";

export default function Podcasts() {
    const [programs, setPrograms] = useState<Program[]>([]);
    const [episodes, setEpisodes] = useState<Podcast[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showFiltersModal, setShowFiltersModal] = useState(false);
    const [form, setForm] = useState<EpisodeForm>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [syncingQdrant, setSyncingQdrant] = useState(false);
    const [error, setError] = useState("");
    const [formError, setFormError] = useState("");
    const [message, setMessage] = useState("");

    // Edit episode popup modal state
    const [editingEpisode, setEditingEpisode] = useState<Podcast | null>(null);
    const [editForm, setEditForm] = useState<EpisodeForm>(EMPTY_FORM);
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState("");

    // Disable with observation modal state
    const [disablingEpisode, setDisablingEpisode] = useState<Podcast | null>(null);
    const [disableReason, setDisableReason] = useState("");
    const [disableError, setDisableError] = useState("");
    const [disabling, setDisabling] = useState(false);

    // Filters
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [search, setSearch] = useState("");
    const [programFilter, setProgramFilter] = useState<string>("all");
    const [collectiveFilter, setCollectiveFilter] = useState<string>("all");
    const [hostFilter, setHostFilter] = useState<string>("all");
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");
    const [sortOrder, setSortOrder] = useState<SortOrder>("newest");

    useEffect(() => {
        listPrograms().then(setPrograms);
    }, []);

    useEffect(
        () => observePodcasts(setEpisodes, () => setError("No se pudo cargar la lista de episodios.")),
        [],
    );

    // Close modals on Escape
    useEffect(() => {
        if (!showCreateModal && !showFiltersModal && !editingEpisode) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                if (showCreateModal && !saving) setShowCreateModal(false);
                if (editingEpisode && !editSaving) setEditingEpisode(null);
                if (showFiltersModal) setShowFiltersModal(false);
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showCreateModal, showFiltersModal, editingEpisode, saving, editSaving]);

    const programById = useMemo(() => {
        const map = new Map<string, Program>();
        for (const p of programs) map.set(p.id, p);
        return map;
    }, [programs]);

    // Filter options derived from registered programs & episodes
    const { programOptions, collectiveOptions, hostOptions } = useMemo(() => {
        const progMap = new Map<string, string>();
        const collectives = new Set<string>();
        const hosts = new Set<string>();

        for (const ep of episodes) {
            const p = programById.get(ep.programId);
            progMap.set(ep.programId || ep.programName, p?.name || ep.programName);
            if (p?.collective?.trim()) collectives.add(p.collective.trim());
            if (p?.hosts) {
                for (const h of p.hosts) {
                    if (h.trim()) hosts.add(h.trim());
                }
            }
        }
        for (const p of programs) {
            if (p.collective?.trim()) collectives.add(p.collective.trim());
            for (const h of p.hosts) {
                if (h.trim()) hosts.add(h.trim());
            }
        }

        return {
            programOptions: [...progMap.entries()].sort((a, b) => a[1].localeCompare(b[1])),
            collectiveOptions: [...collectives].sort((a, b) => a.localeCompare(b)),
            hostOptions: [...hosts].sort((a, b) => a.localeCompare(b)),
        };
    }, [episodes, programs, programById]);

    const audioId = extractDriveId(form.audioLink);
    const today = toDateInput(new Date());
    const nowTime = currentTimeString();
    const todayIso = todayIsoWeekday();

    // W9: If airDate is today (or not yet chosen), check if a program's emission for today is in the future.
    const isProgramFutureToday = (p: Program, selectedDate: string): boolean => {
        if (selectedDate === today) {
            return p.startTime > nowTime;
        }
        if (!selectedDate) {
            return p.days.length === 1 && p.days[0] === todayIso && p.startTime > nowTime;
        }
        return false;
    };

    const activeAdvancedFilterCount = [
        programFilter !== "all",
        collectiveFilter !== "all",
        hostFilter !== "all",
        dateFrom !== "",
        dateTo !== "",
        sortOrder !== "newest",
    ].filter(Boolean).length;

    const resetAllFilters = () => {
        setStatusFilter("all");
        setProgramFilter("all");
        setCollectiveFilter("all");
        setHostFilter("all");
        setDateFrom("");
        setDateTo("");
        setSortOrder("newest");
        setSearch("");
    };

    const filtered = useMemo(() => {
        const term = normalizeText(search.trim());
        const list = episodes.filter((ep) => {
            const prog = programById.get(ep.programId);
            const collective = prog?.collective?.trim() ?? "";
            const hosts = prog?.hosts ?? [];
            const epDateStr = toDateInput(ep.airDate);

            if (statusFilter === "disabled") {
                if (ep.active) return false;
            } else if (statusFilter !== "all") {
                if (!ep.active || ep.status !== statusFilter) return false;
            }
            if (programFilter !== "all" && (ep.programId || ep.programName) !== programFilter) {
                return false;
            }
            if (collectiveFilter !== "all" && collective !== collectiveFilter) return false;
            if (hostFilter !== "all" && !hosts.includes(hostFilter)) return false;
            if (dateFrom && epDateStr < dateFrom) return false;
            if (dateTo && epDateStr > dateTo) return false;

            if (term !== "") {
                const haystack = normalizeText(
                    `${ep.programName} ${collective} ${hosts.join(" ")} ${formatDate(ep.airDate)} ${STATUS_LABEL[ep.status]} ${ep.disableReason}`,
                );
                if (!haystack.includes(term)) return false;
            }
            return true;
        });

        return list.sort((a, b) => {
            if (sortOrder === "oldest") return a.airDate.getTime() - b.airDate.getTime();
            if (sortOrder === "program") {
                return (
                    a.programName.localeCompare(b.programName) ||
                    b.airDate.getTime() - a.airDate.getTime()
                );
            }
            return b.airDate.getTime() - a.airDate.getTime();
        });
    }, [
        episodes,
        programById,
        statusFilter,
        programFilter,
        collectiveFilter,
        hostFilter,
        dateFrom,
        dateTo,
        sortOrder,
        search,
    ]);

    const setField = <K extends keyof EpisodeForm>(key: K, value: EpisodeForm[K]) =>
        setForm((prev) => ({ ...prev, [key]: value }));

    const handleProgramChange = (programId: string) => {
        const prog = programs.find((p) => p.id === programId);
        setForm((prev) => ({
            ...prev,
            programId,
            airTime: prog ? prog.startTime : prev.airTime,
        }));
    };

    const imageIdFor = (ep: Podcast): string | null =>
        (ep.imageUrl ? extractDriveId(ep.imageUrl) : null) ??
        extractDriveId(programById.get(ep.programId)?.artworkDriveId ?? "");

    const openCreateModal = () => {
        setForm(EMPTY_FORM);
        setFormError("");
        setMessage("");
        setShowCreateModal(true);
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setFormError("");
        setMessage("");

        const program = programs.find((p) => p.id === form.programId);
        if (!program) {
            setFormError("Elige el programa del episodio.");
            return;
        }
        if (!form.airDate) {
            setFormError("Selecciona la fecha de emisión.");
            return;
        }
        const effectiveTime = form.airTime || program.startTime || "12:00";
        if (form.airDate > today) {
            setFormError(
                "Un podcast corresponde a un programa ya emitido: la fecha de emisión no puede ser futura.",
            );
            return;
        }
        if (form.airDate === today && effectiveTime > currentTimeString()) {
            setFormError(
                `El programa «${program.name}» aún no se ha emitido hoy (${formatTime12h(effectiveTime)}). Solo puedes registrar programas que ya se emitieron.`,
            );
            return;
        }

        const audio = extractDriveId(form.audioLink);
        if (!audio) {
            setFormError("Pega el enlace de Google Drive del audio.");
            return;
        }
        const imageText = form.imageLink.trim();
        const image = imageText ? extractDriveId(imageText) : null;
        if (imageText && !image) {
            setFormError(
                "El enlace de la imagen no es de Google Drive. Pégalo de nuevo o déjalo vacío.",
            );
            return;
        }

        setSaving(true);
        try {
            await createPodcast({
                programId: program.id,
                programName: program.name,
                airDate: fromDateInput(form.airDate, effectiveTime),
                airTime: effectiveTime,
                audioUrl: audio,
                imageUrl: image,
            });
            setForm(EMPTY_FORM);
            setShowCreateModal(false);
            setMessage("Episodio registrado. La transcripción iniciará automáticamente.");
        } catch {
            setFormError("No se pudo registrar el episodio.");
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

    const openEditModal = (ep: Podcast) => {
        setEditingEpisode(ep);
        setEditForm({
            programId: ep.programId,
            airDate: toDateInput(ep.airDate),
            airTime: ep.airTime,
            audioLink: ep.audioUrl ? driveViewUrl(ep.audioUrl) : "",
            imageLink: ep.imageUrl ? driveViewUrl(ep.imageUrl) : "",
        });
        setEditError("");
        setMessage("");
    };

    const setEditField = <K extends keyof EpisodeForm>(key: K, value: EpisodeForm[K]) =>
        setEditForm((prev) => ({ ...prev, [key]: value }));

    const handleEditProgramChange = (programId: string) => {
        const prog = programs.find((p) => p.id === programId);
        setEditForm((prev) => ({
            ...prev,
            programId,
            airTime: prog ? prog.startTime : prev.airTime,
        }));
    };

    const handleEditSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!editingEpisode) return;
        setEditError("");
        setMessage("");

        const program = programs.find((p) => p.id === editForm.programId);
        if (!program) {
            setEditError("Elige el programa del episodio.");
            return;
        }
        if (!editForm.airDate) {
            setEditError("Selecciona la fecha de emisión.");
            return;
        }
        const effectiveTime = editForm.airTime || program.startTime || "12:00";
        if (editForm.airDate > today) {
            setEditError("La fecha de emisión no puede ser futura.");
            return;
        }
        if (editForm.airDate === today && effectiveTime > currentTimeString()) {
            setEditError(
                `El programa «${program.name}» aún no se ha emitido hoy (${formatTime12h(effectiveTime)}).`,
            );
            return;
        }

        const audio = extractDriveId(editForm.audioLink);
        if (!audio) {
            setEditError("Pega el enlace de Google Drive del audio.");
            return;
        }
        const imageText = editForm.imageLink.trim();
        const image = imageText ? extractDriveId(imageText) : null;
        if (imageText && !image) {
            setEditError(
                "El enlace de la imagen no es de Google Drive. Pégalo de nuevo o déjalo vacío.",
            );
            return;
        }

        setEditSaving(true);
        try {
            await updatePodcast(editingEpisode.id, {
                programId: program.id,
                programName: program.name,
                airDate: fromDateInput(editForm.airDate, effectiveTime),
                airTime: effectiveTime,
                audioUrl: audio,
                imageUrl: image,
            });
            setEditingEpisode(null);
            setMessage(`Episodio de «${program.name}» actualizado.`);
        } catch {
            setEditError("No se pudieron guardar los cambios del episodio.");
        } finally {
            setEditSaving(false);
        }
    };

    const openDisableModal = (ep: Podcast) => {
        setDisablingEpisode(ep);
        setDisableReason(ep.disableReason || "");
        setDisableError("");
    };

    const handleConfirmDisable = async (e: FormEvent) => {
        e.preventDefault();
        if (!disablingEpisode) return;
        const cleanReason = disableReason.trim();
        if (!cleanReason) {
            setDisableError("Escribe una observación o motivo para deshabilitar el episodio.");
            return;
        }
        setDisabling(true);
        setDisableError("");
        try {
            await disablePodcast(disablingEpisode.id, cleanReason);
            if (editingEpisode?.id === disablingEpisode.id) setEditingEpisode(null);
            const title = disablingEpisode.programName;
            setDisablingEpisode(null);
            setDisableReason("");
            setMessage(
                `El episodio de «${title}» fue deshabilitado y ocultado de la app y de las búsquedas.`,
            );
        } catch {
            setDisableError("No se pudo deshabilitar el episodio.");
        } finally {
            setDisabling(false);
        }
    };

    const handleEnable = async (ep: Podcast) => {
        setError("");
        setMessage("");
        try {
            await enablePodcast(ep.id);
            if (editingEpisode?.id === ep.id) setEditingEpisode(null);
            setMessage(`El episodio de «${ep.programName}» fue habilitado nuevamente.`);
        } catch {
            setError("No se pudo habilitar el episodio.");
        }
    };

    const handleSyncQdrant = async () => {
        setError("");
        setMessage("");
        setSyncingQdrant(true);
        try {
            const count = await syncAllPodcastsToQdrant();
            setMessage(`Sincronización con Qdrant completada (${count} fragmentos indexados).`);
        } catch {
            setError("No se pudo sincronizar con Qdrant.");
        } finally {
            setSyncingQdrant(false);
        }
    };

    return (
        <>
            {/* Encabezado limpio + botón '+' para registrar un nuevo episodio */}
            <div className="section-head">
                <div>
                    <h2>Fonoteca de Podcasts</h2>
                </div>
                <div className="row" style={{ alignItems: "center", gap: "8px" }}>
                    <span className="muted">
                        {filtered.length} {filtered.length === 1 ? "episodio" : "episodios"}
                    </span>
                    <button
                        type="button"
                        className="ghost"
                        onClick={handleSyncQdrant}
                        disabled={syncingQdrant}
                    >
                        {syncingQdrant ? "Sincronizando…" : "Sincronizar Qdrant"}
                    </button>
                    <button
                        type="button"
                        className="add-program-btn"
                        onClick={openCreateModal}
                        title="Registrar nuevo episodio"
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
                        Nuevo episodio
                    </button>
                </div>
            </div>

            {error && (
                <div className="card" style={{ gridColumn: "1 / -1", padding: "12px 16px" }}>
                    <p className="error" style={{ margin: 0 }}>{error}</p>
                </div>
            )}
            {message && (
                <div className="card" style={{ gridColumn: "1 / -1", padding: "12px 16px" }}>
                    <p className="ok" style={{ margin: 0 }}>{message}</p>
                </div>
            )}

            {/* Chips de estado */}
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
                        {STATUS_LABEL[s]}{" "}
                        <small>
                            {episodes.filter((ep) => ep.active && ep.status === s).length}
                        </small>
                    </button>
                ))}
                <button
                    type="button"
                    className={statusFilter === "disabled" ? "chip active" : "chip"}
                    onClick={() => setStatusFilter("disabled")}
                >
                    Deshabilitados{" "}
                    <small>{episodes.filter((ep) => !ep.active).length}</small>
                </button>
            </div>

            {/* Barra de búsqueda + filtros rápidos y popup de filtros */}
            <div className="toolbar">
                <input
                    className="search"
                    type="search"
                    placeholder="Buscar por programa, colectivo, locutor o fecha…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <button
                    type="button"
                    className={activeAdvancedFilterCount > 0 ? "" : "ghost"}
                    onClick={() => setShowFiltersModal(true)}
                >
                    Filtrar{activeAdvancedFilterCount > 0 ? ` (${activeAdvancedFilterCount})` : ""}
                </button>
                {(activeAdvancedFilterCount > 0 || statusFilter !== "all" || search !== "") && (
                    <button type="button" className="ghost" onClick={resetAllFilters}>
                        Limpiar
                    </button>
                )}
            </div>

            {/* Etiquetas de filtros activos */}
            {activeAdvancedFilterCount > 0 && (
                <div className="chips" style={{ marginTop: "-4px" }}>
                    {programFilter !== "all" && (
                        <span className="tag">
                            Programa:{" "}
                            {programOptions.find(([id]) => id === programFilter)?.[1] ?? programFilter}{" "}
                            <button
                                type="button"
                                className="tag-close"
                                onClick={() => setProgramFilter("all")}
                            >
                                ×
                            </button>
                        </span>
                    )}
                    {collectiveFilter !== "all" && (
                        <span className="tag">
                            Colectivo: {collectiveFilter}{" "}
                            <button
                                type="button"
                                className="tag-close"
                                onClick={() => setCollectiveFilter("all")}
                            >
                                ×
                            </button>
                        </span>
                    )}
                    {hostFilter !== "all" && (
                        <span className="tag">
                            Locutor: {hostFilter}{" "}
                            <button
                                type="button"
                                className="tag-close"
                                onClick={() => setHostFilter("all")}
                            >
                                ×
                            </button>
                        </span>
                    )}
                    {(dateFrom || dateTo) && (
                        <span className="tag">
                            Fecha: {dateFrom || "Inicio"} → {dateTo || "Hoy"}{" "}
                            <button
                                type="button"
                                className="tag-close"
                                onClick={() => {
                                    setDateFrom("");
                                    setDateTo("");
                                }}
                            >
                                ×
                            </button>
                        </span>
                    )}
                    {sortOrder !== "newest" && (
                        <span className="tag">
                            Orden: {sortOrder === "oldest" ? "Más antiguos" : "Por programa"}{" "}
                            <button
                                type="button"
                                className="tag-close"
                                onClick={() => setSortOrder("newest")}
                            >
                                ×
                            </button>
                        </span>
                    )}
                </div>
            )}

            {/* Lista de podcasts a ancho completo */}
            <div className="card" style={{ gridColumn: "1 / -1", padding: 0, overflow: "hidden" }}>
                {filtered.length === 0 ? (
                    <p className="empty" style={{ padding: "24px" }}>
                        {episodes.length === 0
                            ? "Aún no hay episodios registrados."
                            : "No hay episodios que coincidan con los filtros seleccionados."}
                    </p>
                ) : (
                    <div className="user-table-wrap">
                        <table className="user-table">
                            <thead>
                                <tr>
                                    <th>Episodio / Programa</th>
                                    <th>Fecha y hora</th>
                                    <th>Colectivo</th>
                                    <th>Locutores</th>
                                    <th>Estado</th>
                                    <th style={{ textAlign: "right" }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((ep) => {
                                    const imageId = imageIdFor(ep);
                                    const prog = programById.get(ep.programId);
                                    return (
                                        <tr key={ep.id} style={ep.active ? undefined : { opacity: 0.78 }}>
                                            <td>
                                                <div className="podcast-list-identity">
                                                    {imageId ? (
                                                        <DriveImage id={imageId} size={96} />
                                                    ) : (
                                                        <div className="podcast-thumb-sm placeholder" />
                                                    )}
                                                    <div>
                                                        <strong>{ep.programName}</strong>
                                                        {!ep.active && ep.disableReason && (
                                                            <div className="muted" style={{ fontSize: "12px" }}>
                                                                Obs.: {ep.disableReason}
                                                            </div>
                                                        )}
                                                        {ep.active && ep.status === "error" && ep.errorMessage && (
                                                            <div className="error" style={{ fontSize: "12px" }}>
                                                                {ep.errorMessage}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div>{formatDate(ep.airDate)}</div>
                                                {ep.airTime && (
                                                    <small className="muted">
                                                        {formatTime12h(ep.airTime)}
                                                    </small>
                                                )}
                                            </td>
                                            <td>{prog?.collective || <span className="muted">—</span>}</td>
                                            <td>
                                                {prog && prog.hosts.length > 0 ? (
                                                    prog.hosts.join(", ")
                                                ) : (
                                                    <span className="muted">—</span>
                                                )}
                                            </td>
                                            <td>
                                                {ep.active ? (
                                                    <span className={STATUS_CLASS[ep.status]}>
                                                        {STATUS_LABEL[ep.status]}
                                                    </span>
                                                ) : (
                                                    <span className="tag off">Deshabilitado</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: "right" }}>
                                                <div
                                                    className="row"
                                                    style={{ justifyContent: "flex-end", gap: "6px" }}
                                                >
                                                    {ep.active && ep.status === "error" && (
                                                        <button
                                                            type="button"
                                                            className="secondary btn-sm"
                                                            onClick={() => handleRetry(ep.id)}
                                                        >
                                                            Reintentar
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="ghost icon-btn"
                                                        onClick={() => openEditModal(ep)}
                                                        title={`Editar episodio de ${ep.programName}`}
                                                        aria-label={`Editar episodio de ${ep.programName}`}
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
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* POPUP 1: REGISTRAR NUEVO EPISODIO (PODCAST) */}
            {showCreateModal && (
                <div
                    className="modal-backdrop"
                    onClick={() => !saving && setShowCreateModal(false)}
                >
                    <form
                        className="card modal-card modal-card-wide"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={handleSubmit}
                    >
                        <div className="section-head">
                            <h2 style={{ margin: 0 }}>Nuevo episodio (Podcast)</h2>
                            <button
                                type="button"
                                className="ghost btn-sm"
                                onClick={() => setShowCreateModal(false)}
                                disabled={saving}
                            >
                                ✕
                            </button>
                        </div>

                        <p className="muted" style={{ margin: 0 }}>
                            Solo se pueden registrar emisiones que ya hayan ocurrido (fecha y hora anteriores o iguales al momento actual).
                        </p>

                        <div className="row">
                            <label>Fecha de emisión
                                <input
                                    type="date"
                                    value={form.airDate}
                                    max={today}
                                    onChange={(e) => setField("airDate", e.target.value)}
                                    required
                                />
                            </label>
                            <label>Hora de emisión
                                <TimeInput
                                    value={form.airTime}
                                    onChange={(val) => setField("airTime", val)}
                                    required
                                />
                            </label>
                        </div>

                        <label>Programa de la parrilla
                            <select
                                value={form.programId}
                                onChange={(e) => handleProgramChange(e.target.value)}
                                required
                            >
                                <option value="">Elige un programa emitido</option>
                                {programs.map((p) => {
                                    const futureToday = isProgramFutureToday(p, form.airDate);
                                    const daysText = DAYS.filter((d) => p.days.includes(d.value))
                                        .map((d) => d.short)
                                        .join(", ");
                                    return (
                                        <option key={p.id} value={p.id} disabled={futureToday}>
                                            {p.name} ({daysText} · {formatTime12h(p.startTime)})
                                            {!p.active ? " [deshabilitado]" : ""}
                                            {futureToday ? " — aún no emitido hoy" : ""}
                                        </option>
                                    );
                                })}
                            </select>
                        </label>
                        {programs.length === 0 && (
                            <p className="muted">
                                Primero registra al menos un programa en la sección Programación.
                            </p>
                        )}

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
                                El archivo debe estar compartido como «Cualquier persona con el enlace». Si no, ni el transcriptor ni la app pueden leerlo.
                            </p>
                        </div>

                        <DriveImageField
                            label="Enlace de la imagen del episodio (opcional)"
                            value={form.imageLink}
                            onChange={(value) => setField("imageLink", value)}
                            required={false}
                            hint="Si lo dejas vacío, se usa la imagen del programa."
                        />

                        {formError && <p className="error">{formError}</p>}

                        <div className="row" style={{ justifyContent: "flex-end", marginTop: "6px" }}>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => setShowCreateModal(false)}
                                disabled={saving}
                            >
                                Cancelar
                            </button>
                            <button type="submit" disabled={saving}>
                                {saving ? "Guardando…" : "Registrar episodio"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* POPUP 1B: EDITAR EPISODIO (CON OPCIÓN DE DESHABILITAR / HABILITAR) */}
            {editingEpisode && (() => {
                const editAudioId = extractDriveId(editForm.audioLink);
                return (
                    <div
                        className="modal-backdrop"
                        onClick={() => !editSaving && setEditingEpisode(null)}
                    >
                        <form
                            className="card modal-card modal-card-wide"
                            onClick={(e) => e.stopPropagation()}
                            onSubmit={handleEditSubmit}
                        >
                            <div className="section-head">
                                <h2 style={{ margin: 0 }}>Editar episodio</h2>
                                <button
                                    type="button"
                                    className="ghost btn-sm"
                                    onClick={() => setEditingEpisode(null)}
                                    disabled={editSaving}
                                >
                                    ✕
                                </button>
                            </div>

                            {!editingEpisode.active && editingEpisode.disableReason && (
                                <div className="note-box">
                                    <strong>Observación de deshabilitación:</strong>{" "}
                                    {editingEpisode.disableReason}
                                </div>
                            )}

                            <div className="row">
                                <label>Fecha de emisión
                                    <input
                                        type="date"
                                        value={editForm.airDate}
                                        max={today}
                                        onChange={(e) => setEditField("airDate", e.target.value)}
                                        required
                                    />
                                </label>
                                <label>Hora de emisión
                                    <TimeInput
                                        value={editForm.airTime}
                                        onChange={(val) => setEditField("airTime", val)}
                                        required
                                    />
                                </label>
                            </div>

                            <label>Programa de la parrilla
                                <select
                                    value={editForm.programId}
                                    onChange={(e) => handleEditProgramChange(e.target.value)}
                                    required
                                >
                                    <option value="">Elige un programa emitido</option>
                                    {programs.map((p) => {
                                        const daysText = DAYS.filter((d) => p.days.includes(d.value))
                                            .map((d) => d.short)
                                            .join(", ");
                                        return (
                                            <option key={p.id} value={p.id}>
                                                {p.name} ({daysText} · {formatTime12h(p.startTime)})
                                                {!p.active ? " [deshabilitado]" : ""}
                                            </option>
                                        );
                                    })}
                                </select>
                            </label>

                            <div className="drive-field">
                                <label>Enlace de Google Drive del audio
                                    <input
                                        value={editForm.audioLink}
                                        onChange={(e) => setEditField("audioLink", e.target.value)}
                                        placeholder="Pega el enlace de Google Drive"
                                        required
                                    />
                                </label>
                                {editForm.audioLink.trim() && !editAudioId && (
                                    <p className="error">Pega el enlace de Google Drive del audio.</p>
                                )}
                                {editAudioId && (
                                    <audio controls preload="none" src={driveAudioUrl(editAudioId)} />
                                )}
                            </div>

                            <DriveImageField
                                label="Enlace de la imagen del episodio (opcional)"
                                value={editForm.imageLink}
                                onChange={(value) => setEditField("imageLink", value)}
                                required={false}
                                hint="Si lo dejas vacío, se usa la imagen del programa."
                            />

                            {editError && <p className="error">{editError}</p>}

                            <div
                                className="row"
                                style={{
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    marginTop: "6px",
                                }}
                            >
                                <div>
                                    {editingEpisode.active ? (
                                        <button
                                            type="button"
                                            className="danger"
                                            onClick={() => openDisableModal(editingEpisode)}
                                            disabled={editSaving}
                                        >
                                            Deshabilitar episodio
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className="secondary"
                                            onClick={() => handleEnable(editingEpisode)}
                                            disabled={editSaving}
                                        >
                                            Habilitar nuevamente
                                        </button>
                                    )}
                                </div>
                                <div className="row">
                                    <button
                                        type="button"
                                        className="ghost"
                                        onClick={() => setEditingEpisode(null)}
                                        disabled={editSaving}
                                    >
                                        Cancelar
                                    </button>
                                    <button type="submit" disabled={editSaving}>
                                        {editSaving ? "Guardando…" : "Guardar cambios"}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                );
            })()}

            {/* POPUP 2: FILTROS AVANZADOS DE PODCASTS */}
            {showFiltersModal && (
                <div
                    className="modal-backdrop"
                    onClick={() => setShowFiltersModal(false)}
                >
                    <div
                        className="card modal-card"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="section-head">
                            <h2 style={{ margin: 0 }}>Filtrar episodios</h2>
                            <button
                                type="button"
                                className="ghost btn-sm"
                                onClick={() => setShowFiltersModal(false)}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="row">
                            <label>Fecha desde
                                <input
                                    type="date"
                                    value={dateFrom}
                                    max={dateTo || today}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                />
                            </label>
                            <label>Fecha hasta
                                <input
                                    type="date"
                                    value={dateTo}
                                    min={dateFrom || undefined}
                                    max={today}
                                    onChange={(e) => setDateTo(e.target.value)}
                                />
                            </label>
                        </div>

                        <label>Programa
                            <select
                                value={programFilter}
                                onChange={(e) => setProgramFilter(e.target.value)}
                            >
                                <option value="all">Todos los programas</option>
                                {programOptions.map(([id, name]) => (
                                    <option key={id} value={id}>
                                        {name}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>Colectivo
                            <select
                                value={collectiveFilter}
                                onChange={(e) => setCollectiveFilter(e.target.value)}
                            >
                                <option value="all">Todos los colectivos</option>
                                {collectiveOptions.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>Locutor
                            <select
                                value={hostFilter}
                                onChange={(e) => setHostFilter(e.target.value)}
                            >
                                <option value="all">Todos los locutores</option>
                                {hostOptions.map((h) => (
                                    <option key={h} value={h}>
                                        {h}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label>Ordenar por
                            <select
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                            >
                                <option value="newest">Fecha de emisión (más recientes primero)</option>
                                <option value="oldest">Fecha de emisión (más antiguos primero)</option>
                                <option value="program">Nombre del programa (A – Z)</option>
                            </select>
                        </label>

                        <div className="row" style={{ justifyContent: "flex-end", marginTop: "6px" }}>
                            <button type="button" className="ghost" onClick={resetAllFilters}>
                                Restablecer
                            </button>
                            <button type="button" onClick={() => setShowFiltersModal(false)}>
                                Aplicar filtros
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* POPUP 3: DESHABILITAR EPISODIO CON OBSERVACIÓN */}
            {disablingEpisode && (
                <div
                    className="modal-backdrop"
                    onClick={() => !disabling && setDisablingEpisode(null)}
                >
                    <form
                        className="card modal-card"
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={handleConfirmDisable}
                    >
                        <div className="section-head">
                            <h2 style={{ margin: 0 }}>Deshabilitar episodio</h2>
                            <button
                                type="button"
                                className="ghost btn-sm"
                                onClick={() => setDisablingEpisode(null)}
                                disabled={disabling}
                            >
                                ✕
                            </button>
                        </div>

                        <p className="muted" style={{ margin: 0 }}>
                            El episodio de <strong>«{disablingEpisode.programName}»</strong> ({formatDate(disablingEpisode.airDate)}) no se eliminará de la base de datos, pero dejará de aparecer en la app móvil y en las búsquedas.
                        </p>

                        <label>
                            Observación / motivo de deshabilitación
                            <textarea
                                value={disableReason}
                                onChange={(e) => setDisableReason(e.target.value)}
                                rows={3}
                                placeholder="Ej. Audio con ruido, emisión reemplazada, contenido retirado temporalmente…"
                                required
                            />
                        </label>

                        {disableError && <p className="error">{disableError}</p>}

                        <div className="row" style={{ justifyContent: "flex-end" }}>
                            <button
                                type="button"
                                className="ghost"
                                onClick={() => setDisablingEpisode(null)}
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
