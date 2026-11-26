import { requireAuth, logoutUser, loadProfile } from "./auth.js";
import { icon, confirmModal, toast, skeleton, registerServiceWorker } from "./ui.js";
import { escapeHtml } from "./utils.js";
import { getFamily } from "./family.js";
import { renderOnboarding } from "./onboarding.js";
import { startStore, stopStore, whenReady, subscribe, state } from "./store.js";
import { mountDashboard } from "./dashboard.js";
import { mountIncome } from "./income.js";
import { mountExpense } from "./expense.js";
import { mountBudget } from "./budget.js";
import { mountSavings } from "./savings.js";
import { mountReports } from "./reports.js";
import { mountNotifications, unreadCount } from "./notifications.js";
import { mountSettings } from "./settings.js";
import { openAddChooser } from "./transactions.js";
import { healMembership, backfillPartner } from "./members.js";
import { mountApprovals, renderPending, checkAdmin, approvalStatus, watchPending } from "./approvals.js";
import { syncPushToken, disablePush } from "./push.js";

const MENU = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", mount: mountDashboard },
  { id: "pemasukan", label: "Pemasukan", icon: "income", mount: mountIncome },
  { id: "pengeluaran", label: "Pengeluaran", icon: "expense", mount: mountExpense },
  { id: "anggaran", label: "Anggaran", icon: "budget", mount: mountBudget },
  { id: "tabungan", label: "Tabungan", icon: "savings", mount: mountSavings },
  { id: "laporan", label: "Laporan", icon: "reports", mount: mountReports },
  { id: "notifikasi", label: "Notifikasi", icon: "bell", mount: mountNotifications },
  { id: "pengaturan", label: "Pengaturan", icon: "settings", mount: mountSettings },
  { id: "persetujuan", label: "Persetujuan akun", icon: "check", mount: mountApprovals, admin: true },
];
const BOTTOM = ["dashboard", "pemasukan", "pengeluaran", "tabungan", "pengaturan"];

registerServiceWorker();
const user = await requireAuth();
if (user) start(user);

