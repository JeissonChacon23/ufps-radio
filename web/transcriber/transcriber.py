# transcriber/transcriber.py
"""Transcribes the podcast episodes registered in the web admin and indexes them in Qdrant.

Cycle over the `podcasts` collection:
  1. status "pendiente"  -> "en_proceso"
  2. download the audio from Google Drive (gdown)
  3. transcribe in Spanish with faster-whisper (preserving segment timestamps)
  4. save transcript, keywords and transcribedAt, status "lista"
  5. index timed chunks in Qdrant (`podcast_segments`) using BM25 sparse vectors
  6. on failure: status "error" and the reason in errorMessage
"""

import os

# Must be set before importing grpc / firebase_admin / google.cloud.firestore on macOS
# to prevent "ev_poll_posix.cc: FD from fork parent still in poll list" and dead gRPC sockets
os.environ.setdefault("GRPC_ENABLE_FORK_SUPPORT", "1")
os.environ.setdefault("GRPC_POLL_STRATEGY", "poll")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

import argparse
import json
import math
import re
import tempfile
import time
import unicodedata
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import firebase_admin
import gdown
from faster_whisper import WhisperModel
from firebase_admin import firestore as admin_firestore
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
BEAM_SIZE = int(os.getenv("WHISPER_BEAM_SIZE", "3"))
CPU_THREADS = int(os.getenv("WHISPER_THREADS", str(max(1, os.cpu_count() or 4))))
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "30"))
STUCK_AFTER_MINUTES = int(os.getenv("STUCK_AFTER_MINUTES", "180"))
MAX_KEYWORDS = 500
MIN_WORD_LENGTH = 3
MAX_TRANSCRIPT_BYTES = 450_000  # Keep well below Firestore's 1 MiB total document limit
MAX_FIRESTORE_SEGMENTS = 400    # Qdrant indexes all segments; Firestore keeps up to 400

CACHE_DIR = Path(__file__).resolve().parent / ".transcriber_cache"

QDRANT_URL = os.getenv(
    "QDRANT_URL",
    "https://911356d3-0c20-4d27-a9e0-64d525402b4c.us-east-1-1.aws.cloud.qdrant.io:6333",
).rstrip("/")
QDRANT_API_KEY = os.getenv(
    "QDRANT_API_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIiwic3ViamVjdCI6ImFwaS1rZXk6N2EzNjFiNDktODRjOC00Y2JmLWFkNzAtOGY3Y2VkODUyN2M0In0.u2Q91Be-pJkouR2vxn42XpTdwVylVQu-O6f61xX-jBE",
)
QDRANT_COLLECTION = "podcast_segments"

DOWNLOAD_ERROR = (
    "No se pudo descargar el audio. Revisa que el archivo esté compartido como "
    "«Cualquier persona con el enlace»."
)

# Spanish stop words, already without accents (see normalize()).
STOPWORDS = set(
    """
    a al algo algun alguna algunas alguno algunos ante antes aqui asi aun aunque bien bueno cada casi
    como con contra cosa cosas cual cuales cuando cuanto de del desde donde dos el ella ellas ello
    ellos en entonces entre era eran eres es esa esas ese eso esos esta estaba estaban estamos estan
    estar este esto estos estoy fue fueron fui ha haber habia hace hacer hacia han hasta hay he
    hemos hoy la las le les lo los mas me mi mientras mis mismo muchas mucho muchos muy nada ni no
    nos nosotros nuestra nuestro o osea otra otras otro otros para pero poco pues por porque que
    quien quienes se sea segun ser si siempre sin sobre solo son soy su sus tambien tan tanto te
    tener tengo ti tiene tienen todo todos tu tus un una uno unos usted ustedes va vamos van veces
    vez voy y ya yo
    """.split()
)

DRIVE_PATTERNS = [
    r"/file/d/([a-zA-Z0-9_-]{10,})",
    r"[?&]id=([a-zA-Z0-9_-]{10,})",
    r"/d/([a-zA-Z0-9_-]{10,})",
]


class TranscriptionError(Exception):
    """An expected failure whose message is shown to the person in the web admin."""


