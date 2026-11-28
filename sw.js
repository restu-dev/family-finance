// Service worker Family Finance.
// - File aplikasi (same-origin): network-first, cadangan dari cache, agar pembaruan selalu sampai.
// - Pustaka/font dari CDN: stale-while-revalidate.
// - Firestore/Auth API tidak disentuh sama sekali: data keuangan hanya berasal dari Firebase.
const VERSION = "ff-v4";
const SHELL = [
  "./", "index.html", "login.html", "register.html", "offline.html", "manifest.json",
  "assets/css/style.css", "assets/css/responsive.css",
  "assets/js/app.js", "assets/js/approvals.js", "assets/js/auth.js", "assets/js/auth-pages.js", "assets/js/balance.js", "assets/js/budget.js",
  "assets/js/charts.js", "assets/js/dashboard.js", "assets/js/expense.js", "assets/js/family.js", "assets/js/firebase.js",
  "assets/js/firebase-config.js", "assets/js/income.js", "assets/js/ledger.js", "assets/js/monthly-report.js", "assets/js/members.js", "assets/js/notifications.js", "assets/js/push.js",
  "assets/js/onboarding.js", "assets/js/reports.js", "assets/js/savings.js", "assets/js/settings.js", "assets/js/store.js",
  "assets/js/transactions.js", "assets/js/ui.js", "assets/js/utils.js",
  "assets/images/icon-192.png", "assets/images/icon-512.png",
];
const CDN_HOSTS = ["www.gstatic.com", "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) =>
    Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    event.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req)) || (req.mode === "navigate" ? caches.match("offline.html") : Response.error())));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => cached);
      return cached || net;
    }));
  }
});

// ---------- Notifikasi push (Firebase Cloud Messaging) ----------
// Pesan dikirim sebagai data-only oleh api/push.js: {title, body, url}. Format mentah dari FCM dapat berupa
// {data: {...}} atau {notification: {...}}; keduanya ditangani.
self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data ? event.data.text() : "" }; }
  const d = payload.data || payload.notification || payload;
  event.waitUntil(self.registration.showNotification(d.title || "Family Finance", {
    body: d.body || "",
    icon: "assets/images/icon-192.png",
    badge: "assets/images/icon-192.png",
    data: { url: d.url || "./index.html#notifikasi" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "./index.html#notifikasi", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ("focus" in c) { if (c.navigate) c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
