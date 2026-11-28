import test from "node:test";
import assert from "node:assert/strict";
import { buildMonthlyReport, renderMonthlyReportHtml } from "../assets/js/monthly-report.js";

let n = 0;
const E = (type, date, amount, extra = {}) => ({ id: "r" + ++n, type, date, amount, status: "active", createdBy: "u1", createdByName: "Suami", ...extra });
const names = { dapur: "Belanja dapur", gaji: "Gaji suami", xss: "<script>alert(1)</script>" };
const base = {
  entries: [
    E("opening_balance", "2026-09-20", 3000000, { name: "Saldo awal" }),
    E("income", "2026-10-05", 6000000, { name: "Gaji", categoryId: "gaji" }),
    E("expense", "2026-10-26", 2000000, { name: "Belanja bulanan", categoryId: "dapur", paymentMethod: "Cash" }),
    E("expense", "2026-10-27", 100000, { name: "<b>Uji</b>", categoryId: "xss" }),
    E("savings_deposit", "2026-10-27", 1000000, { name: "Tabungan Dana darurat", savingsId: "dd" }),
    E("expense", "2026-11-02", 500000, { name: "Bulan lain", categoryId: "dapur" }),
    E("expense", "2026-10-28", 999, { name: "Dihapus", categoryId: "dapur", status: "deleted" }),
  ],
  month: "2026-10",
  budgets: [{ monthId: "2026-10", categoryId: "dapur", limitAmount: 2000000 }, { monthId: "2026-11", categoryId: "dapur", limitAmount: 1 }],
  goals: [{ id: "dd", name: "Dana darurat", targetAmount: 10000000, status: "active", isEmergency: true }],
  catName: (id) => names[id] || id, goalName: (id) => id === "dd" ? "Dana darurat" : id, personName: (_, f) => f,
  familyName: "Keluarga Uji", preparedBy: "Suami", now: new Date("2026-11-24T05:00:00Z"), today: "2026-11-24",
};

test("data laporan bulanan sesuai ledger", () => {
  const d = buildMonthlyReport(base);
  assert.equal(d.title, "Laporan Oktober 2026");
  const s = d.summary;
  assert.equal(s.opening, 3000000);
  assert.equal(s.income, 6000000); assert.equal(s.expense, 2100000);
  assert.equal(s.savingsIn, 1000000);
  assert.equal(s.closing, 3000000 + 6000000 - 2100000 - 1000000);
  assert.equal(s.savingsTotal, 1000000);
  assert.equal(s.wealth, s.closing + 1000000);
  assert.equal(d.transactions.length, 4, "transaksi bulan lain dan yang dihapus tidak ikut");
  assert.equal(d.budgets[0].label, "Anggaran habis");
  assert.equal(d.budgets[0].actual, 2000000);
  assert.equal(d.goals[0].pct, 10);
  assert.match(d.emergency.text, /Dana darurat Rp1\.000\.000/);
});

test("HTML laporan memuat angka kunci dan meloloskan teks berbahaya", () => {
  const html = renderMonthlyReportHtml(buildMonthlyReport(base));
  for (const s of ["Laporan Oktober 2026", "Keluarga Uji", "Rp6.000.000", "Rp6.900.000", "Anggaran habis", "Daftar transaksi (4)", "-Rp2.000.000", "+Rp6.000.000"]) {
    assert.ok(html.includes(s), "tidak ditemukan: " + s);
  }
  assert.ok(!html.includes("<script>"), "tag script harus di-escape");
  assert.ok(!html.includes("<b>Uji</b>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("bulan tanpa data menghasilkan laporan kosong yang tetap valid", () => {
  const d = buildMonthlyReport({ ...base, month: "2025-01" });
  const html = renderMonthlyReportHtml(d);
  assert.equal(d.transactions.length, 0);
  assert.ok(html.includes("Tidak ada transaksi.") && html.includes("Tidak ada pengeluaran."));
});
