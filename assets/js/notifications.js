import { state, subscribe } from "./store.js";
import { markNotificationsRead, ledgerErrorMessage } from "./ledger.js";
import { toast, emptyState } from "./ui.js";
import { escapeHtml, formatDateTime } from "./utils.js";

export const unreadCount = (uid) => state.notifications.filter((n) => !n.readBy?.[uid]).length;

export function mountNotifications(el, ctx) {
  const uid = ctx.user.uid;
  el.innerHTML = `<div class="toolbar"><span class="muted" id="n-count"></span>
    <button class="btn btn-ghost" id="n-all">Tandai semua sudah dibaca</button></div><div id="n-list" class="notif-list"></div>`;
  const $ = (id) => el.querySelector(id);

  function render() {
    const list = state.notifications;
    const unread = list.filter((n) => !n.readBy?.[uid]);
    $("#n-count").textContent = unread.length ? `${unread.length} belum dibaca` : "Semua sudah dibaca";
    $("#n-all").disabled = !unread.length;
    $("#n-list").innerHTML = list.length ? list.map((n) => {
      const isUnread = !n.readBy?.[uid];
      return `<article class="notif ${isUnread ? "unread" : ""}" data-id="${escapeHtml(n.id)}">
        <div><p>${escapeHtml(n.message)}</p>
          <span class="muted small">${escapeHtml(n.actorUid === uid ? "Anda" : n.actorName || "")}, ${n.createdAt?.toDate ? formatDateTime(n.createdAt.toDate()) : "baru saja"}</span></div>
        ${isUnread ? `<button class="btn-link" data-read>Tandai dibaca</button>` : ""}</article>`;
    }).join("") : emptyState("Belum ada notifikasi", "Aktivitas pasangan dan peringatan anggaran akan muncul di sini.");
  }

  $("#n-all").addEventListener("click", async () => {
    try { await markNotificationsRead(ctx, state.notifications.filter((n) => !n.readBy?.[uid]).map((n) => n.id)); }
    catch (ex) { toast(ledgerErrorMessage(ex), "error"); }
  });
  $("#n-list").addEventListener("click", async (ev) => {
    const id = ev.target.closest("[data-read]") && ev.target.closest(".notif")?.dataset.id;
    if (!id) return;
    try { await markNotificationsRead(ctx, [id]); } catch (ex) { toast(ledgerErrorMessage(ex), "error"); }
  });
  render();
  return subscribe(render);
}
