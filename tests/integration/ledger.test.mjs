// Menjalankan ledger.js dan store.js sungguhan dengan Firestore palsu (stub) untuk memeriksa alur penulisan.
// Jalankan: npm run test:integration
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
const { state } = await import("../../assets/js/store.js");
const L = await import("../../assets/js/ledger.js");
const { todayJakarta } = await import("../../assets/js/utils.js");

const ctx = { user: { uid: "u1" }, profile: { displayName: "Suami", familyId: "f1" } };
const TODAY = todayJakarta();
const MONTH = TODAY.slice(0, 7);
let commits;

function apply(ops) {
  for (const [op, path, data] of ops) {
    const [, , coll, id] = path.split("/");
    if (op === "set" && coll === "budgetAlerts" && state.alerts.has(id)) { const e = new Error("exists"); e.code = "permission-denied"; throw e; }
    if (coll === "ledger") {
      if (op === "set") state.ledger.push({ id, ...data });
      if (op === "update") Object.assign(state.ledger.find((x) => x.id === id), data);
    }
    if (coll === "budgetAlerts" && op === "set") state.alerts.add(id);
    if (coll === "notifications" && op === "set") state.notifications.unshift({ id: "n" + state.notifications.length, ...data });
    if (coll === "savingsGoals" && op === "update") Object.assign(state.goals.find((g) => g.id === id), data);
    if (coll === "budgets" && op === "set") state.budgets.push({ id, ...data });
  }
}
beforeEach(() => {
  navigator.onLine = true;
  Object.assign(state, {
    categories: [{ id: "exp_dapur", type: "expense", name: "Belanja dapur", isActive: true }, { id: "inc_gaji", type: "income", name: "Gaji suami", isActive: true }],
    ledger: [], budgets: [], alerts: new Set(), notifications: [],
    goals: [{ id: "g1", name: "Pendidikan", targetAmount: 1000000, status: "active" }, { id: "g2", name: "Liburan", targetAmount: 5000000, status: "active" }],
  });
  commits = [];
  globalThis.__getDoc = undefined;
  globalThis.__commit = async (ops) => { commits.push(ops); apply(ops); };
});

const expense = (id, amount, extra = {}) => ({ id, type: "expense", date: TODAY, name: "Belanja", categoryId: "exp_dapur", amount, paymentMethod: "Cash", ...extra });

test("pengeluaran: satu batch atomis berisi ledger, log audit, dan notifikasi", async () => {
  await L.addEntry(ctx, expense("req-1", 150000));
  assert.equal(commits.length, 1);
  const kinds = commits[0].map(([, p]) => p.split("/")[2]).sort();
  assert.deepEqual(kinds, ["activityLogs", "ledger", "notifications"]);
  const e = state.ledger[0];
  assert.equal(e.id, "req-1"); assert.equal(e.createdBy, "u1"); assert.equal(e.createdByName, "Suami");
  assert.equal(e.monthId, MONTH); assert.equal(e.status, "active"); assert.equal(e.amount, 150000);
  assert.equal(state.notifications[0].message, "Suami menambahkan pengeluaran Belanja Rp150.000.");
  assert.deepEqual(state.notifications[0].readBy, { u1: true });
});

test("validasi: nominal tidak valid, tanggal salah, kategori salah ditolak sebelum menulis", async () => {
  for (const amount of [0, -1, 1.5, NaN]) await assert.rejects(L.addEntry(ctx, expense("x", amount)), L.LedgerError);
  await assert.rejects(L.addEntry(ctx, expense("x", 1000, { date: "2026-02-30" })), L.LedgerError);
  await assert.rejects(L.addEntry(ctx, expense("x", 1000, { categoryId: "inc_gaji" })), L.LedgerError);
  await assert.rejects(L.addEntry(ctx, expense("x", 1000, { paymentMethod: "Barter" })), L.LedgerError);
  assert.equal(commits.length, 0);
});

test("pengiriman ulang dengan ID yang sama dianggap sukses tanpa duplikat", async () => {
  globalThis.__commit = async () => { const e = new Error("ditolak"); e.code = "permission-denied"; throw e; };
  globalThis.__getDoc = async () => ({ exists: () => true });
  const r = await L.addEntry(ctx, expense("req-dup", 1000));
  assert.equal(r.duplicate, true);
});

test("offline: perubahan ditolak dengan pesan jelas", async () => {
  navigator.onLine = false;
  await assert.rejects(L.addEntry(ctx, expense("o1", 1000)), /offline/i);
  assert.equal(commits.length, 0);
});

