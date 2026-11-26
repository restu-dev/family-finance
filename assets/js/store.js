// Penyimpan data bersama (real-time dari Firestore). Semua halaman membaca dari sini,
// sehingga angka di dashboard, laporan, anggaran, dan tabungan selalu berasal dari ledger yang sama.
import { db } from "./firebase.js";
import {
  collection, doc, onSnapshot, query, orderBy, limit, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { toast } from "./ui.js";

export const DEFAULT_INCOME = [
  ["inc_gaji_suami", "Gaji suami"], ["inc_gaji_istri", "Gaji istri"], ["inc_bonus", "Bonus"],
  ["inc_usaha", "Usaha"], ["inc_freelance", "Freelance"], ["inc_lainnya", "Pendapatan lainnya"],
];
export const DEFAULT_EXPENSE = [
  ["exp_dapur", "Belanja dapur"], ["exp_bulanan", "Belanja bulanan"], ["exp_listrik_air", "Listrik dan air"],
  ["exp_internet", "Internet"], ["exp_pendidikan", "Pendidikan anak"], ["exp_transport", "Transportasi"],
  ["exp_kesehatan", "Kesehatan"], ["exp_cicilan", "Cicilan"], ["exp_hiburan", "Hiburan"],
  ["exp_pribadi", "Kebutuhan pribadi"], ["exp_sedekah", "Sedekah"], ["exp_lain", "Lain-lain"],
];

const KEYS = ["family", "members", "categories", "ledger", "budgets", "alerts", "goals", "notifications"];
export const state = freshState();
const listeners = new Set();
let unsubs = [];
let readyPromise = Promise.resolve();

function freshState() {
  return { family: null, members: [], categories: [], ledger: [], budgets: [], alerts: new Set(),
    goals: [], notifications: [], error: null, ready: false };
}
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const emit = () => listeners.forEach((fn) => fn(state));
export function whenReady() { return readyPromise; }

export function stopStore() {
  unsubs.forEach((u) => u());
  unsubs = [];
  Object.assign(state, freshState());
}

export const catName = (id) => state.categories.find((c) => c.id === id)?.name || "(kategori dihapus)";
// Nama pencatat diambil dari data anggota saat ini, sehingga ganti nama ikut berlaku pada transaksi lama.
export const personName = (uid, fallback) => state.members.find((m) => m.uid === uid)?.displayName || fallback || "";
export const goalName = (id) => state.goals.find((g) => g.id === id)?.name || "(pos dihapus)";

function partnerToastEnabled() {
  try { return localStorage.getItem("ff_toast_partner") !== "off"; } catch { return true; }
}

export function startStore(ctx) {
  stopStore();
  const familyId = ctx.profile.familyId;
  const me = ctx.user.uid;
  let resolveReady;
  readyPromise = new Promise((r) => { resolveReady = r; });
  const loaded = new Set();
  let seeded = false;

  const markReady = () => { if (!state.ready) { state.ready = true; resolveReady(); } };
  const mark = (key) => { loaded.add(key); if (loaded.size === KEYS.length) markReady(); emit(); };
  const onError = (err) => { state.error = err; markReady(); emit(); };
  const col = (name) => collection(db, "families", familyId, name);
  const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const watch = (key, ref, apply) => unsubs.push(onSnapshot(ref, (snap) => { apply(snap); mark(key); }, onError));

  watch("family", doc(db, "families", familyId), (s) => { state.family = s.exists() ? { id: s.id, ...s.data() } : null; });
  watch("members", col("members"), (s) => {
    state.members = s.docs.map((d) => d.data()).sort((a, b) => (a.role === "owner" ? -1 : 1) - (b.role === "owner" ? -1 : 1));
  });
  watch("categories", col("categories"), (s) => {
    state.categories = docs(s);
    // Owner mengisi kategori bawaan sekali, hanya setelah data server terbukti kosong.
    if (!seeded && s.empty && !s.metadata.fromCache && ctx.family?.ownerUid === me) {
      seeded = true;
      seedCategories(familyId).catch(() => { seeded = false; });
    }
  });
  watch("ledger", col("ledger"), (s) => { state.ledger = docs(s); });
  watch("budgets", col("budgets"), (s) => { state.budgets = docs(s); });
  watch("alerts", col("budgetAlerts"), (s) => { state.alerts = new Set(s.docs.map((d) => d.id)); });
  watch("goals", col("savingsGoals"), (s) => { state.goals = docs(s); });

  let firstNotif = true;
  unsubs.push(onSnapshot(query(col("notifications"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
    state.notifications = docs(snap);
    if (!firstNotif && partnerToastEnabled()) {
      snap.docChanges().forEach((c) => {
        const n = c.doc.data();
        if (c.type === "added" && !c.doc.metadata.hasPendingWrites && n.actorUid !== me) toast(n.message, "info");
      });
    }
    firstNotif = false;
    mark("notifications");
  }, onError));
}

async function seedCategories(familyId) {
  const batch = writeBatch(db);
  const add = (type, [id, name]) => batch.set(doc(db, "families", familyId, "categories", id), {
    type, name, isActive: true, isDefault: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  DEFAULT_INCOME.forEach((c) => add("income", c));
  DEFAULT_EXPENSE.forEach((c) => add("expense", c));
  await batch.commit();
}
