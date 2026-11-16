"""Loopback-only API. Firebase signed tokens, durable SQLite queue, one worker."""
from contextlib import asynccontextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import tempfile
import threading
import time
import uuid

import cachecontrol
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.id_token import verify_firebase_token
import requests
from starlette.middleware.trustedhost import TrustedHostMiddleware

from separate import MAX_BYTES, ROOT, STEMS, validate_stems
import cloud_publish

DATA = Path(os.environ.get("ALABANZA_AUDIO_DATA_DIR", str(ROOT / ".local"))).resolve()
PROJECT = "alabanza-b1d52"
ORIGINS = ["http://127.0.0.1:5500", "http://localhost:5500"]
STOP = threading.Event()
VERIFY_LOCK = threading.Lock()
CERT_REQUEST = GoogleRequest(session=cachecontrol.CacheControl(requests.Session()))


def connect():
    connection = sqlite3.connect(str(DATA / "web.sqlite3"), timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize():
    for name in ("uploads", "logs", "incoming"):
        (DATA / name).mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.executescript("""
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS songs (
            id TEXT PRIMARY KEY, ready_job TEXT, pending_job TEXT);
        CREATE TABLE IF NOT EXISTS jobs (
            id TEXT PRIMARY KEY, song_id TEXT NOT NULL, source TEXT NOT NULL,
            status TEXT NOT NULL, owner TEXT NOT NULL, created REAL NOT NULL,
            output TEXT, error TEXT);
        CREATE TABLE IF NOT EXISTS publications (
            job_id TEXT PRIMARY KEY, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
            retry_at REAL NOT NULL DEFAULT 0, error TEXT, bytes INTEGER);
        CREATE TABLE IF NOT EXISTS audio_administrators (
            firebase_uid TEXT PRIMARY KEY, label TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS observed_accounts (
            firebase_uid TEXT PRIMARY KEY, email TEXT NOT NULL DEFAULT '', last_seen REAL NOT NULL);
        """)


def song_id(value):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value):
        raise HTTPException(400, "Identificador de canción inválido.")
    return value


def is_audio_admin(user):
    with connect() as db:
        return db.execute('SELECT 1 FROM audio_administrators WHERE firebase_uid=?',(user.get('sub'),)).fetchone() is not None


def principal(authorization: str = Header(default="")):
    if not authorization.startswith("Bearer ") or len(authorization) > 16384:
        raise HTTPException(401, "Inicia sesión para acceder al audio.")
    try:
        # This verifies a signed ID token, not a caller-provided user profile.
        with VERIFY_LOCK:
            claims = verify_firebase_token(authorization[7:], CERT_REQUEST, audience=PROJECT)
        if (claims.get("iss") != "https://securetoken.google.com/" + PROJECT
                or not isinstance(claims.get("sub"), str)
                or not 0 < len(claims["sub"]) <= 128):
            raise ValueError("Invalid issuer or subject")
        with connect() as db:
            db.execute('INSERT INTO observed_accounts VALUES (?,?,?) ON CONFLICT(firebase_uid) DO UPDATE SET email=excluded.email,last_seen=excluded.last_seen',
                       (claims['sub'],claims.get('email',''),time.time()))
        if is_audio_admin(claims) and isinstance(claims.get('exp'),(int,float)):
            cloud_publish.remember_session(authorization[7:],claims['exp'])
        return claims
    except Exception:
        raise HTTPException(401, "La sesión no es válida. Vuelve a iniciar sesión.")


def administrator(user=Depends(principal)):
    if not is_audio_admin(user):
        raise HTTPException(403, "Solo un administrador puede cargar audios.")
    return user


def worker_loop():
    while not STOP.is_set():
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            job = db.execute("SELECT * FROM jobs WHERE status='pendiente' ORDER BY created LIMIT 1").fetchone()
            if job:
                db.execute("UPDATE jobs SET status='procesando' WHERE id=?", (job["id"],))
        if not job:
            publish_next()
            STOP.wait(1)
            continue
        log_path = DATA / "logs" / (job["id"] + ".log")
        output = None
        error = "No se pudo separar el audio. Revisa el archivo e inténtalo de nuevo."
        try:
            with log_path.open("w") as log:
                result = subprocess.run([sys.executable, str(ROOT / "separate.py"), job["source"],
                                         "--data-dir", str(DATA)], stdout=log,
                                        stderr=subprocess.STDOUT, timeout=2000)
            if result.returncode == 0:
                for line in log_path.read_text(errors="replace").splitlines():
                    if line.startswith("Resultado: "):
                        output = Path(line[len("Resultado: "):]).resolve()
                if output is None or output.parent != DATA / "outputs":
                    raise ValueError("Invalid result path")
                manifest = json.loads((output / "manifest.json").read_text())
                validate_stems(output, manifest["frames"], manifest["stems"])
        except Exception:
            output = None
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if output is not None:
                db.execute("UPDATE jobs SET status='listo',output=? WHERE id=?", (str(output), job["id"]))
                db.execute("UPDATE songs SET ready_job=?,pending_job=NULL WHERE id=? AND pending_job=?",
                           (job["id"], job["song_id"], job["id"]))
            else:
                db.execute("UPDATE jobs SET status='error',error=? WHERE id=?", (error, job["id"]))
                # Retain the failed job for display and allow an explicit retry by uploading.
        # On restart the durable queue retries any interrupted work.


