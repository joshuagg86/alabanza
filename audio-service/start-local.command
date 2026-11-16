#!/bin/zsh
cd "${0:A:h}/.." || exit 1
exec audio-service/.venv/bin/python -m uvicorn server:app --app-dir audio-service --host 127.0.0.1 --port 8765 --no-access-log
