# Ensayo musical: procesamiento local (Etapa 2)

**Actualización:** ya existe una integración local con la ficha de canciones,
carga desde la web y mezclador. Para utilizarla consulta [WEB-LOCAL.md](WEB-LOCAL.md).
El resto de este documento describe la herramienta CLI original de la Etapa 2.

Este directorio añade una herramienta local a la web existente. No modifica el
repertorio ni utiliza Firebase, APIs de separación comerciales o infraestructura
remota. No contiene todavía el mezclador, servidor HTTP, cola ni integración con
Storage de las etapas siguientes.

## Ejecutar en este Mac

Desde la raíz del proyecto, sin activar el entorno:

```sh
audio-service/.venv/bin/python audio-service/separate.py "Dios poderoso.mp3"
```

Para otro archivo MP3 o WAV:

```sh
audio-service/.venv/bin/python audio-service/separate.py "/ruta/a/otra canción.wav"
```

La consola imprime la carpeta final. En `audio-service/.local/outputs/<jobId>/`:

| Archivo | Contenido |
| --- | --- |
| `vocals.wav` | Voz |
| `drums.wav` | Batería |
| `bass.wav` | Bajo |
| `other.wav` | Otros instrumentos |
| `manifest.json` | Modelo, versiones, hashes, muestras, duración y tiempo de ejecución |
| `worker.json` | Formato, dispositivo y ganancia común |

Las cuatro pistas son WAV PCM de 16 bits, estéreo, 44.100 Hz, con igual número
de muestras y origen temporal. Se aplica la misma ganancia a todos los canales
si algún pico requiere atenuación. No se recortan silencios por canal ni se
normaliza cada instrumento por separado. Estos WAV son la referencia para validar
la futura compresión web; no se ha validado todavía reproducción en navegador.

La sincronización estructural se verifica por formato y número de muestras.
La calidad de separación debe revisarse escuchando los instrumentos: una pista
puede contener filtraciones y una prueba sintética no demuestra calidad musical.

## Estado, errores y reutilización

El estado se guarda atómicamente en `.local/jobs/<jobId>.json`:
`validando`, `separando`, `verificando`, `listo` o `error`. Durante Demucs, la
consola muestra avance por segmentos. En esta etapa no hay una API de consulta
ni un porcentaje persistido en tiempo real.

```sh
cat audio-service/.local/jobs/<jobId>.json
```

El identificador depende del SHA-256 del original y de la receta de procesamiento
(modelo, versiones, dispositivo y parámetros). Ejecutar el mismo comando reutiliza
las pistas verificadas. Cambiar entre CPU y MPS crea un resultado independiente.
Antes de reutilizar se verifica el hash de cada WAV; una salida alterada se rechaza.
No se reemplazan silenciosamente resultados corruptos: mueve esa carpeta fuera de
`outputs` para conservarla e intenta de nuevo. Al cambiar el algoritmo debe
incrementarse `PIPELINE` en `separate.py` para invalidar la caché anterior.

Solo se permite un trabajo a la vez por directorio de datos. El bloqueo del sistema
operativo se libera al terminar el proceso; el archivo `worker.lock` puede permanecer
y no hay que borrarlo. Los fallos normales y timeouts eliminan la carpeta temporal;
las salidas se publican únicamente después de verificar las cuatro pistas. Si el
Mac se apaga o el proceso recibe SIGKILL, puede quedar un `processing-*` y el último
estado pendiente: comprueba que no hay otro procesamiento activo antes de retirarlo
y vuelve a ejecutar el comando. No hay reintentos automáticos en esta etapa.

Límites: 100 MiB, 10 minutos, 120 segundos de decodificación y 30 minutos de
separación. Puedes cambiar el último límite hasta dos horas:

```sh
audio-service/.venv/bin/python audio-service/separate.py "/ruta/canción.mp3" --timeout 3600
```

Se fuerza el decodificador MP3 o WAV según la extensión y se comprueba el contenido,
no solo el nombre. FFmpeg solo admite protocolos locales, se invoca sin shell y
decodifica como máximo 601 segundos para detectar un exceso de duración. El original
se copia al espacio temporal y se comprueba su hash antes de trabajar; no se modifica.
Esto es una herramienta local: no debe exponerse como servicio público sin los
controles de autenticación, aislamiento y cuotas de las siguientes etapas.

## Recrear el entorno

