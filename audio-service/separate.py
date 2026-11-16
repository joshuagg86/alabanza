"""Local-only validated separation with persistent status and content reuse."""
import argparse
from datetime import datetime, timezone
import fcntl
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parent
LEGACY_STEMS = ("vocals", "drums", "bass", "other")
STEMS = ("vocals", "guitar", "bass", "piano", "drums", "other")
MAX_BYTES = 100 * 1024 * 1024
MAX_SECONDS = 600
PIPELINE = "local-htdemucs-6s-v2"


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def atomic_json(path, data):
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def validate_stems(folder, expected_frames=None, expected_hashes=None):
    import numpy as np
    import soundfile as sf
    result = {}
    frames = expected_frames
    stems = tuple(expected_hashes) if expected_hashes else STEMS
    if set(stems) not in (set(STEMS), set(LEGACY_STEMS)):
        raise ValueError("Conjunto de pistas desconocido.")
    for stem in stems:
        path = folder / (stem + ".wav")
        with sf.SoundFile(path) as stream:
            if frames is None:
                frames = stream.frames
            if (stream.frames != frames or frames <= 0 or stream.samplerate != 44100
                    or stream.channels != 2 or stream.subtype != "PCM_16"):
                raise ValueError("Formato o longitud inconsistente: " + stem)
            for block in stream.blocks(blocksize=65536):
                if not np.isfinite(block).all():
                    raise ValueError("Muestras inválidas: " + stem)
        digest = sha256(path)
        if expected_hashes and expected_hashes[stem]["sha256"] != digest:
            raise ValueError("La pista guardada fue modificada: " + stem)
        result[stem] = {"file": path.name, "sha256": digest, "bytes": path.stat().st_size}
    return result, frames


def run(args):
    source = args.source.expanduser().resolve(strict=True)
    if not source.is_file() or source.suffix.lower() not in (".mp3", ".wav"):
        raise ValueError("Selecciona un archivo MP3 o WAV local.")
    if not 0 < source.stat().st_size <= MAX_BYTES:
        raise ValueError("El archivo debe tener contenido y no superar 100 MiB.")
    data = args.data_dir.expanduser().resolve()
    data.mkdir(parents=True, exist_ok=True)
    os.environ["TORCH_HOME"] = str(data / "models")
    versions = {name: importlib.metadata.version(name) for name in
                ("demucs", "torch", "torchaudio", "numpy", "soundfile", "imageio-ffmpeg")}
    source_hash = sha256(source)
    recipe = {"pipeline": PIPELINE, "model": "htdemucs_6s", "versions": versions,
              "device": args.device, "segment": 7, "shifts": 1, "seed": 0}
    key = hashlib.sha256((source_hash + json.dumps(recipe, sort_keys=True)).encode()).hexdigest()
    jobs = data / "jobs"
    jobs.mkdir(exist_ok=True)
    output_root = data / "outputs"
    output_root.mkdir(exist_ok=True)
    output = output_root / key
    status_file = jobs / (key + ".json")
    started = time.monotonic()
    status = {"jobId": key, "sourceSha256": source_hash, **recipe}

    def update(state, **fields):
        status.update(state=state, updatedAt=datetime.now(timezone.utc).isoformat(), **fields)
        atomic_json(status_file, status)
        print(state + ": " + str(status_file), flush=True)

    # One local job at a time; OS releases lock after crashes. Lock file is retained.
    with (data / "worker.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Ya hay un procesamiento local activo. Espera a que termine.")
        try:
            if output.exists():
                manifest = json.loads((output / "manifest.json").read_text())
                validate_stems(output, manifest["frames"], manifest["stems"])
                update("listo", reused=True, output=str(output), elapsedSeconds=0)
                return output
            update("validando", reused=False)
            import imageio_ffmpeg
            import numpy as np
            import soundfile as sf
            ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
            with tempfile.TemporaryDirectory(prefix="processing-", dir=data) as temporary:
                workspace = Path(temporary)
                # Copy into a private workspace while verifying the source did not change.
                local_source = workspace / ("input" + source.suffix.lower())
                import shutil
                shutil.copyfile(source, local_source)
                if sha256(local_source) != source_hash:
                    raise ValueError("El original cambió durante la carga. Intenta nuevamente.")
                decoded = workspace / "decoded.wav"
                # Explicit demuxer rejects renamed containers; no network protocols.
                command = [ffmpeg, "-nostdin", "-v", "error", "-xerror",
                           "-protocol_whitelist", "file,pipe", "-f",
                           "mp3" if source.suffix.lower() == ".mp3" else "wav",
                           "-i", str(local_source), "-map", "0:a:0", "-vn",
                           "-t", str(MAX_SECONDS + 1), "-ac", "2", "-ar", "44100",
                           "-c:a", "pcm_f32le", str(decoded)]
                conversion = subprocess.run(command, capture_output=True, timeout=120)
                if conversion.returncode:
                    raise ValueError("No se pudo decodificar el contenido como MP3/WAV.")
                with sf.SoundFile(decoded) as stream:
                    frames = stream.frames
                    if not 0 < frames <= MAX_SECONDS * 44100:
                        raise ValueError("El audio debe durar como máximo 10 minutos.")
                    if not all(np.isfinite(b).all() for b in stream.blocks(blocksize=65536)):
                        raise ValueError("El audio contiene muestras inválidas.")
                update("separando", durationSeconds=frames / 44100)
                pending = workspace / "result"
                subprocess.run([sys.executable, str(ROOT / "worker.py"), str(decoded),
                                str(pending), "--device", args.device], check=True,
                               timeout=args.timeout)
                update("verificando")
                stems, _ = validate_stems(pending, frames)
                worker = json.loads((pending / "worker.json").read_text())
                checkpoints = {p.name: sha256(p) for p in (data / "models").rglob("*.th")}
                manifest = {**status, **worker, "state": "listo", "stems": stems,
                            "modelCheckpointsSha256": checkpoints,
                            "elapsedSeconds": round(time.monotonic() - started, 2)}
                atomic_json(pending / "manifest.json", manifest)
                pending.rename(output)
            update("listo", output=str(output), elapsedSeconds=round(time.monotonic() - started, 2))
            return output
        except BaseException as error:
            update("error", errorType=type(error).__name__, error=str(error)[:1000],
                   elapsedSeconds=round(time.monotonic() - started, 2))
            raise


def main():
    parser = argparse.ArgumentParser(description="Separación local de MP3/WAV en cuatro pistas.")
    parser.add_argument("source", type=Path)
    parser.add_argument("--data-dir", type=Path, default=Path(os.environ.get(
        "ALABANZA_AUDIO_DATA_DIR", str(ROOT / ".local"))))
    parser.add_argument("--device", choices=("cpu", "mps"),
                        default=os.environ.get("ALABANZA_AUDIO_DEVICE", "cpu"))
    parser.add_argument("--timeout", type=int, default=1800,
                        help="Tiempo máximo de separación en segundos (predeterminado: 1800)")
    args = parser.parse_args()
    if not 1 <= args.timeout <= 7200:
        parser.error("--timeout debe estar entre 1 y 7200 segundos")
    try:
        print("Resultado: " + str(run(args)))
    except (Exception, KeyboardInterrupt) as error:
        print("Error: " + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
