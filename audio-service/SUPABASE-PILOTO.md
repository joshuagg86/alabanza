# Piloto privado de siete canciones

## Actualización de permisos: cuentas con correos ficticios

Las cuentas actuales usan correos sin buzón real. No se requiere verificarlos ni
se modifica su contraseña. Los permisos administrativos del audio se basan en el
UID estable del token Firebase firmado, mediante dos listas privadas:
`rehearsal_admins` en Supabase y `audio_administrators` en SQLite local.
Un usuario no puede registrarse a sí mismo en esas listas desde la web. La lista
remota tiene RLS y no concede permisos a `anon` o `authenticated`; solo la conexión
de gestión/servidor puede modificarla. Tampoco basta con presentar un correo que
coincida con un antiguo administrador.

Para registrar al propietario se confirma su cuenta, se recoge el UID de una
sesión Firebase validada localmente y se añade ese UID a ambas listas. El comando
`enroll-local-admin.py UID` solo se ejecuta desde la terminal del propietario y se
niega a registrar un UID que no haya presentado una sesión firmada válida. No hay
endpoint HTTP de autoalta de administradores. Los registros de sesión observados
solo contienen UID, correo mostrado y fecha; nunca tokens ni contraseñas.

La migración `202611160002_audio_admin_uids.sql` y la versión 2 de la función
`rehearsal-audio` aplican este control. Se retiró del mezclador el botón de
verificación de correo. Los permisos antiguos del editor/repertorio se conservan
fuera de esta funcionalidad de audio. Las dos cuentas administrativas del
propietario ya se registraron en ambas listas tras comprobar sus sesiones.

Proyecto elegido: `pkwiklslewgzcyiiyjek`. Se prepara únicamente **Dios poderoso**
(`FGb4984hkKiERz4f7g15`); las otras seis canciones las cargará el administrador
desde la misma ficha de cada canción. No hay procesamiento de IA en teléfonos.

## Estado actual

Supabase está conectado por OAuth a Codex, limitado a este proyecto. Ya se aplicó
la migración y se creó el bucket privado `ensayo-audio`, la tabla con RLS y la
función `rehearsal-audio` (versión 2). La configuración pública local está activada.
No se cambió Firebase Spark ni se activó facturación. La web de GitHub Pages no
se ha publicado ni se ha hecho push.

Se verificaron en el proyecto real los rechazos sin sesión, token falso y origen
ajeno; los permisos de clientes para leer la tabla o publicar son denegados.
También se probó el máximo de siete canciones en una transacción revertida: no
se conservaron canciones artificiales de prueba.

La subida de Dios poderoso requiere abrir la ficha con una cuenta registrada en
la lista privada de administradores por UID. Tras registrar una cuenta, pulsar
**Actualizar** en el mezclador para renovar la autorización. La cola local comienza
a subir sin volver a separar el original. Dios poderoso ya se publicó: se verificaron el registro de la canción y los seis
objetos privados, con un total de 21.635.573 bytes. La cola local marcó publicado
al primer intento.

## Arquitectura

1. Firebase conserva autenticación, letras, tonos, usuarios y repertorio.
2. El servidor Python del Mac separa el original y conserva los WAV.
3. `web_export.py` crea seis AAC/M4A estéreo a 96 kbps y 44,1 kHz. Los decodifica
   nuevamente para verificar el mismo número de muestras entre todos los canales.
4. Una cola local de publicaciones sube automáticamente los M4A a un bucket privado.
   No sube originales, WAV, modelos ni credenciales. Reintenta tres veces, sin
   ejecutar de nuevo Demucs; hay un botón administrativo para reintentar después.
5. Solo al terminar todas las cargas se cambia la referencia remota de la canción.
   La versión anterior permanece disponible durante una carga fallida.
