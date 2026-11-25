// Lapisan penulisan data. Semua operasi bersifat atomis (writeBatch): entri ledger + log audit + notifikasi
// ditulis dalam satu komit. Validasi di sini hanya untuk pengalaman pengguna; keamanan ditegakkan Security Rules.
import { db } from "./firebase.js";
import {
  doc, collection, writeBatch, serverTimestamp, getDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { state, catName, goalName } from "./store.js";
import { formatRupiah, cleanText, isValidDateStr, todayJakarta, monthLabel, monthStart, monthEnd } from "./utils.js";
import {
  mainBalanceThrough, savingsBalances, periodTotals, alertDecision, alertKey, deletionProblem, budgetStatus,
} from "./balance.js";

export const PAYMENT_METHODS = ["Cash", "Transfer bank", "E-wallet", "Kartu debit", "Lainnya"];
export const TYPE_LABEL = {
  income: "Pemasukan", expense: "Pengeluaran", savings_deposit: "Tabungan masuk",
  savings_withdraw: "Tabungan keluar", savings_transfer: "Transfer tabungan", opening_balance: "Saldo awal",
};

export class LedgerError extends Error {}

export function ledgerErrorMessage(err) {
  if (err instanceof LedgerError) return err.message;
  if (err?.code === "permission-denied") return "Perubahan ditolak oleh aturan keamanan. Periksa data yang diisi, lalu coba lagi.";
  if (err?.code === "unavailable") return "Server tidak dapat dihubungi. Coba lagi sebentar lagi.";
  return "Terjadi kesalahan. Silakan coba lagi.";
}

function requireOnline() {
  if (!navigator.onLine) throw new LedgerError("Sedang offline. Perubahan hanya dapat disimpan saat online.");
}
const col = (ctx, name) => collection(db, "families", ctx.profile.familyId, name);
const me = (ctx) => ({ uid: ctx.user.uid, name: ctx.profile.displayName });

const SNAP_FIELDS = ["type", "date", "name", "categoryId", "amount", "paymentMethod", "description", "savingsId", "toSavingsId", "status"];
const snap = (e) => Object.fromEntries(SNAP_FIELDS.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));

// Log audit + notifikasi untuk pasangan, ditambahkan ke batch yang sama dengan operasi utamanya.
function sideDocs(batch, ctx, { action, entityType, entityId, summary, before = null, after = null, message = null, type = "activity" }) {
  const { uid, name } = me(ctx);
  batch.set(doc(col(ctx, "activityLogs")), {
    action, entityType, entityId, summary: cleanText(summary, 300), before, after,
    actorUid: uid, actorName: name, createdAt: serverTimestamp(),
  });
  if (message) {
    batch.set(doc(col(ctx, "notifications")), {
      type, message: cleanText(message, 300), actorUid: uid, actorName: name,
      readBy: { [uid]: true }, createdAt: serverTimestamp(),
    });
  }
}

function describe(ctx, e, verb) {
  const who = ctx.profile.displayName, rp = formatRupiah(e.amount);
  if (verb === "create") {
    switch (e.type) {
      case "income": return `${who} mencatat pemasukan ${e.name} ${rp}.`;
      case "expense": return `${who} menambahkan pengeluaran ${e.name} ${rp}.`;
      case "savings_deposit": return `${who} menambahkan dana tabungan ${goalName(e.savingsId)} ${rp}.`;
      case "savings_withdraw": return `${who} menarik dana tabungan ${goalName(e.savingsId)} ${rp}.`;
      case "savings_transfer": return `${who} memindahkan ${rp} dari ${goalName(e.savingsId)} ke ${goalName(e.toSavingsId)}.`;
      default: return `${who} mengatur saldo awal ${rp}.`;
    }
  }
  const label = (TYPE_LABEL[e.type] || "transaksi").toLowerCase();
  return verb === "update"
    ? `${who} mengubah ${label} ${e.name} menjadi ${rp}.`
    : `${who} menghapus ${label} ${e.name} ${rp}.`;
}

