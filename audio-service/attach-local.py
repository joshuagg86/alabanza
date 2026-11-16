"""Associate an already validated local result with an existing song ID; no Firebase writes."""
import argparse
import json
from pathlib import Path
import time
import uuid

import server
from separate import validate_stems


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("song_id")
    parser.add_argument("output", type=Path)
    parser.add_argument("--replace", action="store_true", help="Cambiar asociación conservando el resultado anterior")
    args = parser.parse_args()
    identifier = server.song_id(args.song_id)
    output = args.output.resolve(strict=True)
    if output.parent != server.DATA / "outputs":
        parser.error("El resultado debe estar dentro de .local/outputs")
    manifest = json.loads((output / "manifest.json").read_text())
    validate_stems(output, manifest["frames"], manifest["stems"])
    server.initialize()
    with server.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute("SELECT * FROM songs WHERE id=?", (identifier,)).fetchone()
        if existing and not args.replace:
            parser.error("La canción ya tiene un registro local; no se reemplazó.")
        if existing and existing['pending_job']:
            pending = db.execute("SELECT status FROM jobs WHERE id=?", (existing['pending_job'],)).fetchone()
            if pending and pending['status'] in ('pendiente', 'procesando'):
                parser.error("Espera a que termine el trabajo activo de esta canción.")
        job = uuid.uuid4().hex
        db.execute("INSERT INTO jobs VALUES (?,?,?,?,?,?,?,NULL)",
                   (job, identifier, "local-import", "listo", "local-import", time.time(), str(output)))
        db.execute("INSERT INTO songs VALUES (?,?,NULL) ON CONFLICT(id) DO UPDATE SET ready_job=excluded.ready_job,pending_job=NULL", (identifier, job))
    print("Audio local asociado a la canción " + identifier)


if __name__ == "__main__":
    main()
