# Validación de la Etapa 2 — 16 de noviembre de 2026

## Confirmación inmediata de subida

El mezclador muestra «Subiendo canción… No cierres esta página» en el resumen,
cambia el botón a «Subiendo canción…» e identifica el archivo en el panel desde
que se selecciona. Bloquea nuevas subidas y Actualizar durante la transferencia;
las consultas de estado pendientes no sustituyen ese aviso. Luego continúa con
los estados existentes de separación y publicación. Caché web: v30.
Archivos modificados: rehearsal-mixer.js, sw.js, test_browser.py y este documento.
Chrome de prueba pasó en escritorio y móvil, incluyendo una subida retenida para
comprobar el aviso durante la petición y la recuperación de controles al terminar.

## Investigación de error al reproducir desde la nube

Las seis pistas privadas de Dios poderoso coinciden en tamaño y MD5 (eTag del
almacenamiento) con las exportaciones locales. Chrome de prueba reproduce las
seis exportaciones AAC y pasa pausa, desplazamiento, Mute, Solo y presets tanto
en escritorio como en móvil simulado, con identidad y descargas simuladas.
Esto no confirma todavía la reproducción en la sesión real del usuario, donde
se reportó `Unable to decode audio data`. El mezclador ahora identifica el
instrumento que falla y registra únicamente tamaño, tipo de contenido, frecuencia
y origen local/nube, sin credenciales ni enlaces firmados. Caché web: v29.
La segunda cuenta administrativa autorizada quedó registrada por UID en ambos
servicios. No se volvió a ejecutar la separación.

## Actualización: cinco instrumentos del grupo y acompañamiento

Se volvió a separar `Dios poderoso.mp3` con `htdemucs_6s`. El resultado verificado
está en `.local/outputs/f8996a4de87ab956c1fdfde63e9a0af1592c7c2c25c014151eedf0c51c5162a7/`
y quedó asociado a la ficha `FGb4984hkKiERz4f7g15`. Contiene voz, guitarra, bajo,
piano (canal Teclado), batería y otros, todos con 12.983.296 muestras por canal,
44.100 Hz, estéreo PCM16. La salida anterior y su trabajo se conservaron. El
servicio local se reinició con el modelo y API actualizados.

Pasaron seis pruebas locales (incluida compatibilidad con manifiestos antiguos),
ocho pruebas de API, la integración con cola y Demucs real de seis pistas, las
pruebas originales de lector/editor/offline y Chrome escritorio/móvil. Chrome
comprobó seis inicios con el mismo tiempo y offset, controles/presets de guitarra
y teclado, y reproducción de las versiones anteriores de cuatro pistas. Su API
e identidad son simuladas; usa Web Audio real. Falta escuchar críticamente la
calidad de guitarra/piano de la canción real, que no se deduce de la igualdad
de muestras. El modelo de piano es experimental y no garantiza separar pads o
sintetizadores. No se cambiaron datos de Firebase ni se publicó nada.

Los apartados siguientes conservan las mediciones de la primera versión de cuatro
pistas, como referencia histórica; no describen el modelo actual por defecto.

## Entorno y alcance

Mac ARM64, macOS 26.5.1, 16 GiB RAM, Python 3.9.6. Dependencias en `.venv`;
modelo en `.local/models`. Sin modificación de la web ni conexiones a Firebase.
La instalación y el CDN del modelo recibieron solicitudes de descarga; el audio
se procesó exclusivamente en el Mac.

## Canción real: Dios poderoso.mp3

- Original proporcionado por el usuario: MP3 estéreo, aproximadamente 6,7 MB.
- Duración decodificada: 294,405805 segundos (4:54,406).
- Modelo: htdemucs, Demucs 4.0.1; CPU, cuatro threads, segmento 7 s,
  overlap 0,25, shifts 1, seed 0.
- Tiempo del proceso completo: 71,65 segundos, medido con `/usr/bin/time -l`.
- Tiempo registrado en manifiesto: 71,59 segundos.
- Máximo resident set reportado: 3.011.887.104 bytes, aproximadamente 2,81 GiB.
  Es la medida informada por `time`, no una garantía de consumo futuro ni una
  medida continua de la suma de todos los procesos.
- Cuatro WAV PCM16 estéreo, 44.100 Hz y exactamente 12.983.296 muestras por canal.
- Verificadas longitud, formato, muestras finitas y SHA-256 de cada resultado.
- Segunda ejecución: `reused=true`, sin nueva inferencia.
- Sin directorios `processing-*` al finalizar.

Resultados locales (excluidos de Git):

```text
audio-service/.local/outputs/646cde12dc1439e277d702ff7ec6f0af3c7e1d89578a2d4bba7e8de095b913bd/
  vocals.wav
  drums.wav
  bass.wav
  other.wav
  manifest.json
  worker.json
```

La igualdad de muestras y origen temporal permite el futuro transporte común.
No se ha escuchado críticamente la separación ni verificado reproducción en
navegador: esas comprobaciones no se sustituyen por la validación estructural.

## Señal sintética y aceleración

Se generó una señal sintética reproducible de ocho segundos. La inferencia real
produjo las cuatro pistas tanto en CPU como en MPS, cada una con 352.800 muestras.
La prueba CPU inicial tardó 10,75 segundos, incluyendo la primera descarga de pesos;
la prueba MPS tardó 9,52 segundos con el modelo ya guardado. Estos tiempos completos
no son directamente comparables: la fase de inferencia CPU fue aproximadamente
2,6 s y la fase MPS aproximadamente 7,5 s. No se selecciona Metal por defecto.

MPS solo fue detectado fuera del sandbox de Codex. Se comprobó compilación Metal
y disponibilidad real con la ejecución autorizada. Hubo una advertencia int64/int32
de PyTorch, sin fallo de inferencia. La canción completa se procesó en CPU.

## Controles y regresiones

- Cinco pruebas en `test_local.py`: aprobadas.
- Prueba adicional con timeout real de un segundo: salida fallida, estado
  `error` con `TimeoutExpired` y limpieza de temporales comprobados.
- Reutilización de resultados comprobada con audio sintético y canción real.
- Compilación sintáctica de los cuatro scripts: aprobada usando caché local.
- Pruebas originales `python3 tests/run.py`: lector, editor y offline aprobados.
- `pip check`: advertencia de plataforma en los metadatos internos del wheel de
  torch; los binarios son ARM64 y las inferencias reales finalizaron. Se documenta
  en README, sin alterar los metadatos de terceros.

No se validaron todavía Storage, permisos de audio remotos, mezclador web,
compresión, visualización móvil ni despliegue: corresponden a etapas posteriores.

## Control de versiones

La carpeta continúa sin `.git`; no fue posible crear la rama solicitada ni comparar
con GitHub. Solo se añadieron los archivos documentados en README y datos locales
excluidos de Git. No hubo commit, push, merge, despliegue ni activación de facturación.
