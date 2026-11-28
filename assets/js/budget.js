import { state, subscribe, catName } from "./store.js";
import { saveBudget, deleteBudget, copyBudgets, ledgerErrorMessage } from "./ledger.js";
import { periodTotals, budgetStatus, budgetLabel } from "./balance.js";
import { openModal, confirmModal, toast, setLoading, emptyState, bindAmountInput } from "./ui.js";
import { escapeHtml, formatRupiah, parseAmount, todayJakarta, addMonths, monthLabel, monthStart, monthEnd } from "./utils.js";

export function budgetRows(monthId) {
  const t = periodTotals(state.ledger, monthStart(monthId), monthEnd(monthId));
  return state.budgets.filter((b) => b.monthId === monthId).map((b) => {
    const actual = t.byCategory[b.categoryId] || 0;
    return { ...b, actual, ...budgetStatus(b.limitAmount, actual) };
  }).sort((a, b) => b.pct - a.pct);
}

export function warningText(r) {
  const head = r.remaining < 0 ? `sudah melewati batas (${r.pctLabel}%)` : `sudah mencapai ${r.pctLabel}%`;
  return `Anggaran ${catName(r.categoryId)} ${head}. Pengeluaran ${formatRupiah(r.actual)} dari anggaran ${formatRupiah(r.limitAmount)}. ` +
    (r.remaining >= 0 ? `Sisa ${formatRupiah(r.remaining)}.` : `Melebihi anggaran ${formatRupiah(-r.remaining)}.`);
}

