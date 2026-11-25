import { state, subscribe } from "./store.js";
import { db } from "./firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { regenerateInvite, familyErrorMessage } from "./family.js";
import { saveCategory, setCategoryActive, setGoalStatus, addEntry, updateEntry, ledgerErrorMessage } from "./ledger.js";
import { savingsBalances } from "./balance.js";
import { openModal, toast, setLoading, deferredRender, bindAmountInput } from "./ui.js";
import { escapeHtml, cleanText, formatDate, formatDateStr, formatInviteCode, formatRupiah, parseAmount, todayJakarta, uuid } from "./utils.js";

// Saldo awal akun dicatat sebagai entri ledger (bukan angka tersembunyi), sehingga ikut perhitungan saldo bulanan.
export function openOpeningForm(ctx) {
  const existing = state.ledger.find((e) => e.type === "opening_balance" && e.status !== "deleted");
  const { el, close } = openModal({
    title: existing ? "Ubah saldo awal" : "Atur saldo awal",
    html: `<form id="o-form" novalidate>
      <p class="muted">Isi total saldo seluruh rekening dan dompet keluarga pada tanggal mulai memakai aplikasi ini.</p>
      <div class="field"><label for="o-amount">Saldo awal (Rp)</label><input id="o-amount" inputmode="numeric" autocomplete="off" placeholder="0"></div>
      <div class="field"><label for="o-date">Tanggal</label><input id="o-date" type="date"></div>
      <div class="form-error" id="o-error" role="alert" hidden></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Batal</button>
        <button type="submit" class="btn btn-primary" id="o-save">Simpan</button></div></form>`,
  });
  el.querySelector("#o-amount").value = existing ? String(existing.amount).replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
  el.querySelector("#o-date").value = existing?.date || todayJakarta();
  bindAmountInput(el.querySelector("#o-amount"));
  const requestId = uuid();
  el.querySelector("#o-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = el.querySelector("#o-error"); err.hidden = true;
    const btn = el.querySelector("#o-save"); setLoading(btn, true, "Menyimpan...");
    const input = { date: el.querySelector("#o-date").value, amount: parseAmount(el.querySelector("#o-amount").value) };
    try {
      if (existing) await updateEntry(ctx, existing, input);
      else await addEntry(ctx, { id: requestId, type: "opening_balance", name: "Saldo awal", ...input });
      toast("Saldo awal disimpan.", "success"); close();
    } catch (ex) { err.textContent = ledgerErrorMessage(ex); err.hidden = false; setLoading(btn, false); }
  });
}

function nameModal(title, initial, onSave) {
  const { el, close } = openModal({
    title,
    html: `<form id="n-form" novalidate><div class="field"><label for="n-name">Nama</label><input id="n-name" maxlength="60"></div>
      <div class="form-error" id="n-error" role="alert" hidden></div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Batal</button>
        <button type="submit" class="btn btn-primary" id="n-save">Simpan</button></div></form>`,
  });
  el.querySelector("#n-name").value = initial;
  el.querySelector("#n-name").focus();
  el.querySelector("#n-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = el.querySelector("#n-error"); err.hidden = true;
    const btn = el.querySelector("#n-save"); setLoading(btn, true, "Menyimpan...");
    try { await onSave(el.querySelector("#n-name").value); close(); }
    catch (ex) { err.textContent = ledgerErrorMessage(ex); err.hidden = false; setLoading(btn, false); }
  });
}