def publish_next():
    if not cloud_publish.configured():
        return
    with connect() as db:
        db.execute("INSERT OR IGNORE INTO publications(job_id,status) SELECT ready_job,'pendiente' FROM songs WHERE ready_job IS NOT NULL")
        job = db.execute("""SELECT j.* FROM publications p JOIN jobs j ON j.id=p.job_id
            JOIN songs s ON s.ready_job=j.id WHERE p.status IN ('pendiente','error')
            AND p.attempts<3 AND p.retry_at<=? ORDER BY j.created LIMIT 1""", (time.time(),)).fetchone()
        if job:
            db.execute("UPDATE publications SET status='subiendo',attempts=attempts+1 WHERE job_id=?", (job['id'],))
    if not job:
        return
    try:
        manifest = cloud_publish.publish(job['song_id'],Path(job['output']),DATA)
        with connect() as db:
            db.execute("UPDATE publications SET status='publicado',error=NULL,bytes=? WHERE job_id=?",
                       (manifest['totalBytes'],job['id']))
    except Exception:
        # Local playback remains ready even if the cloud is unavailable.
        with connect() as db:
            db.execute("UPDATE publications SET status='error',retry_at=?,error=? WHERE job_id=?",
                       (time.time()+60,'No se pudo subir a la nube. Revisa la configuración y vuelve a intentar.',job['id']))


@asynccontextmanager
async def lifespan(app):
    cloud_publish.load_private_config()
    initialize()
    lock = (DATA / "web-worker.lock").open("a")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        lock.close()
        raise RuntimeError("Ya hay un servidor de audio activo.")
    with connect() as db:
        db.execute("UPDATE jobs SET status='pendiente' WHERE status='procesando'")
        db.execute("UPDATE publications SET status='pendiente' WHERE status='subiendo'")
    STOP.clear()
    thread = threading.Thread(target=worker_loop, daemon=True)
    thread.start()
    try:
        yield
    finally:
        STOP.set()
        # An in-flight subprocess can finish during shutdown; no second worker can start.
        thread.join()
        lock.close()


app = FastAPI(title="Ensayo local", lifespan=lifespan, docs_url=None, redoc_url=None)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS,
                   allow_methods=["GET", "POST"],
                   allow_headers=["Authorization", "Content-Type"], max_age=600)


