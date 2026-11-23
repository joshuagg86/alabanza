# Acceso a audio privado desde APK Android

El contenedor Capacitor utiliza el origen `https://localhost` en Android.

La Edge Function `rehearsal-audio` valida `Origin` contra `ALABANZA_ALLOWED_ORIGINS`. Si el origen no está autorizado, las llamadas con token de Firebase se bloquean por CORS y WebView muestra un error genérico de red.

## Pasos en el proyecto Supabase
1. Abrir el proyecto Supabase vinculado a Alabanza.
2. En **Edge Functions → Secrets**, comprobar `ALABANZA_ALLOWED_ORIGINS`.
3. Si existe, agregar `https://localhost` a los orígenes existentes, separados por comas; **no sustituir los demás**. Mantener al menos `https://joshuagg86.github.io` y los orígenes de desarrollo autorizados.
4. Desplegar de nuevo `supabase/functions/rehearsal-audio/index.ts` desde la rama `feature/android-blue-app` (o asegurar que el valor actualizado del secreto esté activo en las instancias).
5. Verificar en el Vivo con una sesión autenticada y una canción que ya tenga audio publicado.

No usar `Access-Control-Allow-Origin: *` para el servicio de audio privado. No almacenar claves de servicio, tokens Firebase ni URLs firmadas en IndexedDB.

## Limitación actual
Este cambio en GitHub no despliega automáticamente la Edge Function de Supabase. Hasta desplegarlo o ajustar el secreto del servicio, la APK puede mostrar un error de conexión al audio en la nube. Los pads públicos y las letras descargadas no requieren esta Edge Function.

## Prueba
- Con internet: abrir una canción con pistas existentes y tocar **Descargar pistas**.
- Sin internet: abrir la canción descargada y probar el mezclador.
- Verificar descarga de pads por tono desde la sección Pads y volver a reproducirlos en modo avión.