export function mountSettings(el, ctx) {
  const me = ctx.user.uid;
  const toastOn = () => { try { return localStorage.getItem("ff_toast_partner") !== "off"; } catch { return true; } };

  function catSection(type, title) {
    const list = state.categories.filter((c) => c.type === type).sort((a, b) => a.name.localeCompare(b.name, "id"));
    return `<div><h3>${title}</h3>
      <ul class="member-list">${list.map((c) => `<li data-cat="${escapeHtml(c.id)}"><div><strong class="${c.isActive === false ? "muted" : ""}">${escapeHtml(c.name)}</strong>
        <span class="muted small">${c.isDefault ? "Bawaan" : "Buatan sendiri"}${c.isActive === false ? ", nonaktif" : ""}</span></div>
        <span class="actions"><button class="btn-link" data-act="cat-edit">Ubah</button>
        <button class="btn-link ${c.isActive === false ? "" : "danger"}" data-act="cat-toggle">${c.isActive === false ? "Aktifkan" : "Nonaktifkan"}</button></span></li>`).join("")}</ul>
      <form class="inline-form" data-addcat="${type}"><input placeholder="Kategori baru" maxlength="40" aria-label="Kategori baru ${title}"><button class="btn btn-ghost" type="submit">Tambah</button></form></div>`;
  }

  function render() {
    const fam = state.family;
    const members = state.members;
    const isOwner = fam?.ownerUid === me;
    const waiting = fam && fam.memberCount < 2;
    const opening = state.ledger.find((e) => e.type === "opening_balance" && e.status !== "deleted");
    const archived = state.goals.filter((g) => g.status === "archived");
    const bal = savingsBalances(state.ledger);

    el.innerHTML = `
    <section class="card stack"><h2>Profil pengguna</h2>
      <dl class="kv"><dt>Nama</dt><dd>${escapeHtml(ctx.profile.displayName)}</dd><dt>Email</dt><dd>${escapeHtml(ctx.user.email)}</dd></dl></section>

    <section class="card stack"><h2>Pengaturan keluarga</h2>
      ${fam ? `<dl class="kv"><dt>Nama keluarga</dt><dd>${escapeHtml(fam.name)}</dd><dt>Family ID</dt><dd><code>${escapeHtml(fam.id)}</code></dd>
        <dt>Anggota</dt><dd>${members.length} dari 2</dd></dl>
        ${isOwner ? `<form class="inline-form" id="fam-rename"><input id="fam-name" maxlength="60" value="${escapeHtml(fam.name)}" aria-label="Nama keluarga"><button class="btn btn-ghost" type="submit">Ubah nama</button></form>` : ""}
        ${waiting && isOwner ? `<div class="invite-box"><p class="muted">Bagikan kode ini ke pasangan. Kode hanya dapat dipakai satu kali.</p>
          <div class="code-row"><span class="code">${escapeHtml(formatInviteCode(fam.inviteCode))}</span><button class="btn btn-ghost" id="copy-code">Salin kode</button></div>
          <button class="btn-link" id="new-code">Buat kode baru</button></div>` : ""}
        ${!waiting ? `<p class="status-ok">Kedua anggota sudah terhubung. Data keuangan dibagikan bersama.</p>` : ""}
        <h3>Anggota keluarga</h3><ul class="member-list">${members.map((m) => `<li><div><strong>${escapeHtml(m.displayName)}${m.uid === me ? " (Anda)" : ""}</strong>
          <span class="muted small">Bergabung ${m.joinedAt?.toDate ? formatDate(m.joinedAt.toDate()) : "..."}</span></div>
          <span class="pill">${m.role === "owner" ? "Pemilik" : "Anggota"}</span></li>`).join("")}</ul>` : `<p class="muted">Data keluarga belum dapat dimuat.</p>`}
    </section>

    <section class="card stack"><h2>Saldo awal</h2>
      <p class="muted">${opening ? `Saldo awal ${formatRupiah(opening.amount)} per ${formatDateStr(opening.date)}.` : "Saldo awal belum diatur."}</p>
      <div><button class="btn btn-ghost" id="open-opening">${opening ? "Ubah saldo awal" : "Atur saldo awal"}</button></div></section>

    <section class="card stack"><h2>Kategori</h2><p class="muted">Kategori yang dinonaktifkan tidak muncul di form baru, tetapi transaksi lamanya tetap utuh.</p>
      <div class="grid-2">${catSection("income", "Pemasukan")}${catSection("expense", "Pengeluaran")}</div></section>

    <section class="card stack"><h2>Anggaran dan tabungan</h2>
      <p class="muted">Anggaran per kategori diatur di menu <a href="#anggaran">Anggaran</a>, dan pos tabungan di menu <a href="#tabungan">Tabungan</a>.</p>
      ${archived.length ? `<h3>Pos tabungan diarsipkan</h3><ul class="member-list">${archived.map((g) => `<li data-goal="${escapeHtml(g.id)}"><div><strong>${escapeHtml(g.name)}</strong>
        <span class="muted small">Saldo ${formatRupiah(bal[g.id] || 0)}</span></div><button class="btn-link" data-act="goal-restore">Aktifkan kembali</button></li>`).join("")}</ul>` : ""}</section>

    <section class="card stack"><h2>Notifikasi</h2>
      <label class="check"><input type="checkbox" id="toast-pref" ${toastOn() ? "checked" : ""}> Tampilkan pemberitahuan saat pasangan mencatat aktivitas</label>
      <p class="muted small">Notifikasi dalam aplikasi aktif. Notifikasi push browser belum diaktifkan.</p></section>

    <section class="card stack"><h2>Mata uang</h2>
      <p class="muted">Rupiah (IDR), format Rp1.000.000. Zona waktu Asia/Jakarta. Versi ini hanya mendukung IDR.</p></section>`;

    el.querySelector("#copy-code")?.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(formatInviteCode(fam.inviteCode)); toast("Kode disalin.", "success"); }
      catch { toast("Tidak dapat menyalin otomatis. Salin kode secara manual.", "error"); }
    });
    el.querySelector("#new-code")?.addEventListener("click", async () => {
      try { await regenerateInvite({ uid: me, familyId: fam.id, oldCode: fam.inviteCode }); toast("Kode baru dibuat.", "success"); }
      catch (err) { toast(familyErrorMessage(err, "create"), "error"); }
    });
    el.querySelector("#open-opening")?.addEventListener("click", () => openOpeningForm(ctx));
    el.querySelector("#toast-pref")?.addEventListener("change", (e) => { try { localStorage.setItem("ff_toast_partner", e.target.checked ? "on" : "off"); } catch { /* abaikan */ } });
    el.querySelector("#fam-rename")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = cleanText(el.querySelector("#fam-name").value, 60);
      if (name.length < 2) { toast("Nama keluarga minimal 2 karakter.", "error"); return; }
      try { await updateDoc(doc(db, "families", fam.id), { name }); toast("Nama keluarga diubah.", "success"); }
      catch (err) { toast(familyErrorMessage(err, "create"), "error"); }
    });
  }

  el.addEventListener("submit", async (e) => {
    const type = e.target.dataset?.addcat;
    if (!type) return;
    e.preventDefault();
    const input = e.target.querySelector("input");
    try { await saveCategory(ctx, { type, name: input.value }); input.value = ""; toast("Kategori ditambahkan.", "success"); }
    catch (ex) { toast(ledgerErrorMessage(ex), "error"); }
  });
  el.addEventListener("click", async (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    const cat = state.categories.find((c) => c.id === e.target.closest("[data-cat]")?.dataset.cat);
    if (act === "cat-edit" && cat) nameModal("Ubah kategori", cat.name, (name) => saveCategory(ctx, { id: cat.id, type: cat.type, name }));
    if (act === "cat-toggle" && cat) {
      try { await setCategoryActive(ctx, cat, cat.isActive === false); } catch (ex) { toast(ledgerErrorMessage(ex), "error"); }
    }
    if (act === "goal-restore") {
      const g = state.goals.find((x) => x.id === e.target.closest("[data-goal]")?.dataset.goal);
      if (g) { try { await setGoalStatus(ctx, g, "active"); toast("Pos tabungan diaktifkan kembali.", "success"); } catch (ex) { toast(ledgerErrorMessage(ex), "error"); } }
    }
  });

  const request = deferredRender(el, render);
  render();
  return subscribe(request);
}
