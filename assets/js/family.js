import { db } from "./firebase.js";
import {
  doc, collection, writeBatch, getDoc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { cleanText, generateInviteCode, normalizeInviteCode } from "./utils.js";

export class FamilyError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function requireOnline() {
  if (!navigator.onLine) {
    throw new FamilyError("offline", "Tidak ada koneksi internet. Sambungkan dulu, lalu coba lagi.");
  }
}

export function familyErrorMessage(err, action) {
  if (err instanceof FamilyError) return err.message;
  if (err?.code === "permission-denied") {
    return action === "join"
      ? "Kode undangan tidak dapat dipakai. Kode mungkin sudah digunakan atau keluarga sudah berisi dua anggota."
      : "Aksi ditolak. Pastikan Anda belum tergabung di keluarga lain.";
  }
  if (err?.code === "unavailable") return "Server tidak dapat dihubungi. Coba lagi sebentar lagi.";
  return "Terjadi kesalahan. Silakan coba lagi.";
}

// Membuat keluarga: satu batch atomis (keluarga, anggota owner, undangan, tautan di profil).
export async function createFamily({ uid, displayName, name }) {
  requireOnline();
  const familyName = cleanText(name, 60);
  if (familyName.length < 2) throw new FamilyError("invalid-name", "Nama keluarga minimal 2 karakter.");

  const familyRef = doc(collection(db, "families"));
  const familyId = familyRef.id;
  const code = generateInviteCode();

  const batch = writeBatch(db);
  batch.set(familyRef, {
    name: familyName, currency: "IDR", timezone: "Asia/Jakarta",
    ownerUid: uid, inviteCode: code, memberCount: 1, partnerUid: null, createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "families", familyId, "members", uid), {
    uid, displayName, role: "owner", status: "active", joinedAt: serverTimestamp(),
  });
  batch.set(doc(db, "invites", code), {
    familyId, active: true, createdBy: uid, createdAt: serverTimestamp(),
  });
  batch.update(doc(db, "users", uid), { familyId });
  await batch.commit();
  return familyId;
}

// Bergabung dengan kode undangan: satu batch atomis. Security Rules membatasi maksimal 2 anggota.
export async function joinFamily({ uid, displayName, codeInput }) {
  requireOnline();
  const code = normalizeInviteCode(codeInput);
  if (code.length !== 8) throw new FamilyError("invalid-code", "Kode undangan terdiri dari 8 karakter.");

  const inviteRef = doc(db, "invites", code);
  const invite = await getDoc(inviteRef);
  if (!invite.exists() || invite.data().active !== true) {
    throw new FamilyError("invite-unusable", "Kode undangan tidak ditemukan atau sudah tidak berlaku.");
  }
  const familyId = invite.data().familyId;

  const batch = writeBatch(db);
  batch.set(doc(db, "families", familyId, "members", uid), {
    uid, displayName, role: "member", status: "active", joinedAt: serverTimestamp(), inviteCode: code,
  });
  batch.update(doc(db, "families", familyId), { memberCount: 2, partnerUid: uid });
  batch.update(inviteRef, { active: false, usedBy: uid });
  batch.update(doc(db, "users", uid), { familyId });
  await batch.commit();
  return familyId;
}

// Owner membuat kode baru; kode lama dinonaktifkan.
export async function regenerateInvite({ uid, familyId, oldCode }) {
  requireOnline();
  const code = generateInviteCode();
  const batch = writeBatch(db);
  batch.update(doc(db, "families", familyId), { inviteCode: code });
  batch.set(doc(db, "invites", code), {
    familyId, active: true, createdBy: uid, createdAt: serverTimestamp(),
  });
  if (oldCode) batch.update(doc(db, "invites", oldCode), { active: false });
  await batch.commit();
  return code;
}

export async function getFamily(familyId) {
  try {
    const snap = await getDoc(doc(db, "families", familyId));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch { return null; }
}

// Langganan real-time: data keluarga + daftar anggota. Mengembalikan fungsi untuk berhenti.
export function watchFamily(familyId, callback) {
  let family; let members;
  const emit = () => { if (family !== undefined && members !== undefined) callback({ ok: true, family, members }); };
  const fail = (error) => callback({ ok: false, error });
  const stopFamily = onSnapshot(doc(db, "families", familyId), (s) => {
    family = s.exists() ? { id: s.id, ...s.data() } : null; emit();
  }, fail);
  const stopMembers = onSnapshot(collection(db, "families", familyId, "members"), (s) => {
    members = s.docs.map((d) => d.data())
      .sort((a, b) => (a.role === "owner" ? -1 : 1) - (b.role === "owner" ? -1 : 1));
    emit();
  }, fail);
  return () => { stopFamily(); stopMembers(); };
}
