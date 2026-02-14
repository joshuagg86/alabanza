// config.js - SOLO CONEXIÓN A FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyArwasq0DTEBk5qNGIU5dkC606wZJ0Rr2s",
  authDomain: "alabanza-b1d52.firebaseapp.com",
  projectId: "alabanza-b1d52",
  storageBucket: "alabanza-b1d52.firebasestorage.app",
  messagingSenderId: "96243829186",
  appId: "1:96243829186:web:7807a842b2999cdb9cae5b"
};

// Evitamos errores si se carga dos veces
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Creamos la variable GLOBAL 'db' para que app.js la pueda usar
window.db = firebase.firestore();
// Funcion para que las canciones se guardenen el telefono
window.db.enablePersistence().catch(err => console.error("Error persistencia:", err.code));

console.log("✅ Configuración cargada. Base de datos lista.");
