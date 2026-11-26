import { state, subscribe, goalName, personName } from "./store.js";
import { saveGoal, setGoalStatus, addEntry, ledgerErrorMessage } from "./ledger.js";
import { savingsBalances, mainBalanceThrough } from "./balance.js";
import { openModal, confirmModal, toast, setLoading, emptyState, bindAmountInput } from "./ui.js";
import { escapeHtml, formatRupiah, formatDateStr, parseAmount, todayJakarta, uuid } from "./utils.js";
import { openDetail } from "./transactions.js";

export function mountSavings(el, ctx) {
  el.innerHTML = `
    <div class="toolbar"><div class="muted" id="s-main"></div>
      <button class="btn btn-ghost" id="s-transfer">Transfer antarpos</button>
      <button class="btn btn-primary" id="s-add">Tambah pos tabungan</button></div>
    <div id="s-body"></div>`;
  const $ = (id) => el.querySelector(id);
  const activeGoals = () => state.goals.filter((g) => g.status !== "archived").sort((a, b) => a.name.localeCompare(b.name, "id"));

  function render() {
    const bal = savingsBalances(state.ledger);
    const total = Object.values(bal).reduce((a, b) => a + b, 0);
    $("#s-main").textContent = `Saldo utama ${formatRupiah(mainBalanceThrough(state.ledger, todayJakarta()))}. Total tabungan ${formatRupiah(total)}.`;
    const goals = activeGoals();
    $("#s-body").innerHTML = goals.length ? `<div class="goal-grid">${goals.map((g) => {
      const b = bal[g.id] || 0, pct = Math.max(0, Math.min(100, (b * 100) / g.targetAmount));
      return `<section class="card goal" data-id="${escapeHtml(g.id)}">
        <div class="row-between"><strong>${escapeHtml(g.name)}</strong>
          <span class="pill ${g.status === "achieved" ? "lvl-green" : ""}">${g.status === "achieved" ? "Tercapai" : "Aktif"}</span></div>
        <div class="goal-amount">${formatRupiah(b)}</div>
        <div class="progress" role="progressbar" aria-valuenow="${Math.floor(pct)}" aria-valuemin="0" aria-valuemax="100"><span class="bar lvl-${pct >= 100 ? "green" : "blue"}" style="width:${pct}%"></span></div>
        <div class="muted small">${Math.floor(pct)}% dari target ${formatRupiah(g.targetAmount)}${g.targetDate ? `, target ${formatDateStr(g.targetDate)}` : ""}</div>
        ${g.description ? `<p class="muted small">${escapeHtml(g.description)}</p>` : ""}
        <div class="actions"><button class="btn-link" data-act="deposit">Tambah dana</button><button class="btn-link" data-act="withdraw">Tarik dana</button>
          <button class="btn-link" data-act="history">Riwayat</button><button class="btn-link" data-act="edit">Ubah</button>
          <button class="btn-link danger" data-act="archive">Arsipkan</button></div></section>`;
    }).join("")}</div>` : emptyState("Belum ada pos tabungan", "Buat pos seperti Dana darurat atau Pendidikan anak, lalu pindahkan dana dari saldo utama.");
  }

  function goalForm(goal = null) {
    const { el: f, close } = openModal({
      title: goal ? "Ubah pos tabungan" : "Tambah pos tabungan",
      html: `<form id="g-form" novalidate>
        <div class="field"><label for="g-name">Nama pos</label><input id="g-name" maxlength="60" required></div>
        <div class="field"><label for="g-target">Target (Rp)</label><input id="g-target" inputmode="numeric" autocomplete="off" placeholder="0"></div>
        <div class="field"><label for="g-start">Tanggal mulai</label><input id="g-start" type="date"></div>
        <div class="field"><label for="g-end">Tanggal target (opsional)</label><input id="g-end" type="date"></div>
        <div class="field"><label for="g-desc">Keterangan (opsional)</label><textarea id="g-desc" rows="2" maxlength="300"></textarea></div>
        <div class="form-error" id="g-error" role="alert" hidden></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Batal</button>
          <button type="submit" class="btn btn-primary" id="g-save">Simpan</button></div></form>`,
    });
    f.querySelector("#g-name").value = goal?.name || "";
    f.querySelector("#g-target").value = goal ? String(goal.targetAmount).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
    f.querySelector("#g-start").value = goal?.startDate || todayJakarta();
    f.querySelector("#g-end").value = goal?.targetDate || "";
    f.querySelector("#g-desc").value = goal?.description || "";
    bindAmountInput(f.querySelector("#g-target"));
    f.querySelector("#g-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector("#g-error"); err.hidden = true;
      const btn = f.querySelector("#g-save"); setLoading(btn, true, "Menyimpan...");
      try {
        await saveGoal(ctx, { id: goal?.id, name: f.querySelector("#g-name").value, targetAmount: parseAmount(f.querySelector("#g-target").value),
          startDate: f.querySelector("#g-start").value, targetDate: f.querySelector("#g-end").value, description: f.querySelector("#g-desc").value });
        toast("Pos tabungan disimpan.", "success"); close();
      } catch (ex) { err.textContent = ledgerErrorMessage(ex); err.hidden = false; setLoading(btn, false); }
    });
  }

  // kind: "savings_deposit" | "savings_withdraw" | "savings_transfer"
  function moveForm(kind, goal = null) {
    const goals = activeGoals();
    if (!goals.length || (kind === "savings_transfer" && goals.length < 2)) {
      toast(kind === "savings_transfer" ? "Dibutuhkan minimal dua pos tabungan aktif." : "Buat pos tabungan terlebih dahulu.", "error"); return;
    }
    const title = { savings_deposit: "Tambah dana tabungan", savings_withdraw: "Tarik dana tabungan", savings_transfer: "Transfer antarpos" }[kind];
    const opts = (sel) => goals.map((g) => `<option value="${escapeHtml(g.id)}"${g.id === sel ? " selected" : ""}>${escapeHtml(g.name)}</option>`).join("");
    const { el: f, close } = openModal({
      title,
      html: `<form id="m-form" novalidate>
        <div class="field"><label for="m-from">${kind === "savings_transfer" ? "Dari pos" : "Pos tabungan"}</label><select id="m-from">${opts(goal?.id)}</select></div>
        ${kind === "savings_transfer" ? `<div class="field"><label for="m-to">Ke pos</label><select id="m-to">${opts(goals.find((g) => g.id !== goal?.id)?.id)}</select></div>` : ""}
        <div class="field"><label for="m-amount">Nominal (Rp)</label><input id="m-amount" inputmode="numeric" autocomplete="off" placeholder="0"></div>
        <div class="field"><label for="m-date">Tanggal</label><input id="m-date" type="date"></div>
        <p class="hint" id="m-hint"></p>
        <div class="form-error" id="m-error" role="alert" hidden></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Batal</button>
          <button type="submit" class="btn btn-primary" id="m-save">Simpan</button></div></form>`,
    });
    f.querySelector("#m-date").value = todayJakarta();
    bindAmountInput(f.querySelector("#m-amount"));
    const hint = () => {
      const bal = savingsBalances(state.ledger);
      f.querySelector("#m-hint").textContent = kind === "savings_deposit"
        ? `Saldo utama tersedia ${formatRupiah(mainBalanceThrough(state.ledger, f.querySelector("#m-date").value || todayJakarta()))}.`
        : `Saldo pos tersedia ${formatRupiah(bal[f.querySelector("#m-from").value] || 0)}.`;
    };
    f.querySelector("#m-from").addEventListener("change", hint); f.querySelector("#m-date").addEventListener("change", hint); hint();
    const requestId = uuid();
    f.querySelector("#m-form").addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const err = f.querySelector("#m-error"); err.hidden = true;
      const btn = f.querySelector("#m-save"); setLoading(btn, true, "Menyimpan...");
      try {
        await addEntry(ctx, { id: requestId, type: kind, date: f.querySelector("#m-date").value, name: "Tabungan",
          amount: parseAmount(f.querySelector("#m-amount").value), savingsId: f.querySelector("#m-from").value,
          ...(kind === "savings_transfer" ? { toSavingsId: f.querySelector("#m-to").value } : {}) });
        toast("Tersimpan.", "success"); close();
      } catch (ex) { err.textContent = ledgerErrorMessage(ex); err.hidden = false; setLoading(btn, false); }
    });
  }

  function history(goal) {
    const rows = state.ledger.filter((e) => e.status !== "deleted" && (e.savingsId === goal.id || e.toSavingsId === goal.id))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const sign = (e) => (e.type === "savings_deposit" || (e.type === "savings_transfer" && e.toSavingsId === goal.id) ? 1 : -1);
    const m = openModal({
      title: `Riwayat ${goal.name}`,
      html: rows.length ? `<div class="tx-list compact">${rows.map((e) => `
        <div class="tx-row" data-id="${escapeHtml(e.id)}"><div class="tx-date">${formatDateStr(e.date)}</div>
          <div class="tx-main"><strong>${escapeHtml(e.name)}</strong><span class="tx-sub">${escapeHtml(personName(e.createdBy, e.createdByName))}</span></div>
          <div class="tx-amt"><span class="${sign(e) > 0 ? "plus" : "minus"}">${sign(e) > 0 ? "+" : "-"}${formatRupiah(e.amount)}</span></div>
          <div class="tx-act"><button class="btn-link" data-act="detail">Detail</button></div></div>`).join("")}</div>`
        : emptyState("Belum ada riwayat", "Dana yang ditambah atau ditarik akan tercatat di sini."),
    });
    m.el.addEventListener("click", (ev) => {
      const id = ev.target.closest(".tx-row")?.dataset.id;
      const e = state.ledger.find((x) => x.id === id);
      if (ev.target.closest("[data-act=detail]") && e) openDetail(e);
    });
  }

  $("#s-add").addEventListener("click", () => goalForm());
  $("#s-transfer").addEventListener("click", () => moveForm("savings_transfer"));
  $("#s-body").addEventListener("click", async (ev) => {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    const g = state.goals.find((x) => x.id === ev.target.closest(".goal")?.dataset.id);
    if (!act || !g) return;
    if (act === "deposit") moveForm("savings_deposit", g);
    if (act === "withdraw") moveForm("savings_withdraw", g);
    if (act === "history") history(g);
    if (act === "edit") goalForm(g);
    if (act === "archive") {
      const bal = savingsBalances(state.ledger)[g.id] || 0;
      if (bal > 0) { toast(`Pos ${g.name} masih berisi ${formatRupiah(bal)}. Tarik atau transfer dananya dulu.`, "error"); return; }
      if (await confirmModal({ title: "Arsipkan pos tabungan?", message: `${g.name} akan disembunyikan. Riwayatnya tetap tersimpan dan bisa diaktifkan lagi di Pengaturan.`, confirmText: "Arsipkan" })) {
        try { await setGoalStatus(ctx, g, "archived"); toast("Pos diarsipkan.", "success"); } catch (ex) { toast(ledgerErrorMessage(ex), "error"); }
      }
    }
  });
  render();
  return subscribe(render);
}