@app.middleware("http")
async def private_responses(request: Request, call_next):
    if request.method == "POST" and request.headers.get("origin") not in ORIGINS:
        return JSONResponse({"detail": "Origen no permitido."}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.get("/health")
def health():
    return {"status": "ok", "mode": "local"}


def public_song(identifier):
    with connect() as db:
        song = db.execute("SELECT * FROM songs WHERE id=?", (identifier,)).fetchone()
        if not song:
            return {"state": "sin_audio", "ready": False}
        pending = db.execute("SELECT * FROM jobs WHERE id=?", (song["pending_job"],)).fetchone()
        ready = db.execute("SELECT * FROM jobs WHERE id=?", (song["ready_job"],)).fetchone()
    response = {"state": pending["status"] if pending else "listo" if ready else "sin_audio",
                "ready": bool(ready), "jobId": pending["id"] if pending else None}
    if pending and pending["status"] == "error":
        response["error"] = pending["error"]
    if ready:
        manifest = json.loads((Path(ready["output"]) / "manifest.json").read_text())
        response.update(version=ready["id"], duration=manifest["frames"] / 44100,
                        sampleRate=44100, frames=manifest["frames"], stems=list(manifest["stems"]),
                        model=manifest.get("model", "htdemucs"))
        with connect() as db:
            publication = db.execute('SELECT * FROM publications WHERE job_id=?',(ready['id'],)).fetchone()
        response['cloudState'] = publication['status'] if publication else 'pendiente' if cloud_publish.configured() else 'sin_configurar'
        if publication and publication['error']:
            response['cloudError'] = publication['error']
    return response


@app.post('/songs/{identifier}/publish')
def retry_publish(identifier: str,user=Depends(administrator)):
    identifier = song_id(identifier)
    if not cloud_publish.configured():
        raise HTTPException(409,'Falta conectar el almacenamiento privado en el Mac.')
    with connect() as db:
        song = db.execute('SELECT ready_job FROM songs WHERE id=?',(identifier,)).fetchone()
        if not song or not song['ready_job']:
            raise HTTPException(409,'Primero procesa el audio.')
        existing = db.execute('SELECT status FROM publications WHERE job_id=?',(song['ready_job'],)).fetchone()
        if existing and existing['status']=='subiendo':
            raise HTTPException(409,'La subida ya está en curso.')
        db.execute("INSERT INTO publications(job_id,status) VALUES (?,'pendiente') ON CONFLICT(job_id) DO UPDATE SET status='pendiente',attempts=0,retry_at=0,error=NULL",(song['ready_job'],))
    return {'state':'pendiente'}


@app.get("/songs/{identifier}")
def get_song(identifier: str, user=Depends(principal)):
    result=public_song(song_id(identifier))
    result['canPublish']=is_audio_admin(user)
    return result


@app.post("/songs/{identifier}/audio", status_code=202)
async def upload(identifier: str, request: Request, user=Depends(administrator)):
    identifier = song_id(identifier)
    media_type = request.headers.get("content-type", "").split(";")[0]
    extension = {"audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav"}.get(media_type)
    if not extension:
        raise HTTPException(415, "Selecciona un archivo MP3 o WAV.")
    try:
        length = int(request.headers.get("content-length", "0"))
    except ValueError:
        raise HTTPException(400, "Tamaño de carga inválido.")
    if length > MAX_BYTES:
        raise HTTPException(413, "El audio no puede superar 100 MiB.")
    # Stream to a generated name: never trust a supplied filename or path.
    size, digest = 0, hashlib.sha256()
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=DATA / "incoming", delete=False) as stream:
            temporary = Path(stream.name)
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "El audio no puede superar 100 MiB.")
                digest.update(chunk)
                stream.write(chunk)
        if not size:
            raise HTTPException(400, "El archivo está vacío.")
        with connect() as db:
            db.execute("BEGIN IMMEDIATE")
            song = db.execute("SELECT * FROM songs WHERE id=?", (identifier,)).fetchone()
            if song and song["pending_job"]:
                pending = db.execute("SELECT status FROM jobs WHERE id=?", (song["pending_job"],)).fetchone()
                if pending and pending["status"] in ("pendiente", "procesando"):
                    raise HTTPException(409, "Esta canción ya se está procesando.")
            queued = db.execute("SELECT count(*) FROM jobs WHERE status IN ('pendiente','procesando')").fetchone()[0]
            recent = db.execute("SELECT count(*) FROM jobs WHERE owner=? AND created>?",
                                (user["sub"], time.time() - 3600)).fetchone()[0]
            if queued >= 3 or recent >= 10:
                raise HTTPException(429, "Hay varios trabajos pendientes. Intenta más tarde.")
            source = DATA / "uploads" / (digest.hexdigest() + extension)
            if not source.exists():
                temporary.replace(source)
            job = uuid.uuid4().hex
            db.execute("INSERT INTO jobs VALUES (?,?,?,?,?,?,NULL,NULL)",
                       (job, identifier, str(source), "pendiente", user["sub"], time.time()))
            db.execute("INSERT INTO songs(id,pending_job) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET pending_job=excluded.pending_job",
                       (identifier, job))
        return {"jobId": job, "state": "pendiente"}
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


@app.get("/songs/{identifier}/stems/{stem}")
def get_stem(identifier: str, stem: str, version: str, user=Depends(principal)):
    song_id(identifier)
    if stem not in STEMS:
        raise HTTPException(404, "Pista no encontrada.")
    with connect() as db:
        job = db.execute("SELECT j.* FROM songs s JOIN jobs j ON s.ready_job=j.id WHERE s.id=? AND j.id=? AND j.status='listo'",
                         (identifier, version)).fetchone()
    if not job:
        raise HTTPException(404, "Esta versión del audio ya no está disponible. Recarga la canción.")
    output = Path(job["output"]).resolve()
    if output.parent != DATA / "outputs":
        raise HTTPException(404, "Pista no encontrada.")
    manifest = json.loads((output / "manifest.json").read_text())
    if stem not in manifest["stems"]:
        raise HTTPException(404, "Esta versión no tiene ese instrumento. Vuelve a separar el original.")
    return FileResponse(output / (stem + ".wav"), media_type="audio/wav")
