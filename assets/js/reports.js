import { state, subscribe, catName } from "./store.js";
import { monthSummary, periodTotals, totalSavings, analyze, buildReport } from "./balance.js";
import { budgetRows } from "./budget.js";
import { mountTransactions } from "./transactions.js";
import { chartHost, barConfig, lineConfig, doughnutConfig } from "./charts.js";
import { emptyState, toast } from "./ui.js";
import {
  escapeHtml, formatRupiah, formatDateStr, todayJakarta, addMonths, addDays, weekStart, monthEnd, monthLabel,
  shortMonthLabel, downloadCsv,
} from "./utils.js";

function summaryTab(el) {
  const charts = chartHost();
  let month = todayJakarta().slice(0, 7);
  el.innerHTML = `<div class="toolbar"><div class="month-nav"><button class="btn btn-ghost" id="r-prev" aria-label="Bulan sebelumnya">&lsaquo;</button>
    <strong id="r-label"></strong><button class="btn btn-ghost" id="r-next" aria-label="Bulan berikutnya">&rsaquo;</button></div></div>
    <section class="card stack"><h2>Analisis otomatis</h2><ul class="plain-list" id="r-analysis"></ul></section>
    <div class="chart-grid wide">
      ${[["r-inc", "Pemasukan bulanan"], ["r-exp", "Pengeluaran bulanan"], ["r-cmp", "Perbandingan pemasukan dan pengeluaran"],
        ["r-cat", "Pengeluaran berdasarkan kategori"], ["r-bal", "Perkembangan saldo"], ["r-sav", "Perkembangan tabungan"], ["r-bud", "Anggaran dan realisasi"]]
        .map(([id, t]) => `<section class="card"><h2>${t}</h2><div class="chart-box"><canvas id="${id}"></canvas></div></section>`).join("")}
    </div>`;
  const $ = (id) => el.querySelector(id);

  function render() {
    $("#r-label").textContent = monthLabel(month);
    const items = analyze({ entries: state.ledger, monthId: month, budgets: state.budgets, catName });
    $("#r-analysis").innerHTML = items.length ? items.map((s) => `<li>${escapeHtml(s)}</li>`).join("")
      : `<li class="muted">Belum cukup data untuk dianalisis pada bulan ini.</li>`;
    const ms = Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11));
    const sums = ms.map((m) => monthSummary(state.ledger, m));
    const labels = ms.map(shortMonthLabel);
    charts.draw("r-inc", barConfig(labels, [{ label: "Pemasukan", data: sums.map((s) => s.income), color: 1 }]));
    charts.draw("r-exp", barConfig(labels, [{ label: "Pengeluaran", data: sums.map((s) => s.expense), color: 6 }]));
    charts.draw("r-cmp", barConfig(labels, [{ label: "Pemasukan", data: sums.map((s) => s.income), color: 1 }, { label: "Pengeluaran", data: sums.map((s) => s.expense), color: 6 }]));
    charts.draw("r-bal", lineConfig(labels, [{ label: "Saldo akhir bulan", data: sums.map((s) => s.closing), fill: false }]));
    charts.draw("r-sav", lineConfig(labels, [{ label: "Total tabungan", data: ms.map((m) => totalSavings(state.ledger, monthEnd(m))), fill: false, color: 1 }]));
    const cur = periodTotals(state.ledger, `${month}-01`, monthEnd(month));
    const cats = Object.entries(cur.byCategory).sort((a, b) => b[1] - a[1]);
    if (cats.length) charts.draw("r-cat", doughnutConfig(cats.map(([id]) => catName(id)), cats.map(([, v]) => v)));
    else { const c = $("#r-cat"); if (c) c.parentElement.innerHTML = `<p class="muted">Belum ada pengeluaran bulan ini.</p>`; }
    const rows = budgetRows(month);
    if (rows.length) charts.draw("r-bud", barConfig(rows.map((r) => catName(r.categoryId)), [
      { label: "Anggaran", data: rows.map((r) => r.limitAmount), color: 0 }, { label: "Realisasi", data: rows.map((r) => r.actual), color: 2 }]));
    else { const c = $("#r-bud"); if (c) c.parentElement.innerHTML = `<p class="muted">Belum ada anggaran pada bulan ini.</p>`; }
  }
  $("#r-prev").addEventListener("click", () => { month = addMonths(month, -1); render(); });
  $("#r-next").addEventListener("click", () => { month = addMonths(month, 1); render(); });
  render();
  const off = subscribe(render);
  return () => { off(); charts.destroy(); };
}

