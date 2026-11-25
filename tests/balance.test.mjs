import test from "node:test";
import assert from "node:assert/strict";
import {
  effect, mainBalanceThrough, savingsBalances, totalSavings, monthSummary, periodTotals,
  budgetStatus, alertDecision, deletionProblem, analyze,
} from "../assets/js/balance.js";
import { addMonths, monthEnd, monthStart, csvCell, toCsv, parseAmount, formatAmountInput, weekStart, isValidDateStr } from "../assets/js/utils.js";

let n = 0;
const E = (type, date, amount, extra = {}) => ({ id: "e" + ++n, type, date, amount, status: "active", ...extra });
const base = () => [
  E("opening_balance", "2026-10-01", 5000000),
  E("income", "2026-10-25", 8000000, { categoryId: "gaji" }),
  E("expense", "2026-10-26", 3000000, { categoryId: "dapur" }),
  E("savings_deposit", "2026-10-27", 1000000, { savingsId: "ed" }),
];

test("saldo bulanan: saldo awal, saldo akhir, pergantian bulan", () => {
  const l = base();
  const oct = monthSummary(l, "2026-10"), nov = monthSummary(l, "2026-11");
  assert.equal(oct.opening, 0);
  assert.equal(oct.closing, 5000000 + 8000000 - 3000000 - 1000000);
  assert.equal(nov.opening, oct.closing);
  assert.equal(nov.closing, oct.closing);
});

test("pemindahan ke tabungan bukan pengeluaran dan total kekayaan tetap", () => {
  const l = base();
  assert.equal(monthSummary(l, "2026-10").expense, 3000000);
  const main = mainBalanceThrough(l, "2026-12-31");
  assert.equal(main + totalSavings(l), 5000000 + 8000000 - 3000000);
  // contoh dari prompt: 5jt, pindah 1jt ke tabungan pendidikan
  const p = [E("opening_balance", "2026-11-01", 5000000), E("savings_deposit", "2026-11-02", 1000000, { savingsId: "pend" })];
  assert.equal(mainBalanceThrough(p, "2026-11-30"), 4000000);
  assert.equal(savingsBalances(p).pend, 1000000);
  assert.equal(mainBalanceThrough(p, "2026-11-30") + totalSavings(p), 5000000);
});

test("transaksi terlambat di bulan lalu mengubah saldo akhir dan saldo awal bulan berikutnya secara konsisten", () => {
  const l = base();
  const before = monthSummary(l, "2026-10").closing;
  l.push(E("expense", "2026-10-28", 500000, { categoryId: "dapur" }));
  const oct = monthSummary(l, "2026-10"), nov = monthSummary(l, "2026-11");
  assert.equal(oct.closing, before - 500000);
  assert.equal(nov.opening, oct.closing);
});

test("koreksi (ubah nominal) dan hapus (soft delete)", () => {
  const l = base();
  const exp = l.find((e) => e.type === "expense");
  exp.amount = 2000000;
  assert.equal(monthSummary(l, "2026-10").closing, 5000000 + 8000000 - 2000000 - 1000000);
  exp.status = "deleted";
  assert.equal(monthSummary(l, "2026-10").expense, 0);
  assert.equal(monthSummary(l, "2026-10").closing, 5000000 + 8000000 - 1000000);
});

test("tarik dana dan transfer antarpos tanpa penghitungan ganda", () => {
  const l = [E("opening_balance", "2026-11-01", 2000000),
    E("savings_deposit", "2026-11-02", 1000000, { savingsId: "a" }),
    E("savings_transfer", "2026-11-03", 400000, { savingsId: "a", toSavingsId: "b" }),
    E("savings_withdraw", "2026-11-04", 100000, { savingsId: "b" })];
  const s = savingsBalances(l);
  assert.deepEqual([s.a, s.b], [600000, 300000]);
  assert.equal(mainBalanceThrough(l, "2026-11-30"), 2000000 - 1000000 + 100000);
  assert.equal(mainBalanceThrough(l, "2026-11-30") + totalSavings(l), 2000000);
  const m = monthSummary(l, "2026-11");
  assert.equal(m.expense, 0); assert.equal(m.income, 0);
});

test("penghapusan entri tabungan yang membuat saldo pos negatif ditolak", () => {
  const dep = E("savings_deposit", "2026-11-02", 1000000, { savingsId: "a" });
  const wd = E("savings_withdraw", "2026-11-03", 800000, { savingsId: "a" });
  assert.match(deletionProblem([dep, wd], dep), /negatif/);
  assert.equal(deletionProblem([dep, wd], wd), null);
});

test("indikator anggaran: 75, 90, 100 persen", () => {
  assert.equal(budgetStatus(2000000, 1499999).level, "green");
  assert.equal(budgetStatus(2000000, 1500000).level, "yellow");
  assert.equal(budgetStatus(2000000, 1799999).level, "yellow");
  assert.equal(budgetStatus(2000000, 1800000).level, "orange");
  assert.equal(budgetStatus(2000000, 1999999).level, "orange");
  assert.equal(budgetStatus(2000000, 2000000).level, "red");
  assert.equal(budgetStatus(2000000, 2500000).level, "red");
  const s = budgetStatus(2000000, 1800000);
  assert.equal(s.pctLabel, 90); assert.equal(s.remaining, 200000);
});

test("peringatan anggaran: ambang tertinggi, tidak berulang", () => {
  const sent = new Set();
  const d = (actual) => alertDecision({ actual, limit: 2000000, thresholds: [75, 90, 100], isSent: (t) => sent.has(t) });
  assert.equal(d(1000000), null);
  assert.equal(d(1500000), 75); sent.add(75);
  assert.equal(d(1600000), null);
  assert.equal(d(1800000), 90); sent.add(90);
  assert.equal(d(1850000), null);
  assert.equal(d(2000000), 100); sent.add(100);
  assert.equal(d(2600000), null);
  assert.equal(alertDecision({ actual: 5, limit: 0, thresholds: [75], isSent: () => false }), null);
  assert.equal(alertDecision({ actual: 5000000, limit: 2000000, thresholds: [75, 90, 100], isSent: () => false }), 100);
});

