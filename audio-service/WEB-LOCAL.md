# Audio dentro de cada canción

Para la prueba de reproducción compartida y subida automática a Supabase, consulta
[SUPABASE-PILOTO.md](SUPABASE-PILOTO.md). El acceso remoto permanece desactivado
hasta conectar el proyecto y verificar sus recursos privados.

## Instrumentos del grupo (actualización)

Las nuevas cargas usan `htdemucs_6s`: Voz, Guitarra, Bajo, Teclado (piano),
Batería y un canal residual Otros. Hay presets para quitar o destacar también
guitarra y teclado. Otros conserva el acompañamiento que no entra en las cinco
categorías principales, incluidos posibles pads y sintetizadores. El modelo
separa piano, no cualquier tipo de teclado, y esa fuente es experimental y puede
tener filtraciones. Fuente: https://github.com/facebookresearch/demucs#readme

Las canciones anteriores con cuatro pistas siguen funcionando; guitarra y teclado
permanecen ocultos hasta volver a separar el original. Los manifiestos indican las
pistas disponibles. La nueva receta tiene otra clave de caché: no reutiliza por
error la separación antigua. El transporte mantiene todas las pistas sincronizadas.

Para cambiar una asociación local tras validar el nuevo resultado se puede añadir
`--replace` a `attach-local.py`. Se conserva el trabajo y la carpeta anteriores,
y se rechaza el cambio si hay un procesamiento activo de esa canción.

Se necesitan aproximadamente 606 MiB de buffers para seis pistas estéreo de cinco
minutos a 44,1 kHz (más a 48 kHz), frente a unos 404 MiB con cuatro pistas. Las
pistas se siguen descargando únicamente al pulsar reproducir. Las referencias a
cuatro pistas del resto de este documento describen la versión inicial.

Esta integración conserva el repertorio, las letras, usuarios y datos de Firebase.
Los audios y sus asociaciones se guardan solo en el Mac, en `.local/web.sqlite3`,
`.local/uploads` y `.local/outputs`. No se ha activado Storage ni desplegado un servidor.

## Verlo ahora

1. Abre la web con Live Server en `http://127.0.0.1:5500` o `http://localhost:5500`.
2. Inicia el procesador si no está activo. Puedes abrir `start-local.command` con
   doble clic desde Finder o ejecutar desde la raíz:

   ```sh
   ./audio-service/start-local.command
   ```

3. Entra con tu cuenta habitual y abre una canción. Debajo de los controles de
   lectura aparecerá **Audio de ensayo**. Pulsa **Ensayar**.
4. Un administrador puede pulsar **Subir y separar**, seleccionar MP3/WAV y esperar.
   El proceso continúa aunque cierre el panel o navegue a otra canción. Cuando
   termina aparece **Cuatro pistas listas**. La carga admite hasta 100 MiB y el
   audio hasta 10 minutos.
5. Pulsa **Cargar y reproducir**: se descargan las cuatro pistas locales y después
   se reproducen juntas. No se descargan pistas de otras canciones.

Se añadió `.vscode/settings.json` para que Live Server ignore los archivos del
procesador y no recargue la página al escribir estados, SQLite, logs o pistas.
Reinicia Live Server una vez si la extensión no aplica el cambio en caliente.

Ya está asociado el resultado existente de «Dios poderoso» con el ID de la captura:
`FGb4984hkKiERz4f7g15`. Solo se añadió una asociación en SQLite local; no se escribió
en Firestore. Para asociar otro resultado previamente generado:

```sh
audio-service/.venv/bin/python audio-service/attach-local.py ID_CANCION audio-service/.local/outputs/HASH_RESULTADO
```

El comando se niega a sustituir una asociación existente. La interfaz permite
reemplazarla mediante una nueva carga administrativa. La versión anterior sigue
disponible hasta verificar correctamente la nueva; si falla, se conserva.

## Controles

Volumen, Silenciar y Solo por canal; pausa, reproducción, barra de posición,
saltos de diez segundos, duración y restablecimiento. Los presets permiten quitar
o destacar voz, batería o bajo, además de mezcla completa y personalizada.

El motor utiliza un único AudioContext. Programa cuatro AudioBufferSourceNode
con el mismo instante y desplazamiento; al buscar o reanudar recrea las fuentes
con una posición común. Se valida que las cuatro pistas decodificadas tengan
idéntica longitud y frecuencia. No se utilizan cuatro reproductores HTML separados.
No hay cambio de velocidad ni tonalidad del audio en esta versión.

Cerrar el panel conserva la reproducción; salir de la canción o de la sesión la
detiene, cancela descargas y libera buffers. En móvil el panel ocupa como máximo
el 48% de la altura, con desplazamiento propio para acceder a los canales; arriba
permanece la letra. Los botones flotantes se ocultan mientras el mezclador está
abierto para no tapar controles y vuelven al cerrarlo.

## Autenticación y alcance

El backend verifica criptográficamente el ID token de Firebase, vencimiento,
audiencia `alabanza-b1d52`, emisor y UID. Usa certificados públicos de Google,
con caché en memoria; no necesita una clave administrativa. Hace falta Internet
para iniciar sesión y obtener/renovar los certificados. La API nunca acepta un
perfil de usuario enviado por el frontend como prueba de autorización.

