import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, sendEmailVerification, updateProfile, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { cleanText } from "./utils.js";

const ERRORS = {
  "auth/invalid-email": "Format email tidak valid.",
  "auth/user-disabled": "Akun ini dinonaktifkan.",
  "auth/user-not-found": "Email atau kata sandi salah.",
  "auth/wrong-password": "Email atau kata sandi salah.",
  "auth/invalid-credential": "Email atau kata sandi salah.",
  "auth/email-already-in-use": "Email sudah terdaftar. Silakan masuk.",
  "auth/weak-password": "Kata sandi terlalu lemah.",
  "auth/too-many-requests": "Terlalu banyak percobaan. Coba lagi beberapa menit lagi.",
  "auth/network-request-failed": "Tidak ada koneksi internet. Periksa jaringan Anda.",
};

export function friendlyError(err) {
  return ERRORS[err?.code] || "Terjadi kesalahan. Silakan coba lagi.";
}

export async function registerUser({ name, email, password }) {
  const displayName = cleanText(name, 60);
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  await setDoc(doc(db, "users", cred.user.uid), {
    displayName,
    email: cred.user.email,
    familyId: null,
    approvalStatus: "pending", // wajib disetujui admin sebelum memakai aplikasi
    createdAt: serverTimestamp(),
  });
  try { await sendEmailVerification(cred.user); } catch { /* tidak memblokir pendaftaran */ }
  return cred.user;
}

export const loginUser = (email, password) => signInWithEmailAndPassword(auth, email, password);
export const logoutUser = () => signOut(auth);
export const resetPassword = (email) => sendPasswordResetEmail(auth, email);

export function waitForUser() {
  return new Promise((resolve) => {
    const off = onAuthStateChanged(auth, (user) => { off(); resolve(user); });
  });
}

export async function requireAuth() {
  const user = await waitForUser();
  if (!user) { location.replace("login.html"); return null; }
  return user;
}

export async function redirectIfAuthed() {
  const user = await waitForUser();
  if (user) location.replace("index.html");
}

export async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}