def extract_drive_id(text: str) -> str | None:
    """Accepts a Drive share link or a bare file ID."""
    value = text.strip()
    for pattern in DRIVE_PATTERNS:
        match = re.search(pattern, value)
        if match:
            return match.group(1)
    return value if re.fullmatch(r"[a-zA-Z0-9_-]{20,}", value) else None


def normalize(text: str) -> str:
    """Lowercase and without accents. The iOS and web apps apply the same normalization."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


def fnv1a31(text: str) -> int:
    """Deterministic 31-bit FNV-1a hash matching Swift and TypeScript implementations."""
    h = 0x811C9DC5
    for byte in text.encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h & 0x7FFFFFFF


def build_bm25_sparse_vector(text: str) -> dict[str, list]:
    tokens = [
        w for w in re.findall(r"[a-z0-9]+", normalize(text))
        if len(w) >= 2 and w not in STOPWORDS
    ]
    counts: dict[int, float] = {}
    for token in tokens:
        exact_idx = fnv1a31(token)
        counts[exact_idx] = counts.get(exact_idx, 0.0) + 1.0
        if len(token) >= 5:
            stem_idx = fnv1a31(f"stem:{token[:5]}")
            counts[stem_idx] = counts.get(stem_idx, 0.0) + 0.65

    indices = []
    values = []
    for idx, tf in counts.items():
        indices.append(idx)
        values.append(1.0 + math.log(tf))
    return {"indices": indices, "values": values}


def extract_keywords(transcript: str) -> list[str]:
    words = re.findall(r"[a-z0-9]+", normalize(transcript))
    counts = Counter(
        word
        for word in words
        if len(word) >= MIN_WORD_LENGTH and word not in STOPWORDS and not word.isdigit()
    )
    return [word for word, _ in counts.most_common(MAX_KEYWORDS)]


_model: WhisperModel | None = None


def get_model() -> WhisperModel:
    global _model
    if _model is None:
        print(f"Cargando el modelo '{MODEL_SIZE}' ({CPU_THREADS} hilos CPU)…")
        _model = WhisperModel(
            MODEL_SIZE,
            device="cpu",
            compute_type="int8",
            cpu_threads=CPU_THREADS,
        )
    return _model


def format_mmss(seconds: float) -> str:
    total = max(0, int(seconds))
    mins, secs = divmod(total, 60)
    hrs, mins = divmod(mins, 60)
    if hrs > 0:
        return f"{hrs}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"


def transcribe_with_segments(path: str) -> tuple[str, list[dict]]:
    """Returns full transcript text and timed chunks (~45 words each with startSeconds/endSeconds)."""
    model = get_model()
    raw_segments, info = model.transcribe(
        path,
        language="es",
        vad_filter=True,
        beam_size=BEAM_SIZE,
    )
    total_duration = float(getattr(info, "duration", 0.0) or 0.0)
    if total_duration > 0:
        print(f"  Duración detectada del audio: {format_mmss(total_duration)}")

    full_parts: list[str] = []
    timed_chunks: list[dict] = []

    current_words: list[str] = []
    chunk_start: float | None = None
    chunk_end: float = 0.0

    last_log_time = time.monotonic()
    last_logged_pct = -5

    for seg in raw_segments:
        text = seg.text.strip()
        if not text:
            continue
        full_parts.append(text)
        seg_words = text.split()
        if chunk_start is None:
            chunk_start = float(seg.start)
        current_words.extend(seg_words)
        chunk_end = float(seg.end)

        if total_duration > 0:
            pct = min(99, int((chunk_end / total_duration) * 100))
            now_mono = time.monotonic()
            if pct >= last_logged_pct + 5 or (now_mono - last_log_time) >= 20:
                print(
                    f"  Transcribiendo: {format_mmss(chunk_end)} / {format_mmss(total_duration)} ({pct}%)…",
                    flush=True,
                )
                last_logged_pct = pct
                last_log_time = now_mono

        if len(current_words) >= 42:
            timed_chunks.append(
                {
                    "startSeconds": round(chunk_start, 1),
                    "endSeconds": round(chunk_end, 1),
                    "text": " ".join(current_words),
                }
            )
            # Keep last 8 words as overlap for context continuity
            current_words = current_words[-8:]
            chunk_start = float(seg.end)

    if current_words:
        timed_chunks.append(
            {
                "startSeconds": round(chunk_start or 0.0, 1),
                "endSeconds": round(chunk_end, 1),
                "text": " ".join(current_words),
            }
        )

    print("  Transcripción de audio completada (100%).", flush=True)
    return " ".join(full_parts).strip(), timed_chunks


def build_chunks_from_plain_transcript(transcript: str) -> list[dict]:
    words = transcript.split()
    total_words = max(len(words), 1)
    # Average Spanish radio speech rate is ~2.5 words per second (150 words/min)
    words_per_second = 2.5
    chunk_size = 45
    overlap = 10
    step = max(chunk_size - overlap, 1)
    chunks: list[dict] = []
    i = 0
    while i < len(words):
        end = min(i + chunk_size, len(words))
        start_secs = round(i / words_per_second, 1)
        end_secs = round(end / words_per_second, 1)
        chunks.append(
            {
                "text": " ".join(words[i:end]),
                "startSeconds": start_secs,
                "endSeconds": end_secs,
                "progressRatio": round(i / total_words, 4),
            }
        )
        if end == len(words):
            break
        i += step
    return chunks


def qdrant_request(method: str, path: str, body: dict | None = None, timeout: int = 30) -> dict | None:
    if not QDRANT_URL or not QDRANT_API_KEY:
        return None
    url = f"{QDRANT_URL}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "api-key": QDRANT_API_KEY,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def ensure_qdrant_collection() -> None:
    try:
        qdrant_request("GET", f"/collections/{QDRANT_COLLECTION}")
    except Exception:
        try:
            qdrant_request(
                "PUT",
                f"/collections/{QDRANT_COLLECTION}",
                {"vectors": {}, "sparse_vectors": {"bm25": {"modifier": "idf"}}},
            )
        except Exception as err:
            print(f"  Aviso: no se pudo inicializar la colección en Qdrant: {err}")

    try:
        qdrant_request(
            "PUT",
            f"/collections/{QDRANT_COLLECTION}/index?wait=true",
            {"field_name": "podcastId", "field_schema": "keyword"},
        )
    except Exception:
        pass


def prune_orphan_points_in_qdrant(valid_podcast_ids: set[str]) -> int:
    """Deletes any point in Qdrant whose podcastId is no longer in Firestore's 'lista' episodes."""
    if not QDRANT_URL or not QDRANT_API_KEY:
        return 0
    orphan_point_ids: list = []
    offset = None
    try:
        for _ in range(30):
            body: dict = {
                "limit": 250,
                "with_payload": ["podcastId"],
                "with_vector": False,
            }
            if offset is not None:
                body["offset"] = offset
            resp = qdrant_request(
                "POST",
                f"/collections/{QDRANT_COLLECTION}/points/scroll",
                body,
            )
            result = (resp or {}).get("result") or {}
            points = result.get("points") or []
            for pt in points:
                pid = (pt.get("payload") or {}).get("podcastId")
                if not pid or pid not in valid_podcast_ids:
                    orphan_point_ids.append(pt["id"])
            next_offset = result.get("next_page_offset")
            if next_offset is None or not points:
                break
            offset = next_offset

        if orphan_point_ids:
            for start in range(0, len(orphan_point_ids), 200):
                batch = orphan_point_ids[start : start + 200]
                qdrant_request(
                    "POST",
                    f"/collections/{QDRANT_COLLECTION}/points/delete?wait=true",
                    {"points": batch},
                )
    except Exception as err:
        print(f"  Aviso al limpiar fragmentos huérfanos en Qdrant: {err}")
    return len(orphan_point_ids)


