import { state, subscribe, catName } from "./store.js";
import { periodTotals, mainBalanceThrough, totalSavings, topCategory, budgetStatus } from "./balance.js";
import { budgetRows } from "./budget.js";
import { chartHost, barConfig, lineConfig, doughnutConfig } from "./charts.js";
import { amountCell } from "./transactions.js";
import { openOpeningForm } from "./settings.js";
import { emptyState } from "./ui.js";
import {
  escapeHtml, formatRupiah, formatDateStr, formatDateTime, todayJakarta, monthStart, monthEnd, addMonths,
  monthsBetween, daysBetween, shortMonthLabel, monthLabel,
} from "./utils.js";

const tsOf = (e) => e.createdAt?.toMillis?.() ?? Date.now();

export function mountDashboard(el, ctx) {
  const charts = chartHost();
  const today = todayJakarta();
  const cm = today.slice(0, 7);
  let period = "month";
  el.innerHTML = `
    <div class="toolbar">
      <select id="d-period" aria-label="Periode">
        <option value="month">Bulan ini</option><option value="prev">Bulan sebelumnya</option>
        <option value="year">Tahun ini</option><option value="custom">Pilih periode sendiri</option></select>
      <span id="d-custom" class="row-gap" hidden>
        <label class="inline-date">Dari <input id="d-from" type="date"></label>
        <label class="inline-date">Sampai <input id="d-to" type="date"></label></span>
      <span class="muted" id="d-range"></span>
    </div>
    <div id="d-body"></div>`;
  const $ = (id) => el.querySelector(id);
  $("#d-from").value = monthStart(cm);
  $("#d-to").value = today;

  function range() {
    if (period === "prev") { const p = addMonths(cm, -1); return [monthStart(p), monthEnd(p)]; }
    if (period === "year") return [`${cm.slice(0, 4)}-01-01`, `${cm.slice(0, 4)}-12-31`];
    if (period === "custom") return [$("#d-from").value || monthStart(cm), $("#d-to").value || today];
    return [monthStart(cm), monthEnd(cm)];
  }

  function buckets(from, to) {
    const days = (new Date(to) - new Date(from)) / 864e5 + 1;
    if (days <= 31) return { keys: daysBetween(from, to), label: (k) => k.slice(8), keyOf: (e) => e.date };
    const keys = monthsBetween(from.slice(0, 7), to.slice(0, 7)).slice(-12);
    return { keys, label: shortMonthLabel, keyOf: (e) => e.date.slice(0, 7) };
  }

  function render() {
    const [from, to] = range();
    if (from > to) { $("#d-body").innerHTML = `<div class="alert alert-red">Tanggal awal tidak boleh setelah tanggal akhir.</div>`; return; }
    $("#d-range").textContent = `${formatDateStr(from)} sampai ${formatDateStr(to)}`;
    const led = state.ledger;
    const t = periodTotals(led, from, to);
    const main = mainBalanceThrough(led, today);
    const saved = totalSavings(led, today);

    let limit = 0, actual = 0;
    for (const m of monthsBetween(from.slice(0, 7), to.slice(0, 7))) for (const r of budgetRows(m)) { limit += r.limitAmount; actual += r.actual; }
    const bs = budgetStatus(limit, actual);
    const top = topCategory(t.byCategory);
    const hasOpening = led.some((e) => e.type === "opening_balance" && e.status !== "deleted");

    const recent = led.filter((e) => e.status !== "deleted")
      .sort((a, b) => (a.date === b.date ? tsOf(b) - tsOf(a) : a.date < b.date ? 1 : -1)).slice(0, 5);
    const partner = state.notifications.filter((n) => n.actorUid !== ctx.user.uid && n.type === "activity").slice(0, 5);
    const latest = state.notifications.slice(0, 5);
    const noteList = (arr, empty) => arr.length ? `<ul class="plain-list">${arr.map((n) => `<li>${escapeHtml(n.message)}
      <span class="muted small">${n.createdAt?.toDate ? formatDateTime(n.createdAt.toDate()) : "baru saja"}</span></li>`).join("")}</ul>` : `<p class="muted">${empty}</p>`;

    $("#d-body").innerHTML = `
      ${hasOpening ? "" : `<div class="alert alert-yellow row-between"><span>Saldo awal belum diatur. Isi agar saldo utama sesuai kondisi sebenarnya.</span>
        <button class="btn btn-primary" id="d-opening">Atur saldo awal</button></div>`}
      <div class="cards">
        <section class="card stat"><span class="muted">Saldo utama saat ini</span><strong class="${main < 0 ? "minus" : ""}">${formatRupiah(main)}</strong></section>
        <section class="card stat"><span class="muted">Pemasukan</span><strong class="plus">${formatRupiah(t.income)}</strong></section>
        <section class="card stat"><span class="muted">Pengeluaran</span><strong class="minus">${formatRupiah(t.expense)}</strong></section>
        <section class="card stat"><span class="muted">Total tabungan</span><strong>${formatRupiah(saved)}</strong></section>
        <section class="card stat"><span class="muted">Sisa anggaran</span><strong class="${limit && bs.remaining < 0 ? "minus" : ""}">${limit ? formatRupiah(bs.remaining) : "Belum diatur"}</strong></section>
      </div>
      <div class="cards three">
        <section class="card stat"><span class="muted">Pengeluaran terbesar</span>
          <strong>${t.largestExpense ? formatRupiah(t.largestExpense.amount) : "-"}</strong>
          <span class="muted small">${t.largestExpense ? escapeHtml(t.largestExpense.name) : "Belum ada pengeluaran"}</span></section>
        <section class="card stat"><span class="muted">Kategori pengeluaran terbesar</span>
          <strong>${top ? escapeHtml(catName(top.id)) : "-"}</strong>
          <span class="muted small">${top ? `${formatRupiah(top.amount)} (${Math.round((top.amount * 100) / t.expense)}% dari pengeluaran)` : ""}</span></section>
        <section class="card stat"><span class="muted">Penggunaan anggaran</span>
          <strong>${limit ? `${bs.pctLabel}%` : "-"}</strong>
          ${limit ? `<div class="progress"><span class="bar lvl-${bs.level}" style="width:${Math.min(100, bs.pct)}%"></span></div>
            <span class="muted small">${formatRupiah(actual)} dari ${formatRupiah(limit)}</span>` : `<span class="muted small">Atur di menu Anggaran</span>`}</section>
      </div>
      <div class="chart-grid">
        <section class="card"><h2>Pemasukan dan pengeluaran</h2><div class="chart-box"><canvas id="c-flow"></canvas></div></section>
        <section class="card"><h2>Pengeluaran per kategori</h2><div class="chart-box">${t.expense ? `<canvas id="c-cat"></canvas>` : `<p class="muted">Belum ada pengeluaran pada periode ini.</p>`}</div></section>
        <section class="card"><h2>Perkembangan tabungan</h2><div class="chart-box"><canvas id="c-sav"></canvas></div></section>
      </div>
      <div class="list-grid">
        <section class="card"><h2>Transaksi terbaru</h2>${recent.length ? `<ul class="plain-list">${recent.map((e) => `<li class="row-between">
          <span><strong>${escapeHtml(e.name)}</strong><span class="muted small block">${formatDateStr(e.date)}, ${escapeHtml(e.createdByName || "")}</span></span>${amountCell(e)}</li>`).join("")}</ul>`
          : emptyState("Belum ada transaksi", "Mulai dengan tombol + di pojok layar.")}</section>
        <section class="card"><h2>Aktivitas pasangan</h2>${noteList(partner, "Belum ada aktivitas dari pasangan.")}</section>
        <section class="card"><h2>Notifikasi terbaru</h2>${noteList(latest, "Belum ada notifikasi.")}</section>
      </div>`;

    const b = buckets(from, to);
    const inc = Object.fromEntries(b.keys.map((k) => [k, 0])), exp = { ...inc };
    for (const e of led) {
      if (e.status === "deleted" || e.date < from || e.date > to) continue;
      const k = b.keyOf(e);
      if (!(k in inc)) continue;
      if (e.type === "income") inc[k] += e.amount;
      if (e.type === "expense") exp[k] += e.amount;
    }
    charts.draw("c-flow", barConfig(b.keys.map(b.label), [
      { label: "Pemasukan", data: b.keys.map((k) => inc[k]), color: 1 }, { label: "Pengeluaran", data: b.keys.map((k) => exp[k]), color: 6 }]));

    const cats = Object.entries(t.byCategory).sort((a, c) => c[1] - a[1]);
    const head = cats.slice(0, 7), rest = cats.slice(7).reduce((s, c) => s + c[1], 0);
    const labels = head.map(([id]) => catName(id)), values = head.map(([, v]) => v);
    if (rest) { labels.push("Lainnya"); values.push(rest); }
    if (t.expense) charts.draw("c-cat", doughnutConfig(labels, values));

    const ms = [-5, -4, -3, -2, -1, 0].map((n) => addMonths(cm, n));
    charts.draw("c-sav", lineConfig(ms.map(shortMonthLabel), [{
      label: "Total tabungan", fill: false,
      data: ms.map((m) => totalSavings(led, m === cm ? today : monthEnd(m))),
    }]));
  }

  $("#d-period").addEventListener("change", (e) => { period = e.target.value; $("#d-custom").hidden = period !== "custom"; render(); });
  $("#d-from").addEventListener("change", render);
  $("#d-to").addEventListener("change", render);
  el.addEventListener("click", (e) => { if (e.target.id === "d-opening") openOpeningForm(ctx); });
  render();
  const off = subscribe(render);
  return () => { off(); charts.destroy(); };
}