6. Una Edge Function comprueba el token Firebase con las claves públicas de Google,
   firma, algoritmo RS256, audiencia, emisor, UID y vencimiento, y emite enlaces de
   quince minutos. No es necesario agregar custom claims ni desplegar Firebase
   Functions en Spark. No se añade un segundo inicio de sesión.
7. El mezclador obtiene las pistas desde esos enlaces. No necesita conectarse al
   Mac para reproducir una canción ya subida. La IA permanece exclusivamente local.

Supabase almacena exclusivamente metadatos de audio y su `song_id` existente;
no recibe una copia de letras, títulos o usuarios. Esta tabla de audio permite
que el endpoint firme los archivos sin credenciales administrativas de Firebase.
No se han modificado reglas de Firestore ni los permisos de edición del repertorio.

## Recursos remotos aplicados

- `supabase/migrations/202611160001_audio_pilot.sql`: bucket privado `ensayo-audio`,
  tabla `rehearsal_audio` sin permisos de cliente y RPC solo administrativa.
  Impone como máximo siete canciones distintas con bloqueo transaccional.
- `supabase/functions/rehearsal-audio/index.ts`: acceso con la sesión existente.
- `supabase/config.toml`: `verify_jwt=false` solo en esta función porque comprueba
  tokens de Firebase dentro del handler; nunca se omite su comprobación de firma.
- `supabase/deno.lock`: versiones e integridad de las dependencias.

La función admite GET/OPTIONS para reproducción y POST solo para UID administrativos autorizados y orígenes explícitos. Se debe configurar
`ALABANZA_ALLOWED_ORIGINS` con el origen HTTPS real de la web publicada más los dos
orígenes de Live Server. No usar `*`. El navegador envía el token solo al endpoint
de acceso; las pistas reciben únicamente su enlace temporal.

La función requiere los secretos de servidor estándar `SUPABASE_URL` y
`SUPABASE_SERVICE_ROLE_KEY`, normalmente proporcionados por Supabase. Los clientes
no pueden consultar ni alterar la tabla o el bucket directamente. La clave de
servicio permanece solo en el Mac y en el entorno de la función.

## Configuración del Mac y activación

La ruta recomendada **no requiere ninguna clave administrativa en el Mac**.
Después de verificar criptográficamente el token Firebase, el servidor local
solo conserva en memoria la sesión de un administrador autorizado por UID.
Esa sesión se envía a la función privada para obtener enlaces temporales de
subida. La función vuelve a comprobar los mismos permisos. Los enlaces solo
permiten subir los archivos de esa versión y no se puede publicar el manifiesto
hasta que todas las pistas estén guardadas con sus tamaños esperados.

La sesión no se guarda en SQLite, logs o archivos. Si caduca o el Mac reinicia,
se abre la web con la cuenta administradora para reanudar la publicación. Las
lecturas de integrantes nunca habilitan las subidas. `configure-cloud.py` y la
ruta de clave de servicio se conservan únicamente como alternativa técnica
anterior; no es necesario ejecutarlos ni copiar claves para esta prueba.

`start-local.command` inicia la cola de publicaciones. Las nuevas cargas se
separan, comprimen y publican automáticamente. El estado persiste en
`.local/web.sqlite3`; las copias comprimidas están en `.local/exports/`.

`rehearsal-cloud-config.js` ya contiene únicamente la URL y clave pública, con
`enabled:true`. En el Mac se conserva el audio local si hay una mezcla ya cargada;
al abrir una canción ya publicada, se comprueba el audio compartido. Si el servicio
local está apagado se consulta la nube directamente. Las referencias firmadas no
se guardan en Firestore ni en la caché PWA. La reproducción remota se permite desde
`https://joshuagg86.github.io`; el path `/alabanza/` no forma parte del encabezado
Origin del navegador.

Para que el grupo pueda usarlo desde GitHub Pages falta publicar los archivos
estáticos actualizados en el repositorio real. La copia de trabajo todavía no
contiene `.git`; no se inicializó otro repositorio ni se hizo push o despliegue
de la web. No deben publicarse `.local`, `.venv`, credenciales o archivos MP3
originales junto con los estáticos.