Las lecturas requieren sesión válida, siguiendo el permiso actual del repertorio.
Las cargas requieren uno de los tres correos administrativos de `permissions.js`,
comprobados también en servidor, y correo verificado. El botón **Verificar mi
correo** solicita el mensaje; abre el enlace y vuelve a iniciar sesión. El campo
instrumental `usuarios.rol` no concede permisos administrativos. Los cambios de
la lista administrativa deben mantenerse coherentes en frontend y servidor.

Esta comprobación de ID token no consulta revocaciones o cuentas deshabilitadas
en cada petición: un token emitido puede seguir válido hasta expirar. Antes de
publicar se añadirá la verificación administrativa de sesión y membresía del
grupo, con la identidad del servidor y las reglas de Storage correspondientes.
No hay todavía restricción por integrante aprobado, ya que tampoco existe en el
modelo actual del repertorio.

El servicio escucha exclusivamente en `127.0.0.1:8765`, permite los dos orígenes
locales de Live Server y valida el Host. Los uploads usan nombres generados y
se validan por el decodificador antes de publicar resultados. La cola SQLite
persiste tras reinicios, limita a tres trabajos activos/en espera y diez cargas
por usuario y hora. Solo procesa un trabajo simultáneo. Una solicitud repetida
durante el procesamiento recibe 409. Los detalles de ejecución están en logs
locales y no se entregan al navegador. Las respuestas y pistas llevan `no-store`;
el service worker excluye peticiones autenticadas y el puerto del procesador.

No se han añadido eliminaciones de audio desde la interfaz en este avance.
Tampoco se hace limpieza automática de versiones históricas: evita cargar
muchas canciones hasta definir retención. Los WAV sin comprimir permiten
comprobar sincronización, pero pueden ocupar bastante memoria: una canción de
cinco minutos necesita aproximadamente 404 MiB de buffers estéreo a 44,1 kHz
(más si AudioContext remuestrea a 48 kHz). La compresión y la optimización para
conexiones moderadas siguen pendientes antes de compartir en producción.

## Compartir con otros músicos

Ahora los integrantes con sesión pueden escuchar desde la web de este Mac.
En otro equipo o celular, `127.0.0.1` apunta a ese otro dispositivo y no puede
acceder a los audios del Mac. La versión publicada muestra que es una prueba
local; no intenta conectar a un servicio local del visitante.

Para compartir de forma permanente faltan Storage (o almacenamiento autorizado
equivalente), referencias protegidas en Firestore y un backend accesible. Esta
parte requiere confirmar facturación y despliegue. No cambies el servidor a
`0.0.0.0` ni lo expongas por un túnel para simular una instalación de producción.

## Reinstalar y probar

```sh
audio-service/.venv/bin/python -m pip install --no-cache-dir -r audio-service/requirements-web-lock-macos-arm64-py39.txt
audio-service/.venv/bin/python audio-service/test_server.py
audio-service/.venv/bin/python audio-service/test_web_pipeline.py
audio-service/.venv/bin/python audio-service/test_local.py
python3 tests/run.py
```

La prueba de pipeline usa un directorio temporal aislado y el checkpoint local;
no modifica la asociación de la canción real ni llama a Firebase con usuarios
reales. Ejecuta upload, cola y Demucs reales y descarga los cuatro resultados.

Opcionalmente, con Chrome instalado y Live Server encendido:

```sh
audio-service/.venv/bin/python -m pip install playwright==1.51.0
audio-service/.venv/bin/python audio-service/test_browser.py
```

Chrome se abre con un perfil aislado. La prueba usa el HTML/CSS y mezclador reales,
audio sintético, identidad/API simuladas; no usa la sesión del usuario. Verifica
escritorio, móvil, controles, cargas y que los cuatro inicios compartan exactamente
tiempo y offset. Guarda capturas en `.local/mixer-desktop.png` y `.local/mixer-mobile.png`.
Las pruebas API incluyen firma RSA real con certificados de prueba, rechazo de
audiencia/emisor incorrectos, expiración, firma manipulada, permisos, origen,
tamaño, tipo, duplicados y temporales. No sustituyen la prueba manual con la
cuenta Firebase real ni una prueba en Safari o un teléfono físico.

Se conserva el Python 3.9 de la etapa anterior. Requests descarga correctamente
los certificados en este Mac, aunque urllib3 advierte que su TLS LibreSSL no es
una combinación soportada; junto con el aviso del wheel de PyTorch, esto queda
como limitación del entorno local. Antes de nube se migrará a Python vigente con
OpenSSL y dependencias actuales, sin modificar el Python del sistema.

## Archivos de esta integración

Nuevos: `audio-engine.js`, `rehearsal-mixer.js`, `rehearsal-mixer.css`,
`audio-service/server.py`, `start-local.command`, `attach-local.py`,
`requirements-web.txt`, `requirements-web-lock-macos-arm64-py39.txt`,
`test_server.py`, `test_web_pipeline.py`, `test_browser.py` y este documento.
También `.vscode/settings.json` para excluir el procesamiento del live reload.

Modificados: `index.html` (interfaz/scripts), `index-app.js` (ciclo de vida del
mezclador) y `sw.js` (nuevos recursos, v25 y exclusión de audio privado).
No se cambiaron las reglas de Firestore, `config.js`, letras, usuarios ni hosting.
La carpeta sigue sin `.git`: no fue posible crear rama ni comparar con GitHub.
No se hizo push, merge, despliegue ni se activó facturación.
