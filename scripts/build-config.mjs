// Membuat assets/js/firebase-config.js dari environment variable.
// Konfigurasi web Firebase bukan rahasia; yang melindungi data adalah Firestore Security Rules.
import { writeFileSync } from "node:fs";

const keys = {
  apiKey: "FIREBASE_API_KEY",
  authDomain: "FIREBASE_AUTH_DOMAIN",
  projectId: "FIREBASE_PROJECT_ID",
  storageBucket: "FIREBASE_STORAGE_BUCKET",
  messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID",
  appId: "FIREBASE_APP_ID",
};

const config = {};
const missing = [];
for (const [field, envName] of Object.entries(keys)) {
  const value = process.env[envName];
  if (!value) missing.push(envName);
  config[field] = value || "";
}

if (missing.length) {
  console.error("Environment variable belum lengkap: " + missing.join(", "));
  process.exit(1);
}

writeFileSync(
  "assets/js/firebase-config.js",
  "// File ini dibuat otomatis oleh scripts/build-config.mjs. Jangan diedit.\n" +
    "export const firebaseConfig = " + JSON.stringify(config, null, 2) + ";\n" +
    "// Kunci publik Web Push (VAPID). Kosong = notifikasi push dinonaktifkan.\n" +
    "export const vapidKey = " + JSON.stringify(process.env.FIREBASE_VAPID_KEY || "") + ";\n"
);
console.log("firebase-config.js dibuat.");