Baseline probado: macOS 26.5.1 ARM64, Python 3.9.6, Demucs 4.0.1,
PyTorch 2.0.1, torchaudio 2.0.2, NumPy 1.26.4 y FFmpeg 7.1 incluido en
`imageio-ffmpeg`. Se conserva el Python del sistema. Para producción será necesario
validar un runtime Python vigente y sus dependencias; esta combinación antigua se
utiliza exclusivamente para la prueba de compatibilidad local.

En una copia nueva, con Python 3.9 ARM64 disponible:

```sh
python3 -m venv audio-service/.venv
audio-service/.venv/bin/python -m pip install --no-cache-dir pip==25.3
audio-service/.venv/bin/python -m pip install --no-cache-dir -r audio-service/requirements-lock-macos-arm64-py39.txt
```

`requirements.txt` fija las dependencias principales y el archivo lock registra
también las transitivas instaladas. Es específico de este entorno, sin hashes
de distribución; no es todavía un lock de producción multiplataforma.

La primera ejecución descarga aproximadamente 80 MiB de pesos desde el CDN oficial
de Demucs a `.local/models/`. No se envía el audio. Las siguientes ejecuciones con
el modelo guardado funcionan sin esa descarga. El manifiesto registra el hash del
checkpoint. No uses checkpoints de procedencia desconocida.

Observación de empaquetado: `pip check` advierte que torch 2.0.1 no está soportado
en la plataforma porque el WHEEL interno declara x86_64, aunque el paquete descargado
y sus bibliotecas Mach-O son ARM64. La importación y la inferencia CPU/MPS se
comprobaron en este Mac. No se modificaron metadatos del paquete para ocultarlo.

## Apple Silicon: CPU y Metal

CPU es el valor predeterminado y utiliza cuatro threads. Se verificó también una
inferencia MPS completa sobre el audio sintético:

```sh
audio-service/.venv/bin/python audio-service/separate.py audio-service/.local/inputs/synthetic.wav --device mps
```

El sandbox de Codex informa MPS no disponible; fuera del sandbox sí está disponible.
En Terminal puede utilizarse directamente. PyTorch 2.0.1 emitió una advertencia de
conversión int64 a int32 en Metal, pero finalizó la prueba. No se cambia a CPU de
forma silenciosa: si MPS falla, vuelve a ejecutar con `--device cpu`. La prueba
breve MPS fue más lenta que la inferencia CPU; no debe suponerse que acelera una
canción completa sin medirla.

## Pruebas

```sh
audio-service/.venv/bin/python audio-service/test_local.py
python3 tests/run.py
audio-service/.venv/bin/python audio-service/generate_fixture.py
audio-service/.venv/bin/python audio-service/separate.py audio-service/.local/inputs/synthetic.wav
```

Las cinco pruebas locales cubren longitudes inconsistentes, alteración de caché,
contenido falso con extensión WAV y limpieza de temporales, exclusión de trabajos
simultáneos y límite de tamaño. La señal sintética tiene ocho segundos y prueba el
flujo con el modelo real. Repetir su separación comprueba la reutilización.

## Datos privados y Git

`.gitignore` excluye `.venv`, `.local`, cachés Python, archivos `.env` y nombres
habituales de credenciales administrativas. Las entradas, pesos y resultados
locales deben permanecer en `.local` o fuera del repositorio. La canción de prueba
`Dios poderoso.mp3` también está excluida explícitamente.

`.env.example` documenta variables opcionales; no se carga automáticamente:
`ALABANZA_AUDIO_DATA_DIR` cambia la raíz de datos y `ALABANZA_AUDIO_DEVICE` cambia
el dispositivo. Si eliges una ruta dentro del repositorio distinta de `.local`,
añádela a `.gitignore` antes de usarla.

Esta carpeta de trabajo no contiene `.git`: no se pudo crear una rama, identificar
el remoto ni contrastar cambios con GitHub. No se inicializó otro repositorio,
no hubo commit, push, merge ni despliegue. Antes de trasladar estos archivos al
checkout real crea `feature/ensayo-musical` y comprueba `git status` y
`git check-ignore` para los datos privados. `.gitignore` no elimina archivos que ya
estuvieran versionados en ese repositorio.

Archivos añadidos: `.gitignore`, este README, `.env.example`, `requirements.txt`,
`requirements-lock-macos-arm64-py39.txt`, `separate.py`, `worker.py`,
`generate_fixture.py`, `test_local.py` y `VALIDACION.md`. No se cambió código de la web,
reglas de Firestore, configuración Firebase ni archivos existentes de pruebas.
