// Notifikasi push browser (Firebase Cloud Messaging). Pengiriman ke perangkat pasangan dilakukan fungsi server
// api/push.js (kredensial tidak pernah ada di browser). Fitur nonaktif otomatis bila FIREBASE_VAPID_KEY kosong.
import { app, db, auth } from "./firebase.js";
import { getMessaging, getToken, deleteToken, isSupported } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging.js";
import { doc, setDoc, deleteDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { vapidKey } from "./firebase-config.js";

const LS = "ff_push_token";
export class PushError extends Error {}

const lsGet = () => { try { return localStorage.getItem(LS); } catch { return null; } };
const lsSet = (v) => { try { v ? localStorage.setItem(LS, v) : localStorage.removeItem(LS); } catch { /* abaikan */ } };

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const tokenRef = async (ctx, token) => doc(db, "families", ctx.profile.familyId, "pushTokens", await sha256(token));

async function registration() {
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new PushError("Service worker belum siap. Muat ulang halaman lalu coba lagi.")), 8000)),
  ]);
  return reg;
}

// state: unconfigured | unsupported | denied | off | on
export async function pushState() {
  if (!vapidKey) return { state: "unconfigured" };
  const ok = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window
    && (await isSupported().catch(() => false));
  if (!ok) return { state: "unsupported" };
  if (Notification.permission === "denied") return { state: "denied" };
  return { state: Notification.permission === "granted" && lsGet() ? "on" : "off" };
}

async function fetchToken() {
  const reg = await registration();
  try { return await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg }); }
  catch { throw new PushError("Gagal mendaftarkan perangkat ke layanan push. Periksa kunci VAPID dan koneksi internet."); }
}

export async function enablePush(ctx) {
  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new PushError("Izin notifikasi tidak diberikan.");
  }
  const token = await fetchToken();
  if (!token) throw new PushError("Perangkat tidak mendapat token push.");
  await setDoc(await tokenRef(ctx, token), { token, uid: ctx.user.uid, updatedAt: serverTimestamp() }, { merge: true });
  lsSet(token);
}

export async function disablePush(ctx) {
  const token = lsGet();
  if (!token) return;
  try { await deleteDoc(await tokenRef(ctx, token)); } catch { /* sudah tidak ada */ }
  try { await deleteToken(getMessaging(app)); } catch { /* abaikan */ }
  lsSet(null);
}

// Dipanggil saat aplikasi dibuka: token FCM dapat berganti, jadi pendaftarannya diperbarui.
export async function syncPushToken(ctx) {
  try {
    if ((await pushState()).state !== "on") return;
    const old = lsGet();
    const token = await fetchToken();
    if (!token) return;
    if (old && old !== token) { try { await deleteDoc(await tokenRef(ctx, old)); } catch { /* abaikan */ } }
    await setDoc(await tokenRef(ctx, token), { token, uid: ctx.user.uid, updatedAt: serverTimestamp() }, { merge: true });
    lsSet(token);
  } catch { /* push bersifat tambahan; kegagalan tidak mengganggu aplikasi */ }
}

async function call(payload) {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new PushError("Sesi login tidak ditemukan.");
  const res = await fetch("/api/push", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` }, body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = { "server-not-configured": "Server push belum dikonfigurasi (FIREBASE_SERVICE_ACCOUNT di Vercel).",
      "too-many-requests": "Terlalu cepat. Tunggu beberapa detik." }[data.error];
    throw new PushError(msg || "Server push menolak permintaan.");
  }
  return data;
}

export async function sendTestPush() {
  const r = await call({ type: "test" });
  if (!r.sent) throw new PushError(r.reason === "no-tokens" ? "Perangkat ini belum terdaftar. Matikan lalu aktifkan lagi." : "Push tidak terkirim. Periksa konfigurasi FCM.");
  return r;
}

// Meminta server mengirim push untuk notifikasi yang baru disimpan. Gagal diam-diam: notifikasi dalam aplikasi tetap ada.
export async function sendPush(ctx, notificationId) {
  try {
    if (!vapidKey || !navigator.onLine) return;
    await call({ notificationId });
  } catch { /* abaikan */ }
}
