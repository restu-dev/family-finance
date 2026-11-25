// Daftar transaksi (pemasukan, pengeluaran, atau seluruh riwayat) + form tambah/ubah/hapus.
import { state, subscribe, catName, goalName } from "./store.js";
import {
  addEntry, updateEntry, deleteEntry, ledgerErrorMessage, PAYMENT_METHODS, TYPE_LABEL,
} from "./ledger.js";
import { openModal, confirmModal, toast, setLoading, emptyState, bindAmountInput } from "./ui.js";
import {
  escapeHtml, formatRupiah, formatDateStr, formatDateTime, todayJakarta, parseAmount, uuid, downloadCsv,
} from "./utils.js";

const PAGE = 25;
const PLUS = ["income", "savings_withdraw", "opening_balance"];
const MINUS = ["expense", "savings_deposit"];
const tsOf = (e) => e.createdAt?.toMillis?.() ?? Date.now();

export function amountCell(e) {
  if (PLUS.includes(e.type)) return `<span class="plus">+${formatRupiah(e.amount)}</span>`;
  if (MINUS.includes(e.type)) return `<span class="minus">-${formatRupiah(e.amount)}</span>`;
  return `<span class="neutral">${formatRupiah(e.amount)}</span>`;
}

function detailLine(e) {
  if (e.type === "income" || e.type === "expense") return escapeHtml(catName(e.categoryId)) + (e.paymentMethod ? `<span>${escapeHtml(e.paymentMethod)}</span>` : "");
  if (e.type === "savings_transfer") return `${escapeHtml(goalName(e.savingsId))} ke ${escapeHtml(goalName(e.toSavingsId))}`;
  if (e.savingsId) return escapeHtml(goalName(e.savingsId));
  return "";
}

export function openAddChooser(ctx) {
  const m = openModal({
    title: "Catat transaksi",
    html: `<div class="chooser">
      <button class="btn btn-primary btn-block" data-type="expense">Catat pengeluaran</button>
      <button class="btn btn-ghost btn-block" data-type="income">Catat pemasukan</button></div>`,
  });
  m.el.addEventListener("click", (e) => {
    const t = e.target.closest("[data-type]")?.dataset.type;
    if (t) { m.close(); openEntryForm(ctx, { type: t }); }
  });
}