async function start(user) {
  const ctx = { user, profile: null, family: null, isAdmin: false };
  async function refresh() {
    ctx.isAdmin = await checkAdmin(user.uid);
    try { ctx.profile = await loadProfile(user.uid); } catch { ctx.profile = null; }
    // Dikeluarkan pemilik saat sedang tidak membuka aplikasi: kosongkan tautan keluarga di profil.
    if (ctx.profile?.familyId && await healMembership(user.uid, ctx.profile.familyId)) {
      ctx.profile.familyId = null;
      toast("Anda tidak lagi tergabung dalam keluarga.", "info");
    }
    ctx.family = ctx.profile?.familyId ? await getFamily(ctx.profile.familyId) : null;
  }
  await refresh();
  const name = ctx.profile?.displayName || user.displayName || "Pengguna";

  document.getElementById("app").innerHTML = `
    <aside class="sidebar">
      <div class="brand">Family Finance</div>
      <nav aria-label="Menu utama">
        ${MENU.filter((m) => !m.admin || ctx.isAdmin).map((m) => `<a class="nav-link" href="#${m.id}" data-id="${m.id}">${icon(m.icon)}<span>${m.label}</span></a>`).join("")}
      </nav>
      <div class="sidebar-foot">
        <button class="btn btn-ghost btn-block" id="install" hidden>${icon("download", 18)}<span>Pasang aplikasi</span></button>
        <div class="who"><strong>${escapeHtml(name)}</strong><span>${escapeHtml(user.email)}</span></div>
        <button class="btn btn-ghost btn-block" id="logout">${icon("logout", 18)}<span>Keluar</span></button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <h1 id="page-title">Dashboard</h1>
        <span class="topbar-right"><span class="net" id="net"></span>
          <a class="bell" href="#notifikasi" aria-label="Notifikasi">${icon("bell")}<span class="badge" id="badge" hidden>0</span></a></span>
      </header>
      <main id="view" tabindex="-1"></main>
    </div>
    <button class="fab" id="fab" aria-label="Tambah transaksi" hidden>${icon("plus", 26)}</button>
    <nav class="bottom-nav" aria-label="Menu utama">
      ${BOTTOM.map((id) => { const m = MENU.find((x) => x.id === id);
        return `<a class="nav-link" href="#${m.id}" data-id="${m.id}">${icon(m.icon)}<span>${m.label}</span></a>`; }).join("")}
      <button class="nav-link" id="more-btn">${icon("settings", 20)}<span>Lainnya</span></button>
    </nav>`;

  const view = document.getElementById("view");
  const title = document.getElementById("page-title");
  const fab = document.getElementById("fab");
  const badge = document.getElementById("badge");
  let cleanup = null, token = 0, storeOn = false, afterStartDone = false, healTried = false;

  function updateBadge() {
    const n = unreadCount(user.uid);
    badge.textContent = n > 99 ? "99+" : String(n);
    badge.hidden = n === 0;
  }

  async function render() {
    const my = ++token;
    cleanup?.(); cleanup = null;
    const id = location.hash.slice(1) || "dashboard";
    const item = MENU.find((m) => m.id === id && (!m.admin || ctx.isAdmin)) || MENU[0];
    document.querySelectorAll(".nav-link[data-id]").forEach((a) => a.classList.toggle("active", a.dataset.id === item.id));
    title.textContent = item.label;
    document.title = `${item.label} | Family Finance`;
    const hasFamily = !!ctx.profile?.familyId;
    fab.hidden = !hasFamily;

    if (!ctx.profile) {
      view.innerHTML = `<section class="card empty"><h2>Profil belum dapat dimuat</h2><p>Periksa koneksi internet, lalu muat ulang halaman.</p></section>`;
      return;
    }
    if (item.admin) { // halaman admin tidak butuh data keluarga
      fab.hidden = true; view.innerHTML = ""; cleanup = item.mount(view, ctx); return;
    }
    if (approvalStatus(ctx.profile) !== "approved" && !ctx.isAdmin) {
      fab.hidden = true;
      cleanup = renderPending(view, ctx, async () => { await refresh(); render(); });
      return;
    }
    if (!hasFamily) {
      renderOnboarding(view, ctx, async () => { await refresh(); render(); });
      return;
    }
    if (!storeOn) {
      startStore(ctx); storeOn = true; subscribe(updateBadge);
      // Dikeluarkan saat aplikasi terbuka: akses data ditolak. Pastikan lalu pulihkan profil dan muat ulang.
      subscribe(() => {
        if (state.error?.code === "permission-denied" && !healTried) {
          healTried = true;
          healMembership(user.uid, ctx.profile.familyId).then((healed) => {
            if (healed) { toast("Anda tidak lagi tergabung dalam keluarga.", "info"); stopStore(); setTimeout(() => location.reload(), 1200); }
          });
        }
      });
    }
    view.innerHTML = skeleton;
    await whenReady();
    if (my !== token) return;
    if (state.error) {
      if (state.error.code === "permission-denied" && await healMembership(user.uid, ctx.profile.familyId)) {
        stopStore(); location.reload(); return;
      }
      view.innerHTML = `<section class="card empty"><h2>Data belum dapat dimuat</h2>
        <p>${state.error.code === "permission-denied" ? "Akses ditolak. Pastikan Security Rules versi terbaru sudah dipublikasikan." : "Periksa koneksi internet, lalu muat ulang halaman."}</p></section>`;
      return;
    }
    view.innerHTML = "";
    cleanup = item.mount(view, ctx);
    updateBadge();
    if (!afterStartDone) { afterStartDone = true; backfillPartner(ctx); syncPushToken(ctx); }
    view.focus({ preventScroll: true });
  }
  window.addEventListener("hashchange", render);
  render();

  const net = document.getElementById("net");
  const showNet = () => {
    net.textContent = navigator.onLine ? "Online" : "Offline: hanya baca";
    net.className = "net " + (navigator.onLine ? "on" : "off");
  };
  window.addEventListener("online", showNet);
  window.addEventListener("offline", showNet);
  showNet();

  fab.addEventListener("click", () => openAddChooser(ctx));

  // Admin: tampilkan jumlah akun yang menunggu persetujuan pada menu, dan beri tahu saat ada yang baru.
  if (ctx.isAdmin) {
    let prev = null;
    watchPending((list) => {
      const label = document.querySelector('.sidebar .nav-link[data-id="persetujuan"] span');
      if (label) label.textContent = list.length ? `Persetujuan akun (${list.length})` : "Persetujuan akun";
      if (prev !== null && list.length > prev) toast("Ada akun baru menunggu persetujuan.", "info");
      prev = list.length;
    });
  }
  document.getElementById("logout").addEventListener("click", async () => {
    if (await confirmModal({ title: "Keluar dari akun?", message: "Anda perlu masuk lagi untuk mengakses data keluarga.", confirmText: "Keluar" })) {
      await disablePush(ctx).catch(() => {}); // perangkat ini berhenti menerima push akun ini
      stopStore();
      await logoutUser();
      location.replace("login.html");
    }
  });
  document.getElementById("more-btn").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
  document.querySelector(".sidebar").addEventListener("click", (e) => { if (e.target.closest("a")) e.currentTarget.classList.remove("open"); });

  // Install PWA
  let deferred = null;
  const installBtn = document.getElementById("install");
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; installBtn.hidden = false; });
  installBtn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null; installBtn.hidden = true;
  });
  window.addEventListener("appinstalled", () => { installBtn.hidden = true; toast("Aplikasi terpasang.", "success"); });
}
