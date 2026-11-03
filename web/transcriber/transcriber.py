# transcriber/transcriber.py
"""Transcribes the podcast episodes registered in the web admin.

Cycle over the `podcasts` collection:
  1. status "pendiente"  -> "en_proceso"
  2. download the audio from Google Drive (gdown)
  3. transcribe in Spanish with faster-whisper
  4. save transcript, keywords and transcribedAt, status "lista"
  5. on failure: status "error" and the reason in errorMessage
It only reads and writes Firestore (Firebase Admin). The Google Drive API is not used.
"""

import argparse
import os
import re
import tempfile
import time
import unicodedata
from collections import Counter
from datetime import datetime, timedelta, timezone

import firebase_admin
import gdown
from faster_whisper import WhisperModel
from firebase_admin import firestore as admin_firestore
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "30"))
STUCK_AFTER_MINUTES = int(os.getenv("STUCK_AFTER_MINUTES", "180"))
MAX_KEYWORDS = 80
MIN_WORD_LENGTH = 3
MAX_TRANSCRIPT_BYTES = 900_000  # a Firestore document is limited to 1 MiB

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
    """Lowercase and without accents. The iOS app applies the same normalization to the query."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(char for char in decomposed if unicodedata.category(char) != "Mn")


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
        print(f"Cargando el modelo '{MODEL_SIZE}' (la primera vez se descarga)…")
        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type="int8")
    return _model


def transcribe(path: str) -> str:
    segments, _info = get_model().transcribe(path, language="es", vad_filter=True, beam_size=5)
    return " ".join(segment.text.strip() for segment in segments).strip()


def download_audio(file_id: str, folder: str) -> str:
    target = os.path.join(folder, "audio")
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
    return target


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


def mark_error(ref, reason: str) -> None:
    print(f"  Error: {reason}")
    ref.update(
        {
            "status": "error",
            "errorMessage": reason[:500],
            "failedAt": firestore.SERVER_TIMESTAMP,
        }
    )


def process(db, ref) -> None:
    if not claim(db, ref):
        return
    data = ref.get().to_dict() or {}
    print(f"Procesando: {data.get('programName', ref.id)} ({ref.id})")

    try:
        file_id = extract_drive_id(str(data.get("audioUrl", "")))
        if not file_id:
            raise TranscriptionError("El enlace del audio no es de Google Drive.")

        with tempfile.TemporaryDirectory() as folder:
            audio_path = download_audio(file_id, folder)
            transcript = transcribe(audio_path)

        if not transcript:
            raise TranscriptionError("No se detectó voz en el audio.")
        if len(transcript.encode("utf-8")) > MAX_TRANSCRIPT_BYTES:
            transcript = transcript.encode("utf-8")[:MAX_TRANSCRIPT_BYTES].decode("utf-8", "ignore")

        ref.update(
            {
                "transcript": transcript,
                "keywords": extract_keywords(transcript),
                "transcribedAt": firestore.SERVER_TIMESTAMP,
                "status": "lista",
                "errorMessage": firestore.DELETE_FIELD,
            }
        )
        print("  Lista.")
    except TranscriptionError as error:
        mark_error(ref, str(error))
    except Exception as error:  # anything unexpected must not stop the whole cycle
        mark_error(ref, f"Error inesperado: {error}")


def release_stuck(db) -> None:
    """Episodes left in "en_proceso" by a run that crashed go back to "pendiente"."""
    limit = datetime.now(timezone.utc) - timedelta(minutes=STUCK_AFTER_MINUTES)
    query = db.collection("podcasts").where(filter=FieldFilter("status", "==", "en_proceso"))
    for doc in query.stream():
        started = (doc.to_dict() or {}).get("processingStartedAt")
        if started is None or started < limit:
            print(f"Devolviendo a pendiente: {doc.id}")
            doc.reference.update({"status": "pendiente"})


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe los episodios pendientes de podcasts.")
    parser.add_argument("--once", action="store_true", help="Procesa los pendientes y termina.")
    args = parser.parse_args()

    firebase_admin.initialize_app()  # uses GOOGLE_APPLICATION_CREDENTIALS
    db = admin_firestore.client()
    release_stuck(db)

    print("Buscando episodios pendientes…")
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