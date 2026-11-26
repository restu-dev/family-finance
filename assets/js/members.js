// Pengelolaan anggota: ganti nama, keluar dari keluarga, mengeluarkan pasangan, dan pemulihan keanggotaan.
import { db, auth } from "./firebase.js";
import { doc, writeBatch, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { sideDocs, commitBatch, LedgerError } from "./ledger.js";
import { state } from "./store.js";
import { cleanText } from "./utils.js";

function requireOnline() {
  if (!navigator.onLine) throw new LedgerError("Sedang offline. Perubahan hanya dapat disimpan saat online.");
}

// Nama pengguna disimpan di profil dan di data anggota keluarga; keduanya diubah dalam satu batch.
export async function renameUser(ctx, newName) {
  requireOnline();
  const name = cleanText(newName, 60);
  if (name.length < 2) throw new LedgerError("Nama minimal 2 karakter.");
  const old = ctx.profile.displayName;
  if (name === old) return;
  const { uid, profile } = { uid: ctx.user.uid, profile: ctx.profile };
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid), { displayName: name });
  if (profile.familyId) {
    batch.update(doc(db, "families", profile.familyId, "members", uid), { displayName: name });
    sideDocs(batch, ctx, {
      action: "update", entityType: "member", entityId: uid, summary: `${old} mengganti nama menjadi ${name}.`,
      before: { displayName: old }, after: { displayName: name }, message: `${old} mengganti nama menjadi ${name}.`,
    });
  }
  await commitBatch(ctx, batch);
  try { await updateProfile(auth.currentUser, { displayName: name }); } catch { /* profil Auth hanya tampilan */ }
  ctx.profile.displayName = name;
}

// Anggota (bukan pemilik) keluar dari keluarga. Transaksi yang pernah dicatat tetap ada di keluarga.
export async function leaveFamily(ctx) {
  requireOnline();
  const uid = ctx.user.uid, fam = state.family, fid = ctx.profile.familyId;
  if (!fam) throw new LedgerError("Data keluarga belum dimuat.");
  if (fam.ownerUid === uid) throw new LedgerError("Pemilik keluarga tidak dapat keluar pada versi ini.");
  if (fam.memberCount !== 2 || fam.partnerUid !== uid) throw new LedgerError("Data keluarga belum sinkron. Muat ulang halaman lalu coba lagi.");
  const name = ctx.profile.displayName;
  const batch = writeBatch(db);
  batch.delete(doc(db, "families", fid, "members", uid));
  batch.update(doc(db, "families", fid), { memberCount: 1, partnerUid: null });
  batch.update(doc(db, "users", uid), { familyId: null });
  sideDocs(batch, ctx, {
    action: "delete", entityType: "member", entityId: uid, summary: `${name} keluar dari keluarga.`,
    before: { displayName: name, role: "member" }, message: `${name} keluar dari keluarga.`,
  });
  delete batch.__notifId; // pemanggil bukan anggota lagi setelah komit, jadi server menolak push; notifikasi dalam aplikasi tetap tersimpan
  await commitBatch(ctx, batch);
}

// Pemilik mengeluarkan pasangan. Akses pasangan berhenti seketika; data keuangan tetap utuh.
export async function removePartner(ctx, partnerUid) {
  requireOnline();
  const uid = ctx.user.uid, fam = state.family, fid = ctx.profile.familyId;
  if (!fam || fam.ownerUid !== uid) throw new LedgerError("Hanya pemilik keluarga yang dapat mengeluarkan anggota.");
  const partner = state.members.find((m) => m.uid === partnerUid && m.role === "member");
  if (!partner) throw new LedgerError("Anggota tidak ditemukan.");
  if (fam.partnerUid !== partnerUid || fam.memberCount !== 2) throw new LedgerError("Data keluarga belum sinkron. Muat ulang halaman lalu coba lagi.");
  const batch = writeBatch(db);
  batch.delete(doc(db, "families", fid, "members", partnerUid));
  batch.update(doc(db, "families", fid), { memberCount: 1, partnerUid: null });
  sideDocs(batch, ctx, {
    action: "delete", entityType: "member", entityId: partnerUid,
    summary: `${ctx.profile.displayName} mengeluarkan ${partner.displayName} dari keluarga.`,
    before: { displayName: partner.displayName, role: "member" },
  });
  await commitBatch(ctx, batch);
}

// Keluarga yang dibuat sebelum ada field partnerUid: lengkapi sekali agar keluar/keluarkan dapat berjalan.
export async function backfillPartner(ctx) {
  const fam = state.family;
  if (!fam || fam.memberCount !== 2 || fam.partnerUid) return;
  const p = state.members.find((m) => m.role === "member");
  if (!p) return;
  await updateDoc(doc(db, "families", fam.id), { partnerUid: p.uid }).catch(() => {});
}

// Jika pengguna sudah tidak tercatat sebagai anggota (dikeluarkan pemilik), kosongkan tautan keluarga di profilnya.
// Mengembalikan true bila pemulihan dilakukan.
export async function healMembership(uid, familyId) {
  try {
    const m = await getDoc(doc(db, "families", familyId, "members", uid));
    if (m.exists()) return false;
    await updateDoc(doc(db, "users", uid), { familyId: null });
    return true;
  } catch { return false; }
}
