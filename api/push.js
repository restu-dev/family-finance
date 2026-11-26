// Fungsi server Vercel (gratis di paket Hobby) untuk mengirim push ke pasangan lewat Firebase Cloud Messaging.
// Berjalan dengan kredensial akun layanan (FIREBASE_SERVICE_ACCOUNT) yang HANYA ada di environment variable Vercel.
// Pemanggil harus membawa ID token Firebase yang valid dan menjadi anggota aktif keluarga.
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

function init() {
  if (getApps().length) return;
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}

const lastTest = new Map(); // pembatas sederhana untuk tombol tes (per instance)

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(500).json({ error: "server-not-configured" });

  try {
    init();
    const idToken = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!idToken) return res.status(401).json({ error: "unauthenticated" });
    const { uid } = await getAuth().verifyIdToken(idToken).catch(() => ({}));
    if (!uid) return res.status(401).json({ error: "unauthenticated" });

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const db = getFirestore();

    // Pemanggil harus anggota aktif keluarganya.
    const familyId = (await db.doc(`users/${uid}`).get()).get("familyId");
    if (!familyId) return res.status(403).json({ error: "no-family" });
    const me = await db.doc(`families/${familyId}/members/${uid}`).get();
    if (!me.exists || me.get("status") !== "active") return res.status(403).json({ error: "not-a-member" });

    const memberIds = (await db.collection(`families/${familyId}/members`).get()).docs
      .filter((d) => d.get("status") === "active").map((d) => d.id);

    let text, targets;
    if (body.type === "test") {
      const now = Date.now();
      if (now - (lastTest.get(uid) || 0) < 10000) return res.status(429).json({ error: "too-many-requests" });
      lastTest.set(uid, now);
      text = "Notifikasi tes berhasil. Push aktif di perangkat ini.";
      targets = [uid];
    } else {
      // Isi push diambil dari dokumen notifikasi yang sudah tersimpan (bukan teks bebas dari klien),
      // hanya untuk notifikasi buatan pemanggil yang masih baru dan belum pernah dikirim.
      const id = String(body.notificationId || "");
      if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return res.status(400).json({ error: "bad-request" });
      const ref = db.doc(`families/${familyId}/notifications/${id}`);
      const data = await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (!s.exists) return null;
        const d = s.data();
        const created = d.createdAt?.toMillis?.();
        if (d.actorUid !== uid || d.pushedAt || !created || Date.now() - created > 5 * 60 * 1000) return null;
        tx.update(ref, { pushedAt: FieldValue.serverTimestamp() });
        return d;
      });
      if (!data) return res.status(200).json({ sent: 0, skipped: true });
      text = data.message;
      targets = memberIds.filter((m) => m !== uid);
    }

    const tokenDocs = (await db.collection(`families/${familyId}/pushTokens`).get()).docs
      .filter((d) => targets.includes(d.get("uid")) && memberIds.includes(d.get("uid")));
    if (!tokenDocs.length) return res.status(200).json({ sent: 0, reason: "no-tokens" });

    let sent = 0, failed = 0;
    await Promise.all(tokenDocs.map(async (d) => {
      try {
        await getMessaging().send({
          token: d.get("token"),
          data: { title: "Family Finance", body: String(text).slice(0, 300), url: "./index.html#notifikasi" },
          webpush: { headers: { Urgency: "high", TTL: "86400" } },
        });
        sent++;
      } catch (err) {
        failed++;
        if (["messaging/registration-token-not-registered", "messaging/invalid-registration-token"].includes(err.code)) {
          await d.ref.delete().catch(() => {}); // token kedaluwarsa
        }
      }
    }));
    return res.status(200).json({ sent, failed });
  } catch (err) {
    console.error("push error", err?.code || err?.message);
    return res.status(500).json({ error: "server-error" });
  }
}