function validateInput(i) {
  if (!isValidDateStr(i.date)) throw new LedgerError("Tanggal tidak valid.");
  if (!Number.isSafeInteger(i.amount) || i.amount <= 0) throw new LedgerError("Nominal harus berupa angka lebih dari 0.");
  if (i.amount > 1e12) throw new LedgerError("Nominal terlalu besar.");
  if (!cleanText(i.name, 100)) throw new LedgerError("Nama transaksi wajib diisi.");
  if (i.type === "income" || i.type === "expense") {
    const c = state.categories.find((x) => x.id === i.categoryId);
    if (!c || c.type !== i.type) throw new LedgerError("Pilih kategori yang sesuai.");
  }
  if (i.type === "expense" && !PAYMENT_METHODS.includes(i.paymentMethod)) throw new LedgerError("Pilih metode pembayaran.");
}

function buildEntry(ctx, i, name) {
  const { uid, name: who } = me(ctx);
  const d = {
    familyId: ctx.profile.familyId, type: i.type, date: i.date, monthId: i.date.slice(0, 7), name,
    amount: i.amount, description: cleanText(i.description || "", 300), status: "active",
    createdBy: uid, createdByName: who, createdAt: serverTimestamp(), updatedBy: uid, updatedAt: serverTimestamp(),
  };
  if (i.type === "income" || i.type === "expense") d.categoryId = i.categoryId;
  if (i.type === "expense") d.paymentMethod = i.paymentMethod;
  if (i.type.startsWith("savings_")) d.savingsId = i.savingsId;
  if (i.type === "savings_transfer") d.toSavingsId = i.toSavingsId;
  return d;
}

function checkSavingsRules(i) {
  const goal = (id) => state.goals.find((g) => g.id === id);
  if (!i.type.startsWith("savings_")) return;
  const g = goal(i.savingsId);
  if (!g) throw new LedgerError("Pos tabungan tidak ditemukan.");
  if (g.status === "archived") throw new LedgerError("Pos tabungan sudah diarsipkan.");
  const bal = savingsBalances(state.ledger);
  if (i.type === "savings_deposit") {
    const avail = mainBalanceThrough(state.ledger, i.date);
    if (i.amount > avail) throw new LedgerError(`Saldo utama tidak cukup. Tersedia ${formatRupiah(avail)}.`);
  } else if (i.amount > (bal[i.savingsId] || 0)) {
    throw new LedgerError(`Saldo pos tidak cukup. Tersedia ${formatRupiah(bal[i.savingsId] || 0)}.`);
  }
  if (i.type === "savings_transfer") {
    const t = goal(i.toSavingsId);
    if (!t || t.status === "archived") throw new LedgerError("Pos tujuan tidak valid.");
    if (i.toSavingsId === i.savingsId) throw new LedgerError("Pos asal dan tujuan harus berbeda.");
  }
}

// Menambah transaksi. input.id (UUID dibuat saat form dibuka) menjadi ID dokumen: klik ganda atau
// pengiriman ulang tidak membuat entri kedua.
export async function addEntry(ctx, input) {
  requireOnline();
  validateInput(input);
  checkSavingsRules(input);
  let name = cleanText(input.name, 100);
  if (input.type === "opening_balance") name = "Saldo awal";
  if (input.type === "savings_deposit") name = `Tabungan ${goalName(input.savingsId)}`;
  if (input.type === "savings_withdraw") name = `Tarik ${goalName(input.savingsId)}`;
  if (input.type === "savings_transfer") name = `Transfer ${goalName(input.savingsId)} ke ${goalName(input.toSavingsId)}`;

  const data = buildEntry(ctx, input, name);
  const ref = doc(col(ctx, "ledger"), input.id);
  const batch = writeBatch(db);
  batch.set(ref, data);
  sideDocs(batch, ctx, {
    action: "create", entityType: "ledger", entityId: input.id, summary: describe(ctx, { ...input, name }, "create"),
    after: snap({ ...input, name, status: "active" }), message: describe(ctx, { ...input, name }, "create"),
  });
  try {
    await batch.commit();
  } catch (err) {
    if (err.code === "permission-denied") {
      const existing = await getDoc(ref).catch(() => null);
      if (existing?.exists()) return { id: input.id, duplicate: true };
    }
    throw err;
  }
  await afterWrite(ctx, { ...input, name });
  return { id: input.id };
}

const EDITABLE = ["date", "name", "categoryId", "amount", "paymentMethod", "description"];