def index_episode_in_qdrant(
    podcast_id: str,
    data: dict,
    transcript: str,
    keywords: list[str],
    chunks: list[dict] | None = None,
    program_meta: dict | None = None,
) -> int:
    if not QDRANT_URL or not QDRANT_API_KEY:
        return 0
    ensure_qdrant_collection()

    # Delete any previous segments for this podcastId before inserting fresh ones
    try:
        qdrant_request(
            "POST",
            f"/collections/{QDRANT_COLLECTION}/points/delete?wait=true",
            {"filter": {"must": [{"key": "podcastId", "match": {"value": podcast_id}}]}},
        )
    except Exception:
        pass

    program_id = str(data.get("programId", ""))
    program_name = str(data.get("programName", ""))
    air_date = data.get("airDate")
    air_date_seconds = (
        air_date.timestamp() if hasattr(air_date, "timestamp") else time.time()
    )
    air_time = str(data.get("airTime", ""))
    audio_id = extract_drive_id(str(data.get("audioUrl", ""))) or ""
    p_meta = (program_meta or {}).get(program_id, {})
    image_id = (
        extract_drive_id(str(data.get("imageUrl") or ""))
        or p_meta.get("imageId", "")
        or ""
    )
    hosts = data.get("hosts") or p_meta.get("hosts") or []
    keywords_str = " ".join(keywords)

    effective_chunks = chunks if chunks else build_chunks_from_plain_transcript(transcript)
    points = []
    for idx, ch in enumerate(effective_chunks):
        chunk_text = ch.get("text", "").strip()
        if not chunk_text:
            continue
        sparse = build_bm25_sparse_vector(f"{program_name} {keywords_str} {chunk_text}")
        if not sparse["indices"]:
            continue

        payload = {
            "podcastId": podcast_id,
            "programId": program_id,
            "programName": program_name,
            "airDate": air_date_seconds,
            "airTime": air_time,
            "hosts": hosts,
            "imageId": image_id,
            "audioId": audio_id,
            "chunkIndex": idx,
            "text": chunk_text,
        }
        if "startSeconds" in ch:
            payload["startSeconds"] = ch["startSeconds"]
        if "endSeconds" in ch:
            payload["endSeconds"] = ch["endSeconds"]
        if "progressRatio" in ch:
            payload["progressRatio"] = ch["progressRatio"]

        points.append(
            {
                "id": fnv1a31(f"{podcast_id}#{idx}"),
                "vector": {"bm25": sparse},
                "payload": payload,
            }
        )

    if not points:
        return 0

    # Upload in batches of 100 points so long 1-hour+ episodes never hit HTTP timeouts
    batch_size = 100
    for start in range(0, len(points), batch_size):
        batch = points[start : start + batch_size]
        qdrant_request(
            "PUT",
            f"/collections/{QDRANT_COLLECTION}/points?wait=true",
            {"points": batch},
            timeout=45,
        )
    return len(points)


