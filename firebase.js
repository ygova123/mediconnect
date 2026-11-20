import { getApp, getApps, initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyAZdEVr7aWZXOtkzBq8klS5jAeX9pF5q4g",
  authDomain: "order-c0a7e.firebaseapp.com",
  databaseURL: "https://order-c0a7e-default-rtdb.firebaseio.com",
  projectId: "order-c0a7e",
  storageBucket: "order-c0a7e.firebasestorage.app",
  messagingSenderId: "153062125272",
  appId: "1:153062125272:web:d9912f1e7d1c751b16b1ad",
  measurementId: "G-64YB15MKVR",
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

// Analytics is optional in unsupported browsers; authentication and data do not depend on it.
export const analyticsReady = isSupported()
  .then((supported) => supported ? getAnalytics(app) : null)
  .catch((error) => {
    console.warn("Firebase Analytics is unavailable in this browser.", error);
    return null;
  });