export async function updateEntry(ctx, entry, changes) {
  requireOnline();
  if (!["income", "expense", "opening_balance"].includes(entry.type)) throw new LedgerError("Jenis transaksi ini tidak dapat diubah. Hapus lalu catat ulang.");
  const merged = { ...entry, ...changes };
  if (entry.type === "opening_balance") merged.name = "Saldo awal";
  validateInput(merged);
  const { uid } = me(ctx);
  const patch = {};
  for (const k of EDITABLE) {
    if (merged[k] !== undefined && (entry.type === "expense" || k !== "paymentMethod") && (entry.type !== "opening_balance" || ["date", "amount", "description", "name"].includes(k))) {
      patch[k] = k === "name" ? cleanText(merged[k], 100) : k === "description" ? cleanText(merged[k] || "", 300) : merged[k];
    }
  }
  if (entry.type === "opening_balance") delete patch.categoryId;
  patch.monthId = merged.date.slice(0, 7);
  patch.updatedBy = uid;
  patch.updatedAt = serverTimestamp();

  const batch = writeBatch(db);
  batch.update(doc(col(ctx, "ledger"), entry.id), patch);
  const after = { ...entry, ...patch };
  sideDocs(batch, ctx, {
    action: "update", entityType: "ledger", entityId: entry.id, summary: describe(ctx, after, "update"),
    before: snap(entry), after: snap(after), message: describe(ctx, after, "update"),
  });
  await batch.commit();
  await afterWrite(ctx, after);
}

export async function deleteEntry(ctx, entry) {
  requireOnline();
  if (entry.type === "opening_balance") throw new LedgerError("Saldo awal diubah dari menu Pengaturan.");
  const problem = deletionProblem(state.ledger, entry);
  if (problem) throw new LedgerError(problem);
  const batch = writeBatch(db);
  batch.update(doc(col(ctx, "ledger"), entry.id), { status: "deleted", updatedBy: ctx.user.uid, updatedAt: serverTimestamp() });
  sideDocs(batch, ctx, {
    action: "delete", entityType: "ledger", entityId: entry.id, summary: describe(ctx, entry, "delete"),
    before: snap(entry), after: { ...snap(entry), status: "deleted" }, message: describe(ctx, entry, "delete"),
  });
  await batch.commit();
  for (const id of [entry.savingsId, entry.toSavingsId].filter(Boolean)) await maybeAchieve(ctx, id).catch(() => {});
}

// Tindakan lanjutan yang tidak kritis: gagal di sini tidak membatalkan transaksi yang sudah tersimpan.
async function afterWrite(ctx, e) {
  try {
    if (e.type === "expense") await checkBudgetAlerts(ctx, e.date.slice(0, 7), e.categoryId);
    for (const id of [e.savingsId, e.toSavingsId].filter(Boolean)) await maybeAchieve(ctx, id);
  } catch { /* diabaikan */ }
}

// Peringatan anggaran: satu notifikasi per ambang per kategori per bulan. ID dokumen alert deterministik
// dan hanya bisa dibuat sekali (Security Rules menolak penulisan ulang), sehingga tidak ada notifikasi ganda.
export async function checkBudgetAlerts(ctx, monthId, categoryId, override = null) {
  const b = override || state.budgets.find((x) => x.id === `${monthId}_${categoryId}`);
  if (!b) return;
  const actual = periodTotals(state.ledger, monthStart(monthId), monthEnd(monthId)).byCategory[categoryId] || 0;
  const t = alertDecision({
    actual, limit: b.limitAmount, thresholds: b.thresholds,
    isSent: (x) => state.alerts.has(alertKey(categoryId, monthId, x)),
  });
  if (!t) return;
  const st = budgetStatus(b.limitAmount, actual);
  const suffix = monthId === todayJakarta().slice(0, 7) ? "" : ` (${monthLabel(monthId)})`;
  const rest = st.remaining >= 0 ? `Sisa ${formatRupiah(st.remaining)}.` : `Melebihi anggaran ${formatRupiah(-st.remaining)}.`;
  const message = `Anggaran ${catName(categoryId)}${suffix} sudah mencapai ${t}%. Pengeluaran ${formatRupiah(actual)} dari anggaran ${formatRupiah(b.limitAmount)}. ${rest}`;
  const batch = writeBatch(db);
  batch.set(doc(col(ctx, "budgetAlerts"), alertKey(categoryId, monthId, t)), {
    categoryId, monthId, threshold: t, createdBy: ctx.user.uid, createdAt: serverTimestamp(),
  });
  const { uid, name } = me(ctx);
  batch.set(doc(col(ctx, "notifications")), {
    type: "budget", message, actorUid: uid, actorName: name, readBy: { [uid]: true }, createdAt: serverTimestamp(),
  });
  try { await batch.commit(); } catch (err) { if (err.code !== "permission-denied") throw err; } // sudah pernah dikirim
}