def sync_existing_to_qdrant(db) -> None:
    """Indexes all existing 'lista' episodes from Firestore into Qdrant on startup."""
    try:
        program_meta = {}
        for p_doc in db.collection("programs").stream():
            pd = p_doc.to_dict() or {}
            program_meta[p_doc.id] = {
                "hosts": pd.get("hosts") or [],
                "imageId": extract_drive_id(str(pd.get("artworkDriveId") or "")) or "",
            }

        ready_docs = list(
            db.collection("podcasts")
            .where(filter=FieldFilter("status", "==", "lista"))
            .stream()
        )
        valid_ids = {doc.id for doc in ready_docs}
        removed_orphans = prune_orphan_points_in_qdrant(valid_ids)
        if removed_orphans > 0:
            print(f"Limpieza Qdrant: se eliminaron {removed_orphans} fragmentos de podcasts borrados.")

        total_points = 0
        for doc in ready_docs:
            data = doc.to_dict() or {}
            transcript = str(data.get("transcript") or "")
            keywords = data.get("keywords") or extract_keywords(transcript)
            count = index_episode_in_qdrant(
                doc.id,
                data,
                transcript,
                keywords,
                chunks=data.get("segments"),
                program_meta=program_meta,
            )
            total_points += count
        print(
            f"Sincronización Qdrant completada: {len(ready_docs)} episodios ({total_points} fragmentos)."
        )
    except Exception as err:
        print(f"Aviso al sincronizar episodios existentes con Qdrant: {err}")


