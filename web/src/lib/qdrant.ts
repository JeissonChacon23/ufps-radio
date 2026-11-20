// src/lib/qdrant.ts
import { normalizeText } from "./text";

const DEFAULT_QDRANT_URL =
    "https://911356d3-0c20-4d27-a9e0-64d525402b4c.us-east-1-1.aws.cloud.qdrant.io:6333";
const DEFAULT_QDRANT_API_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6N2EzNjFiNDktODRjOC00Y2JmLWFkNzAtOGY3Y2VkODUyN2M0In0.u2Q91Be-pJkouR2vxn42XpTdwVylVQu-O6f61xX-jBE";

const QDRANT_URL = (import.meta.env.VITE_QDRANT_URL || DEFAULT_QDRANT_URL).replace(/\/+$/, "");
const QDRANT_API_KEY = import.meta.env.VITE_QDRANT_API_KEY || DEFAULT_QDRANT_API_KEY;
const COLLECTION_NAME = "podcast_segments";

const STOPWORDS = new Set([
    "a", "al", "algo", "algun", "alguna", "algunas", "alguno", "algunos", "ante", "antes",
    "aqui", "asi", "aun", "aunque", "bien", "bueno", "cada", "casi", "como", "con", "contra",
    "cosa", "cosas", "cual", "cuales", "cuando", "cuanto", "de", "del", "desde", "donde",
    "dos", "el", "ella", "ellas", "ello", "ellos", "en", "entonces", "entre", "era", "eran",
    "eres", "es", "esa", "esas", "ese", "eso", "esos", "esta", "estaba", "estaban", "estamos",
    "estan", "estar", "este", "esto", "estos", "estoy", "fue", "fueron", "fui", "ha", "haber",
    "habia", "hace", "hacer", "hacia", "han", "hasta", "hay", "he", "hemos", "hoy", "la",
    "las", "le", "les", "lo", "los", "mas", "me", "mi", "mientras", "mis", "mismo", "muchas",
    "mucho", "muchos", "muy", "nada", "ni", "no", "nos", "nosotros", "nuestra", "nuestro",
    "o", "osea", "otra", "otras", "otro", "otros", "para", "pero", "poco", "pues", "por",
    "porque", "que", "quien", "quienes", "se", "sea", "segun", "ser", "si", "siempre", "sin",
    "sobre", "solo", "son", "soy", "su", "sus", "tambien", "tan", "tanto", "te", "tener",
    "tengo", "ti", "tiene", "tienen", "todo", "toda", "todos", "todas", "tu", "tus", "un",
    "una", "uno", "unos", "unas", "usted", "ustedes", "va", "vamos", "van", "veces", "vez",
    "voy", "y", "ya", "yo",
]);