## Tamaño y límites

Dios poderoso: 294,405805 s, seis archivos, **21.635.573 bytes** (21,6 MB decimales).
Conserva exactamente **12.983.296 muestras** por pista tras decodificar con FFmpeg;
el manifiesto registra hashes y tamaño. Siete canciones similares serían unos
151 MB. No se promete el mismo tamaño para canciones de distinta duración.

El plan gratuito tiene 1 GB de archivos y cuotas limitadas de descarga; las
operaciones de la función y la base de datos también consumen sus propias cuotas.
Comprobar el consumo real y la posible pausa por inactividad desde el panel.
No se cambia automáticamente al plan de pago ni se eluden límites del proveedor.
Fuente: https://supabase.com/pricing

Cada publicación usa rutas inmutables por versión. Reintentar la misma versión
no vuelve a subir sus archivos si el manifiesto ya existe. Se conservan versiones
anteriores para no romper una reproducción en curso. Antes de reemplazar canciones
repetidamente hay que establecer limpieza de versiones antiguas, revisar objetos
de subidas interrumpidas y el espacio libre. El límite de siete canciones es para
la prueba, no un límite de versiones o de bytes de almacenamiento.

Los M4A pueden contener relleno final del códec; se acepta menos de 1024 muestras
si es idéntico entre todos los canales y se recorta al largo original después de
decodificar en el navegador. El transporte sigue usando un reloj compartido. No
se recortan silencios iniciales. Falta una prueba real de Safari/iPhone y de acceso
con una cuenta de integrante en la nube antes de considerar aprobado el piloto.

## Validación reproducible

```sh
audio-service/.venv/bin/python audio-service/test_cloud.py
audio-service/.venv/bin/python audio-service/test_server.py
audio-service/.venv/bin/python audio-service/test_web_pipeline.py
audio-service/.venv/bin/python audio-service/test_browser.py --cloud
python3 tests/run.py
```

La prueba Chrome `--cloud` usa los AAC reales de Dios poderoso, API/identidad
simuladas y servicio Mac desconectado. No equivale a una prueba remota real.

La prueba de Edge Function usa JWT/RSA reales con certificados y Storage simulados,
y se puede ejecutar sin acceso de red, con Deno local descargado para QA:

```sh
DENO_DIR=audio-service/.local/deno-cache audio-service/.local/tools/deno test --allow-env --lock=supabase/deno.lock supabase/functions/rehearsal-audio/index_test.ts
```

La migración se aplicó en PostgreSQL real. Se comprobaron el bucket privado, RLS,
permisos denegados a clientes y el límite de siete canciones con rollback. La
función rechaza solicitudes no autenticadas en el proyecto real. La publicación de Dios poderoso se verificó con una sesión Firebase real de un
UID autorizado, sin verificación de correo. La reproducción remota se comprueba
con el integrante desde la interfaz antes de publicar los estáticos de la web.
El asesor de seguridad solo informa que la tabla tiene RLS sin políticas: es
intencional, porque se accede exclusivamente desde el servidor y no desde clientes.
Referencia: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Archivos añadidos o modificados

Nuevos: `web_export.py`, `cloud_publish.py`, `configure-cloud.py`, `test_cloud.py`,
este documento, `rehearsal-cloud-config.js`, migración, función, prueba Deno,
`supabase/config.toml` y `supabase/deno.lock`.
Modificados: `server.py` (cola de publicaciones y estados), `test_browser.py`
(AAC y modo nube), `test_web_pipeline.py` (aislamiento de publicaciones),
`rehearsal-mixer.js`, `index.html` y `sw.js` (v27).
La carpeta no contiene `.git`: se conservan los archivos y no se ha creado otro
repositorio, hecho push, merge o despliegue.
