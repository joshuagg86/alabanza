// config.js - CONEXIÓN CON PERSISTENCIA TOTAL OFFLINE
const firebaseConfig = {
  apiKey: "AIzaSyArwasq0DTEBk5qNGIU5dkC606wZJ0Rr2s",
  authDomain: "alabanza-b1d52.firebaseapp.com",
  projectId: "alabanza-b1d52",
  storageBucket: "alabanza-b1d52.firebasestorage.app",
  messagingSenderId: "96243829186",
  appId: "1:96243829186:web:7807a842b2999cdb9cae5b"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Creamos la instancia de Firestore
window.db = firebase.firestore();

// CONFIGURACIÓN DE PERSISTENCIA (Sincroniza letras y notas para uso offline)
firebase.firestore().enablePersistence({ synchronizeTabs: true })
  .then(() => {
    console.log("✅ Persistencia activada: Letras y notas disponibles offline");
  })
  .catch((err) => {
    if (err.code == 'failed-precondition') {
        // Probablemente hay varias pestañas abiertas al mismo tiempo
        console.warn("⚠️ Persistencia fallida: Múltiples pestañas abiertas.");
    } else if (err.code == 'unimplemented') {
        // El navegador no es compatible
        console.error("❌ El navegador no soporta persistencia offline.");
    }
  });

console.log("✅ Configuración cargada. Base de datos lista.");