export function mountBudget(el, ctx) {
  let month = todayJakarta().slice(0, 7);
  el.innerHTML = `
    <div class="toolbar">
      <div class="month-nav"><button class="btn btn-ghost" id="b-prev" aria-label="Bulan sebelumnya">&lsaquo;</button>
        <strong id="b-label"></strong><button class="btn btn-ghost" id="b-next" aria-label="Bulan berikutnya">&rsaquo;</button></div>
      <button class="btn btn-ghost" id="b-copy">Salin dari bulan lalu</button>
      <button class="btn btn-primary" id="b-add">Tambah anggaran</button>
    </div>
    <div id="b-warn"></div><div id="b-body"></div>`;
  const $ = (id) => el.querySelector(id);

  function render() {
    $("#b-label").textContent = monthLabel(month);
    const rows = budgetRows(month);
    const warn = rows.filter((r) => r.pct >= 75);
    $("#b-warn").innerHTML = warn.map((r) => `<div class="alert alert-${r.level}">${escapeHtml(warningText(r))}</div>`).join("");
    const limit = rows.reduce((s, r) => s + r.limitAmount, 0), actual = rows.reduce((s, r) => s + r.actual, 0);
    const total = budgetStatus(limit, actual);
    $("#b-body").innerHTML = rows.length ? `
      <section class="card stack"><div class="kv"><dt>Total anggaran</dt><dd>${formatRupiah(limit)}</dd>
        <dt>Terpakai</dt><dd>${formatRupiah(actual)} (${total.pctLabel}%)</dd>
        <dt>Sisa</dt><dd>${formatRupiah(total.remaining)}</dd></div></section>
      <div class="budget-list">${rows.map((r) => `
        <section class="card budget-item" data-id="${escapeHtml(r.id)}">
          <div class="row-between"><strong>${escapeHtml(catName(r.categoryId))}</strong><span class="pill lvl-${r.level}">${budgetLabel(r)}</span></div>
          <div class="progress" role="progressbar" aria-valuenow="${Math.min(100, r.pctLabel)}" aria-valuemin="0" aria-valuemax="100">
            <span class="bar lvl-${r.level}" style="width:${Math.min(100, r.pct)}%"></span></div>
          <div class="kv small"><dt>Batas</dt><dd>${formatRupiah(r.limitAmount)}</dd><dt>Terpakai</dt><dd>${formatRupiah(r.actual)} (${r.pctLabel}%)</dd>
            <dt>${r.remaining >= 0 ? "Sisa" : "Melebihi"}</dt><dd>${formatRupiah(Math.abs(r.remaining))}</dd>
            <dt>Peringatan</dt><dd>${r.thresholds.join("%, ")}%</dd></div>
          <div class="actions"><button class="btn-link" data-act="edit">Ubah</button><button class="btn-link danger" data-act="delete">Hapus</button></div>
        </section>`).join("")}</div>`
      : emptyState("Belum ada anggaran bulan ini", "Tambahkan anggaran per kategori pengeluaran, atau salin dari bulan lalu.");
  }

  function openForm(budget = null) {
    const used = new Set(state.budgets.filter((b) => b.monthId === month).map((b) => b.categoryId));
    const cats = state.categories.filter((c) => c.type === "expense" && (budget ? c.id === budget.categoryId : c.isActive !== false && !used.has(c.id)))
      .sort((a, b) => a.name.localeCompare(b.name, "id"));
    if (!cats.length) { toast("Semua kategori pengeluaran sudah punya anggaran bulan ini.", "error"); return; }
    const { el: f, close } = openModal({
      title: budget ? "Ubah anggaran" : "Tambah anggaran",
      html: `<form id="b-form" novalidate>
        <div class="field"><label for="bf-cat">Kategori pengeluaran</label>
          <select id="bf-cat">${cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("")}</select></div>
        <div class="field"><label for="bf-limit">Batas anggaran (Rp)</label><input id="bf-limit" inputmode="numeric" autocomplete="off" placeholder="0"></div>
        <fieldset class="field"><legend>Peringatan pada</legend>
          ${[75, 90, 100].map((t) => `<label class="check"><input type="checkbox" name="th" value="${t}" checked> ${t}%</label>`).join("")}</fieldset>
        <div class="form-error" id="bf-error" role="alert" hidden></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Batal</button>
          <button type="submit" class="btn btn-primary" id="bf-save">Simpan</button></div></form>`,
    });
    if (budget) {
      f.querySelector("#bf-limit").value = String(budget.limitAmount).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
      f.querySelectorAll("[name=th]").forEach((c) => { c.checked = budget.thresholds.includes(Number(c.value)); });
    }
    bindAmountInput(f.querySelector("#bf-limit"));
    f.querySelector("#b-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector("#bf-error"); err.hidden = true;
      const btn = f.querySelector("#bf-save");
      setLoading(btn, true, "Menyimpan...");
      try {
        await saveBudget(ctx, {
          monthId: month, categoryId: f.querySelector("#bf-cat").value, limitAmount: parseAmount(f.querySelector("#bf-limit").value),
          thresholds: [...f.querySelectorAll("[name=th]:checked")].map((c) => Number(c.value)),
        });
        toast("Anggaran disimpan.", "success"); close();
      } catch (ex) { err.textContent = ledgerErrorMessage(ex); err.hidden = false; setLoading(btn, false); }
    });
  }

  $("#b-prev").addEventListener("click", () => { month = addMonths(month, -1); render(); });
  $("#b-next").addEventListener("click", () => { month = addMonths(month, 1); render(); });
  $("#b-add").addEventListener("click", () => openForm());
  $("#b-copy").addEventListener("click", async () => {
    try { const n = await copyBudgets(ctx, addMonths(month, -1), month); toast(`${n} anggaran disalin.`, "success"); }
    catch (ex) { toast(ledgerErrorMessage(ex), "error"); }
  });
  $("#b-body").addEventListener("click", async (ev) => {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    const b = state.budgets.find((x) => x.id === ev.target.closest(".budget-item")?.dataset.id);
    if (!act || !b) return;
    if (act === "edit") openForm(b);
    if (act === "delete" && await confirmModal({ title: "Hapus anggaran?", message: `Anggaran ${catName(b.categoryId)} ${monthLabel(b.monthId)} akan dihapus.`, confirmText: "Hapus" })) {
      try { await deleteBudget(ctx, b); toast("Anggaran dihapus.", "success"); } catch (ex) { toast(ledgerErrorMessage(ex), "error"); }
    }
  });
  render();
  return subscribe(render);
}
