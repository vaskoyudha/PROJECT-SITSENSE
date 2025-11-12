(function initSitSenseFirebase() {
  if (window.__SITSENSE_FIREBASE_READY__) {
    return;
  }

  const defaultConfig = {
    apiKey: "AIzaSyCHpITmPUoKIb2niuh0G4vhJJJ0vBM2ijE",
    authDomain: "esp32kursi-pintar.firebaseapp.com",
    databaseURL: "https://esp32kursi-pintar-default-rtdb.firebaseio.com",
    projectId: "esp32kursi-pintar",
    storageBucket: "esp32kursi-pintar.appspot.com",
    messagingSenderId: "265798521874",
    appId: "1:265798521874:web:6097e5ae6ccf8ad683b4cb"
  };

  const config = window.FIREBASE_CONFIG || defaultConfig;

  if (typeof firebase === 'undefined') {
    console.warn('[FirebaseConfig] Firebase SDK belum dimuat.');
    return;
  }

  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(config);
    }

    window.firebaseAuth = window.firebaseAuth || firebase.auth();
    if (typeof firebase.database === 'function') {
      window.firebaseDb = window.firebaseDb || firebase.database();
    }

    window.FIREBASE_CONFIG = config;
    window.BACKEND_ENDPOINT = window.BACKEND_ENDPOINT || null;
    window.__SITSENSE_FIREBASE_READY__ = true;
  } catch (error) {
    console.error('[FirebaseConfig] Gagal inisialisasi Firebase:', error);
  }
})();