export function openEntryForm(ctx, { type, entry = null }) {
  const editing = !!entry;
  const cats = state.categories
    .filter((c) => c.type === type && (c.isActive !== false || c.id === entry?.categoryId))
    .sort((a, b) => a.name.localeCompare(b.name, "id"));
  if (!cats.length) { toast("Belum ada kategori. Tunggu sebentar atau tambahkan di Pengaturan.", "error"); return; }

  const requestId = uuid();
  const label = TYPE_LABEL[type].toLowerCase();
  const { el, close } = openModal({
    title: `${editing ? "Ubah" : "Tambah"} ${label}`,
    html: `<form id="entry-form" novalidate>
      <div class="field"><label for="f-date">Tanggal</label><input id="f-date" type="date" required></div>
      <div class="field"><label for="f-name">Nama transaksi</label><input id="f-name" type="text" maxlength="100" required></div>
      <div class="field"><label for="f-cat">Kategori</label>
        <select id="f-cat">${cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}${c.isActive === false ? " (nonaktif)" : ""}</option>`).join("")}</select></div>
      <div class="field"><label for="f-amount">Nominal (Rp)</label><input id="f-amount" inputmode="numeric" autocomplete="off" placeholder="0" required></div>
      ${type === "expense" ? `<div class="field"><label for="f-pay">Metode pembayaran</label>
        <select id="f-pay">${PAYMENT_METHODS.map((p) => `<option>${p}</option>`).join("")}</select></div>` : ""}
      <div class="field"><label for="f-desc">Keterangan (opsional)</label><textarea id="f-desc" maxlength="300" rows="2"></textarea></div>
      <div class="form-error" id="f-error" role="alert" hidden></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Batal</button>
        <button type="submit" class="btn btn-primary" id="f-save">Simpan</button></div></form>`,
  });
  const $ = (id) => el.querySelector(id);
  $("#f-date").value = entry?.date || todayJakarta();
  $("#f-name").value = entry?.name || "";
  $("#f-cat").value = entry?.categoryId || cats[0].id;
  $("#f-amount").value = entry ? String(entry.amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
  if (type === "expense") $("#f-pay").value = entry?.paymentMethod || PAYMENT_METHODS[0];
  $("#f-desc").value = entry?.description || "";
  bindAmountInput($("#f-amount"));
  $("#f-name").focus();

  el.querySelector("#entry-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#f-error"); err.hidden = true;
    const input = {
      type, date: $("#f-date").value, name: $("#f-name").value, categoryId: $("#f-cat").value,
      amount: parseAmount($("#f-amount").value), description: $("#f-desc").value,
      ...(type === "expense" ? { paymentMethod: $("#f-pay").value } : {}),
    };
    const btn = $("#f-save");
    setLoading(btn, true, "Menyimpan...");
    try {
      if (editing) await updateEntry(ctx, entry, input);
      else await addEntry(ctx, { ...input, id: requestId });
      toast(editing ? "Perubahan disimpan." : "Transaksi disimpan.", "success");
      close();
    } catch (ex) {
      err.textContent = ledgerErrorMessage(ex); err.hidden = false;
      setLoading(btn, false);
    }
  });
}

export function openDetail(e) {
  const rows = [
    ["Jenis", TYPE_LABEL[e.type]], ["Tanggal", formatDateStr(e.date)], ["Nama", e.name],
    ...(e.categoryId ? [["Kategori", catName(e.categoryId)]] : []),
    ...(e.savingsId ? [["Pos tabungan", goalName(e.savingsId) + (e.toSavingsId ? ` ke ${goalName(e.toSavingsId)}` : "")]] : []),
    ["Nominal", formatRupiah(e.amount)],
    ...(e.paymentMethod ? [["Metode pembayaran", e.paymentMethod]] : []),
    ["Keterangan", e.description || "-"],
    ["Dicatat oleh", e.createdByName || "-"],
    ["Dicatat pada", e.createdAt?.toDate ? formatDateTime(e.createdAt.toDate()) : "-"],
    ["Terakhir diubah", e.updatedAt?.toDate ? formatDateTime(e.updatedAt.toDate()) : "-"],
  ];
  const m = openModal({
    title: "Detail transaksi",
    html: `<dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join("")}</dl>
      <div class="modal-actions"><button class="btn btn-ghost" data-close>Tutup</button></div>`,
  });
  return m;
}

// mode: "income" | "expense" | "all"
export function mountTransactions(el, ctx, { mode }) {
  const f = { q: "", from: "", to: "", cat: "", user: "", type: "", sort: "desc", page: 1 };
  el.innerHTML = `
    <div class="toolbar">
      <input id="tx-q" type="search" placeholder="Cari transaksi" aria-label="Cari transaksi">
      ${mode === "all" ? `<select id="tx-type" aria-label="Jenis transaksi"><option value="">Semua jenis</option>
        ${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>` : ""}
      <select id="tx-cat" aria-label="Kategori"></select>
      <select id="tx-user" aria-label="Pengguna"></select>
      <label class="inline-date">Dari <input id="tx-from" type="date"></label>
      <label class="inline-date">Sampai <input id="tx-to" type="date"></label>
      <select id="tx-sort" aria-label="Urutan"><option value="desc">Terbaru</option><option value="asc">Terlama</option></select>
      <button class="btn btn-ghost" id="tx-csv">Ekspor CSV</button>
      ${mode !== "all" ? `<button class="btn btn-primary" id="tx-add">Tambah ${mode === "income" ? "pemasukan" : "pengeluaran"}</button>` : ""}
    </div>
    <p class="muted" id="tx-summary"></p>
    <div class="tx-list" id="tx-list"></div>
    <div class="center" id="tx-more"></div>`;
  const $ = (id) => el.querySelector(id);

  function fillSelects() {
    const cats = state.categories.filter((c) => mode === "all" || c.type === mode).sort((a, b) => a.name.localeCompare(b.name, "id"));
    $("#tx-cat").innerHTML = `<option value="">Semua kategori</option>` +
      cats.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join("");
    $("#tx-cat").value = f.cat;
    $("#tx-user").innerHTML = `<option value="">Semua pengguna</option>` +
      state.members.map((m) => `<option value="${escapeHtml(m.uid)}">${escapeHtml(m.displayName)}</option>`).join("");
    $("#tx-user").value = f.user;
  }

  function filtered() {
    const q = f.q.trim().toLowerCase();
    return state.ledger.filter((e) => {
      if (e.status === "deleted") return false;
      if (mode !== "all" && e.type !== mode) return false;
      if (f.type && e.type !== f.type) return false;
      if (f.from && e.date < f.from) return false;
      if (f.to && e.date > f.to) return false;
      if (f.cat && e.categoryId !== f.cat) return false;
      if (f.user && e.createdBy !== f.user) return false;
      if (q) {
        const hay = [e.name, e.description, e.categoryId ? catName(e.categoryId) : "", e.createdByName, TYPE_LABEL[e.type]].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    }).sort((a, b) => (a.date === b.date ? tsOf(a) - tsOf(b) : a.date < b.date ? -1 : 1) * (f.sort === "desc" ? -1 : 1));
  }

  function renderList() {
    const rows = filtered();
    const inc = rows.filter((e) => e.type === "income").reduce((s, e) => s + e.amount, 0);
    const exp = rows.filter((e) => e.type === "expense").reduce((s, e) => s + e.amount, 0);
    $("#tx-summary").textContent = rows.length
      ? `${rows.length} transaksi. Pemasukan ${formatRupiah(inc)}, pengeluaran ${formatRupiah(exp)}.` : "";
    const shown = rows.slice(0, f.page * PAGE);
    $("#tx-list").innerHTML = shown.length ? shown.map((e) => `
      <div class="tx-row" data-id="${escapeHtml(e.id)}">
        <div class="tx-date">${formatDateStr(e.date)}</div>
        <div class="tx-main"><strong>${escapeHtml(e.name)}</strong>
          <span class="tx-sub">${mode === "all" ? `<span class="pill">${TYPE_LABEL[e.type]}</span>` : ""}${detailLine(e)}</span></div>
        <div class="tx-user muted">${escapeHtml(e.createdByName || "")}</div>
        <div class="tx-amt">${amountCell(e)}</div>
        <div class="tx-act">
          <button class="btn-link" data-act="detail">Detail</button>
          ${["income", "expense"].includes(e.type) ? `<button class="btn-link" data-act="edit">Ubah</button>` : ""}
          ${e.type !== "opening_balance" ? `<button class="btn-link danger" data-act="delete">Hapus</button>` : ""}
        </div>
      </div>`).join("")
      : emptyState("Belum ada transaksi", rows.length === 0 && (f.q || f.from || f.to || f.cat || f.user || f.type)
        ? "Tidak ada transaksi yang cocok dengan filter." : "Transaksi yang dicatat akan muncul di sini.");
    $("#tx-more").innerHTML = rows.length > shown.length
      ? `<button class="btn btn-ghost" id="tx-more-btn">Tampilkan lebih banyak (${rows.length - shown.length})</button>` : "";
  }

  const onState = () => { fillSelects(); renderList(); };
  fillSelects(); renderList();
  const off = subscribe(onState);

  const bind = (id, key, ev = "input") => $(id)?.addEventListener(ev, (e) => { f[key] = e.target.value; f.page = 1; renderList(); });
  bind("#tx-q", "q"); bind("#tx-type", "type", "change"); bind("#tx-cat", "cat", "change"); bind("#tx-user", "user", "change");
  bind("#tx-from", "from", "change"); bind("#tx-to", "to", "change"); bind("#tx-sort", "sort", "change");
  $("#tx-add")?.addEventListener("click", () => openEntryForm(ctx, { type: mode }));
  $("#tx-more").addEventListener("click", (e) => { if (e.target.id === "tx-more-btn") { f.page++; renderList(); } });

  $("#tx-csv").addEventListener("click", () => {
    const rows = filtered();
    if (!rows.length) { toast("Tidak ada data untuk diekspor.", "error"); return; }
    downloadCsv(`transaksi-${todayJakarta()}.csv`, [
      ["Tanggal", "Jenis", "Nama", "Kategori", "Nominal", "Metode pembayaran", "Dicatat oleh", "Keterangan"],
      ...rows.map((e) => [formatDateStr(e.date), TYPE_LABEL[e.type], e.name, e.categoryId ? catName(e.categoryId) : "",
        e.amount, e.paymentMethod || "", e.createdByName || "", e.description || ""]),
    ]);
  });

  $("#tx-list").addEventListener("click", async (ev) => {
    const act = ev.target.closest("[data-act]")?.dataset.act;
    const id = ev.target.closest(".tx-row")?.dataset.id;
    const entry = state.ledger.find((e) => e.id === id);
    if (!act || !entry) return;
    if (act === "detail") openDetail(entry);
    if (act === "edit") openEntryForm(ctx, { type: entry.type, entry });
    if (act === "delete") {
      const ok = await confirmModal({
        title: "Hapus transaksi?", message: `${entry.name} (${formatRupiah(entry.amount)}) akan dihapus dan perhitungan saldo diperbarui.`,
        confirmText: "Hapus",
      });
      if (!ok) return;
      try { await deleteEntry(ctx, entry); toast("Transaksi dihapus.", "success"); }
      catch (ex) { toast(ledgerErrorMessage(ex), "error"); }
    }
  });
  return off;
}
