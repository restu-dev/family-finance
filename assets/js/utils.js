export const TZ = "Asia/Jakarta";

export function formatRupiah(value) {
  const n = Math.round(Number(value) || 0);
  const sign = n < 0 ? "-" : "";
  return sign + "Rp" + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric",
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("day")}/${get("month")}/${get("year")}`;
}

export function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function cleanText(text, max = 100) {
  return String(text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// Minimal 8 karakter, mengandung huruf dan angka.
export function passwordProblem(password) {
  if (password.length < 8) return "Kata sandi minimal 8 karakter.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Kata sandi harus mengandung huruf dan angka.";
  }
  return "";
}

// Kode undangan: 8 karakter dari 32 simbol (tanpa I, O, 0, 1 agar tidak membingungkan).
// 256 habis dibagi 32, jadi tidak ada bias saat memetakan byte acak ke karakter.
const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % 32]).join("");
}

export function normalizeInviteCode(input) {
  return String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function formatInviteCode(code) {
  return code ? `${code.slice(0, 4)}-${code.slice(4)}` : "";
}

// ---------- Tanggal (string YYYY-MM-DD, zona Asia/Jakarta) ----------
export function todayJakarta() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function isValidDateStr(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? "")) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function addDays(s, n) {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(from, to) {
  const out = [];
  for (let d = from; d <= to && out.length < 3700; d = addDays(d, 1)) out.push(d);
  return out;
}
export function weekStart(s) {
  const d = new Date(s + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function addMonths(monthId, n) {
  const [y, m] = monthId.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function monthStart(m) { return `${m}-01`; }
export function monthEnd(m) {
  const [y, mm] = m.split("-").map(Number);
  return `${m}-${String(new Date(Date.UTC(y, mm, 0)).getUTCDate()).padStart(2, "0")}`;
}
export function monthsBetween(fromMonth, toMonth) {
  const out = [];
  for (let m = fromMonth; m <= toMonth && out.length < 600; m = addMonths(m, 1)) out.push(m);
  return out;
}
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
export function monthLabel(m) { const [y, mm] = m.split("-"); return `${MONTHS[Number(mm) - 1]} ${y}`; }
export function shortMonthLabel(m) { const [y, mm] = m.split("-"); return `${MONTHS[Number(mm) - 1].slice(0, 3)} ${y.slice(2)}`; }
export function formatDateStr(s) { if (!s) return ""; const [y, m, d] = s.split("-"); return `${d}/${m}/${y}`; }
export function formatDateTime(date) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d);
  const g = (t) => parts.find((p) => p.type === t).value;
  return `${g("day")}/${g("month")}/${g("year")} ${g("hour")}.${g("minute")}`;
}

// ---------- Nominal ----------
export function parseAmount(text) {
  const digits = String(text ?? "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : 0;
}
export function formatAmountInput(text) {
  const n = parseAmount(text);
  return n ? n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}
export function shortRupiah(n) {
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e9) return s + (a / 1e9).toFixed(1).replace(".0", "") + " M";
  if (a >= 1e6) return s + (a / 1e6).toFixed(1).replace(".0", "") + " jt";
  if (a >= 1e3) return s + Math.round(a / 1e3) + " rb";
  return s + a;
}

// ---------- CSV ----------
export function csvCell(v) {
  let s = String(v ?? "");
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // cegah formula injection di Excel
  return /[",;\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
export function toCsv(rows) { return rows.map((r) => r.map(csvCell).join(",")).join("\r\n"); }
export function downloadCsv(filename, rows) {
  const blob = new Blob(["\ufeff" + toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function uuid() { return crypto.randomUUID(); }