/** Deterministic 31-bit FNV-1a hash matching the iOS app and Python transcriber. */
export function fnv1a31(str: string): number {
    let hash = 0x811c9dc5;
    const bytes = new TextEncoder().encode(str);
    for (const byte of bytes) {
        hash ^= byte;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash & 0x7fffffff;
}

export function buildBM25SparseVector(text: string): { indices: number[]; values: number[] } {
    const normalized = normalizeText(text);
    const tokens = normalized
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

    const counts = new Map<number, number>();
    for (const token of tokens) {
        const exactIdx = fnv1a31(token);
        counts.set(exactIdx, (counts.get(exactIdx) ?? 0) + 1.0);
        if (token.length >= 5) {
            const stemIdx = fnv1a31(`stem:${token.slice(0, 5)}`);
            counts.set(stemIdx, (counts.get(stemIdx) ?? 0) + 0.65);
        }
    }

    const indices: number[] = [];
    const values: number[] = [];
    for (const [idx, tf] of counts.entries()) {
        indices.push(idx);
        values.push(1.0 + Math.log(tf));
    }
    return { indices, values };
}

let collectionReady = false;

export async function ensureQdrantCollection(): Promise<void> {
    if (collectionReady || !QDRANT_URL || !QDRANT_API_KEY) return;
    try {
        const check = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
            headers: { "api-key": QDRANT_API_KEY },
        });
        if (!check.ok) {
            await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": QDRANT_API_KEY,
                },
                body: JSON.stringify({
                    vectors: {},
                    sparse_vectors: {
                        bm25: { modifier: "idf" },
                    },
                }),
            });
        }

        // Always ensure keyword index on podcastId exists so filter-based deletions work
        await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/index?wait=true`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "api-key": QDRANT_API_KEY,
            },
            body: JSON.stringify({
                field_name: "podcastId",
                field_schema: "keyword",
            }),
        });
        collectionReady = true;
    } catch {
        // Non-fatal if browser blocks or offline
    }
}

export interface QdrantPodcastPayload {
    id: string;
    programId: string;
    programName: string;
    airDateSeconds: number;
    airTime: string;
    hosts: string[];
    imageId: string;
    audioId: string;
    transcript: string;
    keywords: string[];
    segments?: Array<{ startSeconds?: number; endSeconds?: number; text: string }>;
}

export async function upsertPodcastInQdrant(episode: QdrantPodcastPayload): Promise<number> {
    if (!QDRANT_URL || !QDRANT_API_KEY) return 0;
    await ensureQdrantCollection();

    const keywordsText = episode.keywords.join(" ");
    const points: Array<Record<string, unknown>> = [];

    if (episode.segments && episode.segments.length > 0) {
        episode.segments.forEach((seg, chunkIndex) => {
            const text = seg.text.trim();
            if (!text) return;
            const sparse = buildBM25SparseVector(`${episode.programName} ${keywordsText} ${text}`);
            if (sparse.indices.length === 0) return;

            const payload: Record<string, unknown> = {
                podcastId: episode.id,
                programId: episode.programId,
                programName: episode.programName,
                airDate: episode.airDateSeconds,
                airTime: episode.airTime,
                hosts: episode.hosts,
                imageId: episode.imageId,
                audioId: episode.audioId,
                chunkIndex,
                text,
            };
            if (typeof seg.startSeconds === "number") payload.startSeconds = seg.startSeconds;
            if (typeof seg.endSeconds === "number") payload.endSeconds = seg.endSeconds;

            points.push({
                id: fnv1a31(`${episode.id}#${chunkIndex}`),
                vector: { bm25: sparse },
                payload,
            });
        });
    } else {
        const baseText = episode.transcript.trim() || `${episode.programName} ${keywordsText}`;
        const words = baseText.split(/\s+/).filter(Boolean);
        const totalWords = Math.max(words.length, 1);
        const wordsPerSecond = 2.5;
        const chunkSize = 45;
        const overlap = 10;
        const step = Math.max(chunkSize - overlap, 1);

        for (let i = 0, chunkIndex = 0; i < words.length; i += step, chunkIndex++) {
            const end = Math.min(i + chunkSize, words.length);
            const chunkText = words.slice(i, end).join(" ");
            const sparse = buildBM25SparseVector(`${episode.programName} ${keywordsText} ${chunkText}`);
            if (sparse.indices.length > 0) {
                points.push({
                    id: fnv1a31(`${episode.id}#${chunkIndex}`),
                    vector: { bm25: sparse },
                    payload: {
                        podcastId: episode.id,
                        programId: episode.programId,
                        programName: episode.programName,
                        airDate: episode.airDateSeconds,
                        airTime: episode.airTime,
                        hosts: episode.hosts,
                        imageId: episode.imageId,
                        audioId: episode.audioId,
                        chunkIndex,
                        text: chunkText,
                        startSeconds: Math.round((i / wordsPerSecond) * 10) / 10,
                        endSeconds: Math.round((end / wordsPerSecond) * 10) / 10,
                        progressRatio: Math.round((i / totalWords) * 10000) / 10000,
                    },
                });
            }
            if (end >= words.length) break;
        }
    }

    if (points.length === 0) return 0;

    await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points?wait=true`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "api-key": QDRANT_API_KEY,
        },
        body: JSON.stringify({ points }),
    });

    return points.length;
}

export async function deletePodcastFromQdrant(podcastId: string): Promise<void> {
    if (!QDRANT_URL || !QDRANT_API_KEY) return;
    await ensureQdrantCollection();

    // 1. Delete by deterministic point IDs (works even without payload index)
    const deterministicIds: number[] = [];
    for (let i = 0; i < 600; i++) {
        deterministicIds.push(fnv1a31(`${podcastId}#${i}`));
    }
    try {
        await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete?wait=true`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": QDRANT_API_KEY,
            },
            body: JSON.stringify({
                points: deterministicIds,
            }),
        });
    } catch {
        // Ignore network errors if offline
    }

    // 2. Also delete by podcastId payload filter
    try {
        await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete?wait=true`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "api-key": QDRANT_API_KEY,
            },
            body: JSON.stringify({
                filter: {
                    must: [
                        {
                            key: "podcastId",
                            match: { value: podcastId },
                        },
                    ],
                },
            }),
        });
    } catch {
        // Ignore network errors if offline
    }
}

/**
 * Scrolls all points in Qdrant and deletes any point whose `payload.podcastId`
 * no longer exists in Firestore's active "lista" episodes.
 */
export async function pruneOrphanPodcastsFromQdrant(validPodcastIds: Set<string>): Promise<number> {
    if (!QDRANT_URL || !QDRANT_API_KEY) return 0;
    await ensureQdrantCollection();

    const orphanPointIds: Array<number | string> = [];
    let offset: number | string | null = null;

    try {
        for (let page = 0; page < 20; page++) {
            const body: Record<string, unknown> = {
                limit: 250,
                with_payload: ["podcastId"],
                with_vector: false,
            };
            if (offset !== null) body.offset = offset;

            const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/scroll`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": QDRANT_API_KEY,
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) break;
            const json = (await res.json()) as {
                result?: {
                    points?: Array<{ id: number | string; payload?: { podcastId?: string } }>;
                    next_page_offset?: number | string | null;
                };
            };
            const points = json.result?.points ?? [];
            for (const pt of points) {
                const pid = pt.payload?.podcastId;
                if (!pid || !validPodcastIds.has(pid)) {
                    orphanPointIds.push(pt.id);
                }
            }
            const nextOffset = json.result?.next_page_offset ?? null;
            if (nextOffset === null || points.length === 0) break;
            offset = nextOffset;
        }

        if (orphanPointIds.length > 0) {
            await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/delete?wait=true`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "api-key": QDRANT_API_KEY,
                },
                body: JSON.stringify({ points: orphanPointIds }),
            });
        }
    } catch {
        // Non-fatal if offline
    }

    return orphanPointIds.length;
}