test("analisis otomatis", () => {
  const l = [
    E("expense", "2026-10-05", 1000000, { categoryId: "dapur" }),
    E("expense", "2026-11-05", 1150000, { categoryId: "dapur" }),
    E("income", "2026-11-02", 5000000, { categoryId: "gaji" }),
    E("savings_deposit", "2026-11-10", 500000, { savingsId: "a" }),
  ];
  const out = analyze({ entries: l, monthId: "2026-11", budgets: [{ monthId: "2026-11", categoryId: "dapur", limitAmount: 1000000 }], catName: (id) => ({ dapur: "Belanja dapur" }[id]) });
  assert.ok(out.some((s) => s.includes("Belanja dapur menjadi kategori pengeluaran terbesar")));
  assert.ok(out.some((s) => s.includes("meningkat 15%")));
  assert.ok(out.some((s) => s.includes("Total tabungan meningkat Rp500.000")));
  assert.ok(out.some((s) => s.includes("melebihi anggaran sebesar Rp150.000")));
  assert.ok(out.some((s) => s.includes("10%")));
});

test("properti: saldo akhir = saldo awal bulan berikutnya = saldo kumulatif (data acak)", () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const types = ["income", "expense", "savings_deposit", "savings_withdraw", "savings_transfer"];
  const l = [E("opening_balance", "2026-01-01", 1000000)];
  for (let i = 0; i < 400; i++) {
    const t = types[Math.floor(rnd() * types.length)];
    const day = String(1 + Math.floor(rnd() * 28)).padStart(2, "0");
    const mon = String(1 + Math.floor(rnd() * 12)).padStart(2, "0");
    l.push(E(t, `2026-${mon}-${day}`, 1000 * (1 + Math.floor(rnd() * 500)),
      { categoryId: "c", savingsId: rnd() < 0.5 ? "a" : "b", toSavingsId: "z", status: rnd() < 0.1 ? "deleted" : "active" }));
  }
  let kekayaanAkhir = null;
  for (let m = "2026-01"; m <= "2026-12"; m = addMonths(m, 1)) {
    const s = monthSummary(l, m), nxt = monthSummary(l, addMonths(m, 1));
    assert.equal(s.closing, mainBalanceThrough(l, monthEnd(m)));
    assert.equal(nxt.opening, s.closing);
    kekayaanAkhir = s.closing + totalSavings(l, monthEnd(m));
  }
  const total = l.filter((e) => e.status !== "deleted" && ["income", "opening_balance"].includes(e.type)).reduce((a, e) => a + e.amount, 0)
    - l.filter((e) => e.status !== "deleted" && e.type === "expense").reduce((a, e) => a + e.amount, 0);
  assert.equal(kekayaanAkhir, total); // tabungan hanya memindahkan dana, tidak mengubah total kekayaan
});

test("utilitas tanggal, nominal, CSV", () => {
  assert.equal(weekStart("2026-11-24"), "2026-11-23");
  assert.equal(monthStart("2026-11"), "2026-11-01");
  assert.equal(monthEnd("2028-02"), "2028-02-29");
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(addMonths("2026-01", -1), "2025-12");
  assert.equal(isValidDateStr("2026-02-30"), false);
  assert.equal(parseAmount("Rp 1.250.000"), 1250000);
  assert.equal(formatAmountInput("1250000"), "1.250.000");
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell("=SUM(A1)"), "'=SUM(A1)");
  assert.equal(csvCell(-5), "-5");
  assert.equal(toCsv([["a", "b"], [1, "x y"]]), "a,b\r\n1,x y");
});

import { buildReport } from "../assets/js/balance.js";

test("laporan periodik dan per kategori", () => {
  const names = { dapur: "Belanja dapur", gaji: "Gaji suami" };
  const cn = (id) => names[id] || id;
  const l = [
    E("income", "2026-11-02", 5000000, { categoryId: "gaji" }),
    E("expense", "2026-11-03", 150000, { categoryId: "dapur" }),
    E("expense", "2026-11-04", 250000, { categoryId: "dapur" }),
    E("expense", "2026-12-01", 100000, { categoryId: "dapur" }),
    E("savings_deposit", "2026-11-05", 1000000, { savingsId: "a" }),
    E("expense", "2026-11-06", 999, { categoryId: "dapur", status: "deleted" }),
  ];
  const b = buildReport(l, "bulanan", "2026-11-01", "2026-12-31", cn);
  assert.equal(b.rows.length, 2);
  assert.deepEqual(b.rows[0].slice(1), [5000000, 400000, 4600000, 1000000, 0]);
  assert.deepEqual(b.totals.slice(1), [5000000, 500000, 4500000, 1000000, 0]);
  const h = buildReport(l, "harian", "2026-11-01", "2026-11-30", cn);
  assert.equal(h.rows.length, 4);
  const k = buildReport(l, "kategori", "2026-11-01", "2026-11-30", cn);
  assert.deepEqual(k.rows[0], ["Pengeluaran", "Belanja dapur", 400000, "100.0%"]);
  const t = buildReport(l, "tahunan", "2026-01-01", "2026-12-31", cn);
  assert.equal(t.rows[0][0], "2026");
  const w = buildReport(l, "mingguan", "2026-11-01", "2026-11-30", cn);
  assert.ok(w.rows.every((r) => r[0].includes(" - ")));
});
