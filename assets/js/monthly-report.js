// Laporan bulanan untuk dicetak / disimpan sebagai PDF. Modul murni (tanpa Firebase/DOM) agar dapat diuji.
import {
  monthSummary, periodTotals, savingsBalances, analyze, budgetStatus, budgetLabel, emergencyCoverage, emergencyText, emergencyGuide,
} from "./balance.js";
import { monthStart, monthEnd, monthLabel, formatRupiah, formatDateStr, formatDateTime, escapeHtml, todayJakarta } from "./utils.js";

const LABEL = {
  income: "Pemasukan", expense: "Pengeluaran", savings_deposit: "Tabungan masuk",
  savings_withdraw: "Tabungan keluar", savings_transfer: "Transfer tabungan", opening_balance: "Saldo awal",
};
const SIGN = { income: "+", savings_withdraw: "+", opening_balance: "+", expense: "-", savings_deposit: "-", savings_transfer: "" };

export function buildMonthlyReport({
  entries, month, budgets, goals, catName, goalName, personName, familyName, preparedBy, now = new Date(), today = todayJakarta(),
}) {
  const from = monthStart(month), to = monthEnd(month);
  const asOf = to < today ? to : today;
  const sum = monthSummary(entries, month);
  const t = periodTotals(entries, from, to);
  const sav = savingsBalances(entries, to);
  const savingsTotal = Object.values(sav).reduce((a, b) => a + b, 0);
  const share = (v, total) => (total > 0 ? Math.round((v * 1000) / total) / 10 : 0);
  const cats = (map, total) => Object.entries(map).sort((a, b) => b[1] - a[1])
    .map(([id, amount]) => ({ name: catName(id), amount, pct: share(amount, total) }));

  const budgetRows = budgets.filter((b) => b.monthId === month).map((b) => {
    const actual = t.byCategory[b.categoryId] || 0;
    const st = budgetStatus(b.limitAmount, actual);
    return { name: catName(b.categoryId), limit: b.limitAmount, actual, remaining: st.remaining, pctLabel: st.pctLabel, level: st.level, label: budgetLabel(st) };
  }).sort((a, b) => b.pctLabel - a.pctLabel);

  const goalRows = goals.filter((g) => g.status !== "archived" || (sav[g.id] || 0) !== 0)
    .map((g) => ({
      name: g.name, balance: sav[g.id] || 0, target: g.targetAmount, emergency: g.isEmergency === true,
      pct: g.targetAmount > 0 ? Math.min(100, Math.floor(((sav[g.id] || 0) * 100) / g.targetAmount)) : 0,
    })).sort((a, b) => a.name.localeCompare(b.name, "id"));

  const tx = entries.filter((e) => e.status !== "deleted" && e.date >= from && e.date <= to)
    .sort((a, b) => (a.date === b.date ? (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0) : a.date < b.date ? -1 : 1))
    .map((e) => ({
      date: formatDateStr(e.date), type: LABEL[e.type] || e.type, name: e.name,
      detail: e.categoryId ? catName(e.categoryId)
        : e.type === "savings_transfer" ? `${goalName(e.savingsId)} ke ${goalName(e.toSavingsId)}` : e.savingsId ? goalName(e.savingsId) : "",
      who: personName(e.createdBy, e.createdByName), amount: e.amount, sign: SIGN[e.type] ?? "",
    }));

  const coverage = emergencyCoverage({ entries, goals, today: asOf });
  return {
    title: `Laporan ${monthLabel(month)}`, month, familyName, preparedBy,
    generatedAt: formatDateTime(now), asOf: formatDateStr(asOf),
    summary: { ...sum, net: sum.income - sum.expense, savingsTotal, wealth: sum.closing + savingsTotal },
    expenseByCat: cats(t.byCategory, t.expense), incomeByCat: cats(t.incomeByCategory, t.income),
    budgets: budgetRows, goals: goalRows,
    emergency: { text: emergencyText(coverage), guide: emergencyGuide(coverage) },
    analysis: analyze({ entries, monthId: month, budgets, catName }),
    transactions: tx,
  };
}

