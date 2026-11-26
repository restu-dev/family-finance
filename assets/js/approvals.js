// Persetujuan akun baru oleh admin (pemilik aplikasi).
// Akun yang baru mendaftar berstatus "pending" dan belum dapat membuat/bergabung ke keluarga (dikunci Security Rules).
// Admin ditentukan oleh dokumen admins/{uid} yang hanya bisa dibuat lewat Firebase Console.
import { db } from "./firebase.js";
import {
  doc, getDoc, collection, query, where, onSnapshot, updateDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { logoutUser } from "./auth.js";
import { escapeHtml, formatDateTime } from "./utils.js";
import { toast, setLoading, emptyState, confirmModal } from "./ui.js";

// Akun lama (dibuat sebelum fitur ini) tidak punya field approvalStatus dan dianggap sudah disetujui.
export const approvalStatus = (profile) => profile?.approvalStatus ?? "approved";

export async function checkAdmin(uid) {
  try { return (await getDoc(doc(db, "admins", uid))).exists(); } catch { return false; }
}

export async function reviewUser(ctx, targetUid, status) {
  if (!navigator.onLine) throw new Error("Sedang offline. Coba lagi saat online.");
  if (!["approved", "rejected"].includes(status)) throw new Error("Status tidak valid.");
  await updateDoc(doc(db, "users", targetUid), {
    approvalStatus: status, reviewedBy: ctx.user.uid, reviewedAt: serverTimestamp(),
  });
}

const usersWhere = (op, value) => query(collection(db, "users"), where("approvalStatus", op, value));
const toList = (snap) => snap.docs.map((d) => ({ uid: d.id, ...d.data() }));

// Mengembalikan fungsi berhenti. callback menerima daftar akun yang menunggu.
export function watchPending(callback) {
  return onSnapshot(usersWhere("==", "pending"), (s) => callback(toList(s)), () => callback([]));
}

// Layar untuk pengguna yang akunnya belum disetujui. onChange dipanggil saat status berubah.
export function renderPending(el, ctx, onChange) {
  const status = approvalStatus(ctx.profile);
  const rejected = status === "rejected";
  el.innerHTML = `
    <section class="card empty">
      <h2>${rejected ? "Pendaftaran tidak disetujui" : "Menunggu persetujuan"}</h2>
      <p>${rejected
        ? "Pendaftaran akun Anda tidak disetujui oleh pemilik aplikasi. Hubungi pemilik aplikasi jika ini keliru."
        : "Akun Anda sudah terdaftar, tetapi pemilik aplikasi perlu menyetujuinya sebelum Anda dapat membuat atau bergabung ke keluarga. Halaman ini akan terbuka otomatis setelah disetujui."}</p>
      <div class="push-actions">
        ${rejected ? "" : `<button class="btn btn-ghost" id="ap-check">Periksa lagi</button>`}
        <button class="btn btn-ghost" id="ap-logout">Keluar</button>
      </div>
    </section>`;
  el.querySelector("#ap-check")?.addEventListener("click", () => onChange());
  el.querySelector("#ap-logout").addEventListener("click", async () => { await logoutUser(); location.replace("login.html"); });
  return onSnapshot(doc(db, "users", ctx.user.uid), (s) => {
    if ((s.data()?.approvalStatus ?? "approved") !== status) onChange();
  }, () => {});
}

export function mountApprovals(el, ctx) {
  el.innerHTML = `
    <section class="card stack"><h2>Menunggu persetujuan</h2><div id="ap-pending"><p class="muted">Memuat...</p></div></section>
    <section class="card stack"><h2>Sudah diproses</h2><div id="ap-done"><p class="muted">Memuat...</p></div></section>`;
  const $ = (id) => el.querySelector(id);
  let pending = [], done = [];

  const when = (u) => (u.createdAt?.toDate ? formatDateTime(u.createdAt.toDate()) : "-");
  const row = (u, actions) => `<li data-uid="${escapeHtml(u.uid)}"><div><strong>${escapeHtml(u.displayName || "(tanpa nama)")}</strong>
    <span class="muted small block">${escapeHtml(u.email || "")}, mendaftar ${when(u)}</span></div>
    <span class="actions">${actions}</span></li>`;

  function render() {
    $("#ap-pending").innerHTML = pending.length
      ? `<ul class="member-list">${pending.map((u) => row(u,
        `<button class="btn btn-primary" data-act="approved">Setujui</button><button class="btn btn-ghost danger" data-act="rejected">Tolak</button>`)).join("")}</ul>`
      : emptyState("Tidak ada akun yang menunggu", "Pendaftaran baru akan muncul di sini.");
    $("#ap-done").innerHTML = done.length
      ? `<ul class="member-list">${done.map((u) => row(u,
        `<span class="pill ${u.approvalStatus === "approved" ? "lvl-green" : "lvl-red"}">${u.approvalStatus === "approved" ? "Disetujui" : "Ditolak"}</span>${u.approvalStatus === "rejected" ? `<button class="btn-link" data-act="approved">Setujui</button>` : ""}`)).join("")}</ul>`
      : `<p class="muted">Belum ada.</p>`;
  }

  async function act(uid, status) {
    const u = [...pending, ...done].find((x) => x.uid === uid);
    if (!u) return;
    if (status === "rejected" && !(await confirmModal({
      title: `Tolak ${u.displayName}?`, message: "Akun ini tidak akan dapat membuat atau bergabung ke keluarga. Anda masih bisa menyetujuinya nanti.", confirmText: "Tolak",
    }))) return;
    try { await reviewUser(ctx, uid, status); toast(status === "approved" ? "Akun disetujui." : "Akun ditolak.", "success"); }
    catch (ex) { toast(ex.message || "Gagal memproses akun.", "error"); }
  }
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    const uid = btn?.closest("li")?.dataset.uid;
    if (btn && uid) act(uid, btn.dataset.act);
  });

  const off1 = watchPending((l) => { pending = l; render(); });
  const off2 = onSnapshot(usersWhere("in", ["approved", "rejected"]), (s) => { done = toList(s); render(); }, () => { done = []; render(); });
  render();
  return () => { off1(); off2(); };
}