function tableTab(el) {
  const today = todayJakarta();
  const f = { kind: "bulanan", from: `${today.slice(0, 4)}-01-01`, to: today };
  el.innerHTML = `<div class="toolbar">
    <select id="t-kind" aria-label="Jenis laporan"><option value="harian">Harian</option><option value="mingguan">Mingguan</option>
      <option value="bulanan">Bulanan</option><option value="tahunan">Tahunan</option><option value="kategori">Berdasarkan kategori</option></select>
    <label class="inline-date">Dari <input id="t-from" type="date"></label><label class="inline-date">Sampai <input id="t-to" type="date"></label>
    <button class="btn btn-ghost" id="t-csv">Ekspor CSV</button></div><div id="t-body"></div>`;
  const $ = (id) => el.querySelector(id);
  $("#t-kind").value = f.kind; $("#t-from").value = f.from; $("#t-to").value = f.to;
  const cell = (v) => (typeof v === "number" ? formatRupiah(v) : escapeHtml(v));

  function render() {
    if (f.from > f.to) { $("#t-body").innerHTML = `<div class="alert alert-red">Tanggal awal tidak boleh setelah tanggal akhir.</div>`; return; }
    const r = buildReport(state.ledger, f.kind, f.from, f.to, catName);
    $("#t-body").innerHTML = r.rows.length ? `<div class="table-wrap"><table class="report"><thead><tr>${r.headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>${r.rows.map((row) => `<tr>${row.map((c) => `<td>${cell(c)}</td>`).join("")}</tr>`).join("")}</tbody>
      ${r.totals ? `<tfoot><tr>${r.totals.map((c) => `<th>${cell(c)}</th>`).join("")}</tr></tfoot>` : ""}</table></div>`
      : emptyState("Tidak ada data", "Tidak ada transaksi pada rentang tanggal ini.");
  }
  $("#t-kind").addEventListener("change", (e) => { f.kind = e.target.value; render(); });
  $("#t-from").addEventListener("change", (e) => { f.from = e.target.value; render(); });
  $("#t-to").addEventListener("change", (e) => { f.to = e.target.value; render(); });
  $("#t-csv").addEventListener("click", () => {
    const r = buildReport(state.ledger, f.kind, f.from, f.to, catName);
    if (!r.rows.length) { toast("Tidak ada data untuk diekspor.", "error"); return; }
    downloadCsv(`laporan-${f.kind}-${f.from}-${f.to}.csv`, [r.headers, ...r.rows, ...(r.totals ? [r.totals] : [])]);
  });
  render();
  return subscribe(render);
}

export function mountReports(el, ctx) {
  const TABS = [["ringkasan", "Ringkasan"], ["laporan", "Laporan"], ["riwayat", "Riwayat transaksi"]];
  let tab = "ringkasan", cleanup = null;
  el.innerHTML = `<div class="tabs" role="tablist">${TABS.map(([id, t]) => `<button role="tab" class="tab" data-tab="${id}">${t}</button>`).join("")}</div><div id="r-content"></div>`;
  const content = el.querySelector("#r-content");
  function show() {
    cleanup?.(); cleanup = null;
    el.querySelectorAll(".tab").forEach((b) => { b.classList.toggle("active", b.dataset.tab === tab); b.setAttribute("aria-selected", b.dataset.tab === tab); });
    if (tab === "ringkasan") cleanup = summaryTab(content);
    else if (tab === "laporan") cleanup = tableTab(content);
    else cleanup = mountTransactions(content, ctx, { mode: "all" });
  }
  el.querySelector(".tabs").addEventListener("click", (e) => { const t = e.target.closest("[data-tab]")?.dataset.tab; if (t && t !== tab) { tab = t; show(); } });
  show();
  return () => cleanup?.();
}