// Menandai pos tabungan tercapai (dan mengembalikannya ke aktif bila saldo turun lagi).
export async function maybeAchieve(ctx, goalId) {
  const g = state.goals.find((x) => x.id === goalId);
  if (!g) return;
  const bal = savingsBalances(state.ledger)[goalId] || 0;
  const ref = doc(col(ctx, "savingsGoals"), goalId);
  if (g.status === "active" && bal >= g.targetAmount) {
    const batch = writeBatch(db);
    batch.update(ref, { status: "achieved", updatedAt: serverTimestamp() });
    sideDocs(batch, ctx, {
      action: "update", entityType: "savingsGoal", entityId: goalId, summary: `Target tabungan ${g.name} tercapai.`,
      message: `Target tabungan ${g.name} berhasil tercapai.`, type: "savings_goal",
    });
    await batch.commit();
  } else if (g.status === "achieved" && bal < g.targetAmount) {
    const batch = writeBatch(db);
    batch.update(ref, { status: "active", updatedAt: serverTimestamp() });
    await batch.commit();
  }
}

// ---------- Pos tabungan ----------
export async function saveGoal(ctx, { id = null, name, targetAmount, startDate, targetDate, description }) {
  requireOnline();
  const n = cleanText(name, 60);
  if (!n) throw new LedgerError("Nama pos tabungan wajib diisi.");
  if (!Number.isSafeInteger(targetAmount) || targetAmount <= 0) throw new LedgerError("Target tabungan harus lebih dari 0.");
  if (!isValidDateStr(startDate)) throw new LedgerError("Tanggal mulai tidak valid.");
  if (targetDate && !isValidDateStr(targetDate)) throw new LedgerError("Tanggal target tidak valid.");
  if (targetDate && targetDate < startDate) throw new LedgerError("Tanggal target tidak boleh sebelum tanggal mulai.");
  const fields = { name: n, targetAmount, startDate, targetDate: targetDate || "", description: cleanText(description || "", 300) };
  const batch = writeBatch(db);
  if (id) {
    batch.update(doc(col(ctx, "savingsGoals"), id), { ...fields, updatedAt: serverTimestamp() });
    sideDocs(batch, ctx, { action: "update", entityType: "savingsGoal", entityId: id, summary: `Mengubah pos tabungan ${n}.`, after: fields });
  } else {
    const ref = doc(col(ctx, "savingsGoals"));
    batch.set(ref, { ...fields, status: "active", createdBy: ctx.user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    sideDocs(batch, ctx, {
      action: "create", entityType: "savingsGoal", entityId: ref.id, summary: `Membuat pos tabungan ${n}.`, after: fields,
      message: `${ctx.profile.displayName} membuat pos tabungan ${n}.`,
    });
  }
  await batch.commit();
}

export async function setGoalStatus(ctx, goal, status) {
  requireOnline();
  const batch = writeBatch(db);
  batch.update(doc(col(ctx, "savingsGoals"), goal.id), { status, updatedAt: serverTimestamp() });
  sideDocs(batch, ctx, {
    action: "update", entityType: "savingsGoal", entityId: goal.id,
    summary: `${status === "archived" ? "Mengarsipkan" : "Mengaktifkan"} pos tabungan ${goal.name}.`,
  });
  await batch.commit();
}

// ---------- Anggaran ----------
export async function saveBudget(ctx, { monthId, categoryId, limitAmount, thresholds }) {
  requireOnline();
  if (!Number.isSafeInteger(limitAmount) || limitAmount <= 0) throw new LedgerError("Anggaran harus lebih dari 0.");
  const th = [...new Set(thresholds)].filter((t) => [75, 90, 100].includes(t)).sort((a, b) => a - b);
  if (!th.length) throw new LedgerError("Pilih minimal satu ambang peringatan.");
  const id = `${monthId}_${categoryId}`;
  const exists = state.budgets.some((b) => b.id === id);
  const batch = writeBatch(db);
  const ref = doc(col(ctx, "budgets"), id);
  if (exists) batch.update(ref, { limitAmount, thresholds: th, updatedAt: serverTimestamp() });
  else batch.set(ref, { monthId, categoryId, limitAmount, thresholds: th, createdBy: ctx.user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  sideDocs(batch, ctx, {
    action: exists ? "update" : "create", entityType: "budget", entityId: id,
    summary: `${exists ? "Mengubah" : "Membuat"} anggaran ${catName(categoryId)} ${monthLabel(monthId)} ${formatRupiah(limitAmount)}.`,
    after: { monthId, categoryId, limitAmount, thresholds: th },
    message: `${ctx.profile.displayName} ${exists ? "mengubah" : "membuat"} anggaran ${catName(categoryId)} ${formatRupiah(limitAmount)} (${monthLabel(monthId)}).`,
  });
  await batch.commit();
  await checkBudgetAlerts(ctx, monthId, categoryId, { limitAmount, thresholds: th }).catch(() => {});
}

export async function deleteBudget(ctx, budget) {
  requireOnline();
  const batch = writeBatch(db);
  batch.delete(doc(col(ctx, "budgets"), budget.id));
  sideDocs(batch, ctx, {
    action: "delete", entityType: "budget", entityId: budget.id,
    summary: `Menghapus anggaran ${catName(budget.categoryId)} ${monthLabel(budget.monthId)}.`,
    before: { monthId: budget.monthId, categoryId: budget.categoryId, limitAmount: budget.limitAmount },
  });
  await batch.commit();
}

export async function copyBudgets(ctx, fromMonth, toMonth) {
  requireOnline();
  const source = state.budgets.filter((b) => b.monthId === fromMonth && !state.budgets.some((x) => x.id === `${toMonth}_${b.categoryId}`));
  if (!source.length) throw new LedgerError("Tidak ada anggaran baru untuk disalin.");
  const batch = writeBatch(db);
  for (const b of source) {
    batch.set(doc(col(ctx, "budgets"), `${toMonth}_${b.categoryId}`), {
      monthId: toMonth, categoryId: b.categoryId, limitAmount: b.limitAmount, thresholds: b.thresholds,
      createdBy: ctx.user.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  }
  sideDocs(batch, ctx, {
    action: "create", entityType: "budget", entityId: toMonth, summary: `Menyalin ${source.length} anggaran dari ${monthLabel(fromMonth)} ke ${monthLabel(toMonth)}.`,
    message: `${ctx.profile.displayName} menyalin ${source.length} anggaran ke ${monthLabel(toMonth)}.`,
  });
  await batch.commit();
  return source.length;
}

// ---------- Kategori ----------
export async function saveCategory(ctx, { id = null, type, name }) {
  requireOnline();
  const n = cleanText(name, 40);
  if (!n) throw new LedgerError("Nama kategori wajib diisi.");
  if (state.categories.some((c) => c.type === type && c.id !== id && c.name.toLowerCase() === n.toLowerCase())) {
    throw new LedgerError("Nama kategori sudah ada.");
  }
  const batch = writeBatch(db);
  if (id) batch.update(doc(col(ctx, "categories"), id), { name: n, updatedAt: serverTimestamp() });
  else batch.set(doc(col(ctx, "categories")), { type, name: n, isActive: true, isDefault: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function setCategoryActive(ctx, category, isActive) {
  requireOnline();
  const batch = writeBatch(db);
  batch.update(doc(col(ctx, "categories"), category.id), { isActive, updatedAt: serverTimestamp() });
  await batch.commit();
}

// ---------- Notifikasi ----------
export async function markNotificationsRead(ctx, ids) {
  requireOnline();
  const batch = writeBatch(db);
  ids.slice(0, 400).forEach((id) => batch.update(doc(col(ctx, "notifications"), id), { [`readBy.${ctx.user.uid}`]: true }));
  await batch.commit();
}