def download_audio(file_id: str, folder: str) -> str:
    target = os.path.join(folder, "audio")
    print(f"  Descargando audio desde Google Drive (id={file_id})…", flush=True)
    try:
        result = gdown.download(id=file_id, output=target, quiet=True)
    except Exception as error:  # gdown raises when the file is private or the quota is exceeded
        raise TranscriptionError(DOWNLOAD_ERROR) from error

    if not result or not os.path.exists(target) or os.path.getsize(target) < 10_000:
        raise TranscriptionError(DOWNLOAD_ERROR)

    with open(target, "rb") as file:
        head = file.read(512).lstrip().lower()
    if head.startswith(b"<!doctype html") or head.startswith(b"<html"):
        raise TranscriptionError(DOWNLOAD_ERROR)  # Google answered with a web page, not the audio

    size_mb = os.path.getsize(target) / (1024 * 1024)
    print(f"  Audio descargado correctamente ({size_mb:.1f} MB).", flush=True)
    return target


def load_cached_transcription(podcast_id: str, file_id: str) -> tuple[str, list[dict]] | None:
    cache_file = CACHE_DIR / f"{podcast_id}.json"
    if not cache_file.exists():
        return None
    try:
        payload = json.loads(cache_file.read_text(encoding="utf-8"))
        if payload.get("fileId") == file_id and payload.get("transcript"):
            print("  Recuperando transcripción guardada en caché local…", flush=True)
            return str(payload["transcript"]), list(payload.get("segments") or [])
    except Exception:
        pass
    return None