test("peringatan anggaran 75, 90, 100 persen tepat satu kali per ambang", async () => {
  await L.saveBudget(ctx, { monthId: MONTH, categoryId: "exp_dapur", limitAmount: 2000000, thresholds: [75, 90, 100] });
  const alerts = () => state.notifications.filter((n) => n.type === "budget").map((n) => n.message);
  await L.addEntry(ctx, expense("a1", 1000000)); assert.equal(alerts().length, 0);
  await L.addEntry(ctx, expense("a2", 500000)); assert.equal(alerts().length, 1);
  assert.match(alerts()[0], /sudah mencapai 75%/);
  await L.addEntry(ctx, expense("a3", 300000)); assert.equal(alerts().length, 2);
  assert.equal(alerts()[0], "Anggaran Belanja dapur sudah mencapai 90%. Pengeluaran Rp1.800.000 dari anggaran Rp2.000.000. Sisa Rp200.000.");
  await L.addEntry(ctx, expense("a4", 50000)); assert.equal(alerts().length, 2, "tidak berulang untuk ambang yang sama");
  await L.addEntry(ctx, expense("a5", 150000)); assert.equal(alerts().length, 3);
  assert.match(alerts()[0], /sudah mencapai 100%.*Sisa Rp0\./);
  await L.addEntry(ctx, expense("a6", 500000)); assert.equal(alerts().length, 3, "melewati 100% tidak mengirim ulang");
});

test("edit dan hapus memperbarui perhitungan; hapus tidak mengirim peringatan baru", async () => {
  await L.saveBudget(ctx, { monthId: MONTH, categoryId: "exp_dapur", limitAmount: 1000000, thresholds: [75, 90, 100] });
  await L.addEntry(ctx, expense("e1", 500000));
  const entry = state.ledger.find((x) => x.id === "e1");
  await L.updateEntry(ctx, entry, { amount: 800000, name: "Belanja", date: TODAY, categoryId: "exp_dapur", paymentMethod: "Cash" });
  assert.equal(state.ledger.find((x) => x.id === "e1").amount, 800000);
  assert.ok(state.notifications.some((n) => /75%/.test(n.message)));
  const before = state.notifications.length;
  await L.deleteEntry(ctx, state.ledger.find((x) => x.id === "e1"));
  assert.equal(state.ledger.find((x) => x.id === "e1").status, "deleted");
  assert.equal(state.notifications.length, before + 1); // hanya notifikasi penghapusan
});

test("tabungan: setoran melebihi saldo utama ditolak; setoran valid tidak dihitung pengeluaran", async () => {
  await L.addEntry(ctx, { id: "i0", type: "opening_balance", date: TODAY, name: "Saldo awal", amount: 5000000 });
  await assert.rejects(L.addEntry(ctx, { id: "d0", type: "savings_deposit", date: TODAY, name: "x", amount: 6000000, savingsId: "g1" }), /Saldo utama tidak cukup/);
  await L.addEntry(ctx, { id: "d1", type: "savings_deposit", date: TODAY, name: "x", amount: 1000000, savingsId: "g1" });
  const { monthSummary, mainBalanceThrough, savingsBalances } = await import("../../assets/js/balance.js");
  assert.equal(monthSummary(state.ledger, MONTH).expense, 0);
  assert.equal(mainBalanceThrough(state.ledger, TODAY), 4000000);
  assert.equal(savingsBalances(state.ledger).g1, 1000000);
});

test("tabungan: target tercapai memicu notifikasi dan status achieved; transfer dan tarik divalidasi", async () => {
  await L.addEntry(ctx, { id: "i1", type: "opening_balance", date: TODAY, name: "Saldo awal", amount: 3000000 });
  await L.addEntry(ctx, { id: "d2", type: "savings_deposit", date: TODAY, name: "x", amount: 1000000, savingsId: "g1" });
  assert.equal(state.goals.find((g) => g.id === "g1").status, "achieved");
  assert.ok(state.notifications.some((n) => n.message === "Target tabungan Pendidikan berhasil tercapai."));
  await assert.rejects(L.addEntry(ctx, { id: "t0", type: "savings_transfer", date: TODAY, name: "x", amount: 2000000, savingsId: "g1", toSavingsId: "g2" }), /Saldo pos tidak cukup/);
  await assert.rejects(L.addEntry(ctx, { id: "t1", type: "savings_transfer", date: TODAY, name: "x", amount: 100, savingsId: "g1", toSavingsId: "g1" }), L.LedgerError);
  await L.addEntry(ctx, { id: "t2", type: "savings_transfer", date: TODAY, name: "x", amount: 400000, savingsId: "g1", toSavingsId: "g2" });
  assert.equal(state.goals.find((g) => g.id === "g1").status, "active", "saldo turun di bawah target, status kembali aktif");
  await L.addEntry(ctx, { id: "w1", type: "savings_withdraw", date: TODAY, name: "x", amount: 100000, savingsId: "g2" });
});

test("penghapusan setoran yang membuat saldo pos negatif ditolak", async () => {
  await L.addEntry(ctx, { id: "i2", type: "opening_balance", date: TODAY, name: "Saldo awal", amount: 3000000 });
  await L.addEntry(ctx, { id: "d3", type: "savings_deposit", date: TODAY, name: "x", amount: 500000, savingsId: "g1" });
  await L.addEntry(ctx, { id: "w2", type: "savings_withdraw", date: TODAY, name: "x", amount: 400000, savingsId: "g1" });
  await assert.rejects(L.deleteEntry(ctx, state.ledger.find((x) => x.id === "d3")), /negatif/);
});