const e = escapeHtml, rp = formatRupiah;
const table = (head, rows, right = []) => `<table><thead><tr>${head.map((h, i) => `<th${right.includes(i) ? ' class="r"' : ""}>${e(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${right.includes(i) ? ' class="r"' : ""}>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;

export function renderMonthlyReportHtml(d) {
  const s = d.summary;
  const kv = (rows) => `<table class="kv">${rows.map(([k, v, cls]) => `<tr><td>${e(k)}</td><td class="r ${cls || ""}">${v}</td></tr>`).join("")}</table>`;
  return `
  <header class="rpt-head">
    <h1>${e(d.title)}</h1>
    <p>${e(d.familyName || "")}</p>
    <p class="rpt-meta">Dibuat ${e(d.generatedAt)}${d.preparedBy ? ` oleh ${e(d.preparedBy)}` : ""}. Dihitung dari data per ${e(d.asOf)}; perubahan atau transaksi susulan setelah itu tidak tercermin.</p>
  </header>

  <section><h2>Ringkasan</h2>${kv([
    ["Saldo awal bulan", rp(s.opening)],
    ...(s.initial ? [["Saldo awal akun dicatat bulan ini", rp(s.initial)]] : []),
    ["Pemasukan", rp(s.income), "plus"], ["Pengeluaran", rp(s.expense), "minus"],
    ["Selisih pemasukan dikurangi pengeluaran", rp(s.net), s.net < 0 ? "minus" : "plus"],
    ["Dipindahkan ke tabungan", rp(s.savingsIn)], ["Ditarik dari tabungan", rp(s.savingsOut)],
    ["Saldo akhir bulan", rp(s.closing), "strong"], ["Total tabungan akhir bulan", rp(s.savingsTotal)],
    ["Total kekayaan akhir bulan", rp(s.wealth), "strong"],
  ])}</section>

  <section><h2>Pengeluaran per kategori</h2>${d.expenseByCat.length
    ? table(["Kategori", "Jumlah", "Porsi"], d.expenseByCat.map((r) => [e(r.name), rp(r.amount), `${String(r.pct).replace(".", ",")}%`]), [1, 2])
    : `<p class="muted">Tidak ada pengeluaran.</p>`}</section>

  <section><h2>Pemasukan per kategori</h2>${d.incomeByCat.length
    ? table(["Kategori", "Jumlah", "Porsi"], d.incomeByCat.map((r) => [e(r.name), rp(r.amount), `${String(r.pct).replace(".", ",")}%`]), [1, 2])
    : `<p class="muted">Tidak ada pemasukan.</p>`}</section>

  <section><h2>Anggaran dan realisasi</h2>${d.budgets.length
    ? table(["Kategori", "Anggaran", "Realisasi", "Sisa", "Pemakaian", "Status"], d.budgets.map((r) => [
      e(r.name), rp(r.limit), rp(r.actual), r.remaining < 0 ? `-${rp(-r.remaining)}` : rp(r.remaining),
      `<span class="rbar"><i class="lvl-${r.level}" style="width:${Math.min(100, r.pctLabel)}%"></i></span> ${r.pctLabel}%`, e(r.label)]), [1, 2, 3])
    : `<p class="muted">Tidak ada anggaran pada bulan ini.</p>`}</section>

  <section><h2>Pos tabungan (akhir bulan)</h2>${d.goals.length
    ? table(["Pos", "Saldo", "Target", "Tercapai"], d.goals.map((g) => [e(g.name) + (g.emergency ? " (dana darurat)" : ""), rp(g.balance), rp(g.target), `${g.pct}%`]), [1, 2, 3])
    : `<p class="muted">Belum ada pos tabungan.</p>`}
    <p>${e(d.emergency.text)}</p>${d.emergency.guide ? `<p class="muted">${e(d.emergency.guide)}</p>` : ""}</section>

  <section><h2>Analisis otomatis</h2>${d.analysis.length
    ? `<ul>${d.analysis.map((a) => `<li>${e(a)}</li>`).join("")}</ul>` : `<p class="muted">Belum cukup data untuk dianalisis.</p>`}</section>

  <section class="rpt-tx"><h2>Daftar transaksi (${d.transactions.length})</h2>${d.transactions.length
    ? table(["Tanggal", "Jenis", "Nama", "Kategori/pos", "Pencatat", "Nominal"], d.transactions.map((t) => [
      e(t.date), e(t.type), e(t.name), e(t.detail), e(t.who), `${t.sign}${rp(t.amount)}`]), [5])
    : `<p class="muted">Tidak ada transaksi.</p>`}</section>`;
}