def save_cached_transcription(podcast_id: str, file_id: str, transcript: str, timed_chunks: list[dict]) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        cache_file = CACHE_DIR / f"{podcast_id}.json"
        cache_file.write_text(
            json.dumps(
                {
                    "fileId": file_id,
                    "transcript": transcript,
                    "segments": timed_chunks,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except Exception as err:
        print(f"  Aviso: no se pudo escribir caché local: {err}")


def remove_cached_transcription(podcast_id: str) -> None:
    try:
        cache_file = CACHE_DIR / f"{podcast_id}.json"
        if cache_file.exists():
            cache_file.unlink()
    except Exception:
        pass


def update_firestore_with_retry(podcast_id: str, update_payload: dict) -> None:
    """Writes to Firestore with automatic gRPC client reconnection if the socket went idle
    during a long (10+ minute) audio transcription."""
    last_err: Exception | None = None
    for attempt in range(1, 5):
        try:
            # Instantiate a fresh Firestore client on retry so a stale 10-minute idle gRPC
            # channel is replaced with a brand-new connection.
            client = firestore.Client() if attempt > 1 else admin_firestore.client()
            doc_ref = client.collection("podcasts").document(podcast_id)
            doc_ref.update(update_payload, timeout=120.0)
            return
        except Exception as err:
            last_err = err
            wait_secs = attempt * 3
            print(
                f"  Aviso: intento {attempt}/4 al guardar en Firestore falló ({err}). "
                f"Reintentando con nueva conexión en {wait_secs}s…",
                flush=True,
            )
            time.sleep(wait_secs)
    if last_err is not None:
        raise last_err


def claim(db, ref) -> bool:
    """Moves the episode from "pendiente" to "en_proceso" in one transaction."""

    @firestore.transactional
    def run(transaction) -> bool:
        snapshot = ref.get(transaction=transaction)
        data = snapshot.to_dict() or {}
        if not snapshot.exists or data.get("status") != "pendiente":
            return False
        transaction.update(
            ref,
            {"status": "en_proceso", "processingStartedAt": firestore.SERVER_TIMESTAMP},
        )
        return True

    return run(db.transaction())


def mark_error(podcast_id: str, reason: str) -> None:
    print(f"  Error: {reason}", flush=True)
    try:
        update_firestore_with_retry(
            podcast_id,
            {
                "status": "error",
                "errorMessage": reason[:500],
                "failedAt": firestore.SERVER_TIMESTAMP,
            },
        )
    except Exception as err:
        print(f"  No se pudo registrar el estado de error en Firestore: {err}")


def process(db, ref) -> None:
    if not claim(db, ref):
        return
    podcast_id = ref.id
    data = ref.get().to_dict() or {}
    print(f"Procesando: {data.get('programName', podcast_id)} ({podcast_id})", flush=True)

    try:
        file_id = extract_drive_id(str(data.get("audioUrl", "")))
        if not file_id:
            raise TranscriptionError("El enlace del audio no es de Google Drive.")

        cached = load_cached_transcription(podcast_id, file_id)
        if cached is not None:
            transcript, timed_chunks = cached
        else:
            # Ensure Whisper model is loaded before downloading
            get_model()
            with tempfile.TemporaryDirectory() as folder:
                audio_path = download_audio(file_id, folder)
                transcript, timed_chunks = transcribe_with_segments(audio_path)
            if transcript:
                save_cached_transcription(podcast_id, file_id, transcript, timed_chunks)

        if not transcript:
            raise TranscriptionError("No se detectó voz en el audio.")
        if len(transcript.encode("utf-8")) > MAX_TRANSCRIPT_BYTES:
            transcript = transcript.encode("utf-8")[:MAX_TRANSCRIPT_BYTES].decode("utf-8", "ignore")

        keywords = extract_keywords(transcript)
        firestore_segments = timed_chunks[:MAX_FIRESTORE_SEGMENTS]

        print("  Guardando transcripción en Firestore…", flush=True)
        update_firestore_with_retry(
            podcast_id,
            {
                "transcript": transcript,
                "segments": firestore_segments,
                "keywords": keywords,
                "transcribedAt": firestore.SERVER_TIMESTAMP,
                "status": "lista",
                "errorMessage": firestore.DELETE_FIELD,
            },
        )

        try:
            pts = index_episode_in_qdrant(podcast_id, data, transcript, keywords, chunks=timed_chunks)
            print(f"  Lista e indexada en Qdrant ({pts} fragmentos).", flush=True)
        except Exception as q_err:
            print(f"  Lista en Firestore (aviso Qdrant: {q_err}).", flush=True)

        remove_cached_transcription(podcast_id)
    except TranscriptionError as error:
        mark_error(podcast_id, str(error))
    except Exception as error:  # anything unexpected must not stop the whole cycle
        mark_error(podcast_id, f"Error inesperado: {error}")


def release_stuck(db) -> None:
    """Episodes left in "en_proceso" by a run that crashed, or that failed with a transient
    504/503 gRPC timeout, go back to "pendiente" automatically."""
    limit = datetime.now(timezone.utc) - timedelta(minutes=STUCK_AFTER_MINUTES)
    query = db.collection("podcasts").where(filter=FieldFilter("status", "==", "en_proceso"))
    for doc in query.stream():
        started = (doc.to_dict() or {}).get("processingStartedAt")
        if started is None or started < limit:
            print(f"Devolviendo episodio estancado a pendiente: {doc.id}")
            doc.reference.update({"status": "pendiente"})

    # Also auto-recover episodes that failed due to transient 504 Deadline Exceeded / 503 network timeouts
    err_query = db.collection("podcasts").where(filter=FieldFilter("status", "==", "error"))
    for doc in err_query.stream():
        msg = str((doc.to_dict() or {}).get("errorMessage") or "")
        if "504" in msg or "Deadline Exceeded" in msg or "503" in msg:
            print(f"Reintentando episodio que falló por timeout de red ({doc.id})…")
            doc.reference.update(
                {
                    "status": "pendiente",
                    "errorMessage": firestore.DELETE_FIELD,
                }
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe los episodios pendientes de podcasts.")
    parser.add_argument("--once", action="store_true", help="Procesa los pendientes y termina.")
    parser.add_argument("--sync-qdrant", action="store_true", help="Sincroniza los episodios listos con Qdrant y termina.")
    args = parser.parse_args()

    if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        default_key = os.path.join(os.path.dirname(__file__), "serviceAccountKey.json")
        if os.path.exists(default_key):
            os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = default_key

    firebase_admin.initialize_app()
    db = admin_firestore.client()

    sync_existing_to_qdrant(db)
    if args.sync_qdrant:
        return

    release_stuck(db)

    print("Buscando episodios pendientes…", flush=True)
    try:
        while True:
            pending = list(
                db.collection("podcasts")
                .where(filter=FieldFilter("status", "==", "pendiente"))
                .limit(10)
                .stream()
            )
            for doc in pending:
                process(db, doc.reference)

            if args.once:
                break
            if not pending:
                time.sleep(POLL_SECONDS)
    except KeyboardInterrupt:
        print("Detenido.")


if __name__ == "__main__":
    main()
