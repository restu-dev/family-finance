import { escapeHtml } from "./utils.js";

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  income: '<circle cx="12" cy="12" r="10"/><path d="M8 12l4 4 4-4"/><path d="M12 8v8"/>',
  expense: '<circle cx="12" cy="12" r="10"/><path d="M16 12l-4-4-4 4"/><path d="M12 16V8"/>',
  budget: '<path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/>',
  savings: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  reports: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  settings: '<path d="M21 4h-7"/><path d="M10 4H3"/><path d="M21 12h-9"/><path d="M8 12H3"/><path d="M21 20h-5"/><path d="M12 20H3"/><path d="M14 2v4"/><path d="M8 10v4"/><path d="M16 18v4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
};

export function icon(name, size = 20) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</svg>`;
}

export function toast(message, type = "info") {
  let host = document.getElementById("toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "toast-host";
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

export function setLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    button.dataset.label = button.textContent;
    button.disabled = true;
    button.classList.add("is-loading");
    if (label) button.textContent = label;
  } else {
    button.disabled = false;
    button.classList.remove("is-loading");
    if (button.dataset.label) button.textContent = button.dataset.label;
  }
}

export function confirmModal({ title, message, confirmText = "Ya, lanjutkan", cancelText = "Batal" }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h2 id="modal-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" data-act="no">${escapeHtml(cancelText)}</button>
          <button class="btn btn-primary" data-act="yes">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener("click", (e) => {
      const act = e.target.dataset?.act;
      if (act) done(act === "yes");
      else if (e.target === wrap) done(false);
    });
    document.body.appendChild(wrap);
    wrap.querySelector('[data-act="yes"]').focus();
  });
}

// ---------- Tambahan Fase 4+ ----------
export function openModal({ title, html }) {
  const wrap = document.createElement("div");
  wrap.className = "modal-backdrop";
  wrap.innerHTML = `
    <div class="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="mtitle">
      <div class="modal-head"><h2 id="mtitle">${escapeHtml(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Tutup">&times;</button></div>
      <div class="modal-body">${html}</div>
    </div>`;
  const onKey = (e) => { if (e.key === "Escape") close(); };
  function close() { wrap.remove(); document.removeEventListener("keydown", onKey); }
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-close]")) close();
  });
  document.addEventListener("keydown", onKey);
  document.body.appendChild(wrap);
  return { el: wrap.querySelector(".modal-body"), close };
}

export function emptyState(title, text) {
  return `<div class="empty-state"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(text)}</p></div>`;
}

export const skeleton = `<div class="skeleton-grid"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton tall"></div></div>`;

// Memformat input nominal dengan pemisah ribuan saat mengetik.
export function bindAmountInput(input) {
  input.addEventListener("input", () => {
    const digits = input.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    input.value = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  });
}

// Render ulang ditunda saat pengguna sedang mengetik di dalam elemen, agar isi form tidak hilang.
export function deferredRender(root, renderFn) {
  let pending = false;
  const typing = () => root.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  root.addEventListener("focusout", () => { if (pending) setTimeout(() => { if (!typing()) { pending = false; renderFn(); } }, 0); });
  return () => { if (typing()) pending = true; else renderFn(); };
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
}
