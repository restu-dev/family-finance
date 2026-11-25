import { formatRupiah, shortRupiah } from "./utils.js";

export const PALETTE = ["#1f4fd8", "#17803d", "#c2570c", "#a16207", "#7c3aed", "#0e7490", "#b42318", "#475569", "#be185d", "#4d7c0f", "#9a3412", "#1e40af"];
const INK = "#5b6b82", GRID = "#e1e7f0";

export function chartHost() {
  const charts = new Map();
  return {
    draw(canvasId, cfg) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      charts.get(canvasId)?.destroy();
      charts.delete(canvasId);
      if (!window.Chart) {
        canvas.parentElement.innerHTML = `<p class="muted">Grafik belum dapat dimuat. Sambungkan internet lalu muat ulang halaman.</p>`;
        return;
      }
      charts.set(canvasId, new window.Chart(canvas, cfg));
    },
    destroy() { charts.forEach((c) => c.destroy()); charts.clear(); },
  };
}

const base = (extra = {}) => ({
  responsive: true, maintainAspectRatio: false,
  plugins: { legend: { position: "bottom", labels: { color: INK, boxWidth: 12 } }, ...extra.plugins },
  ...extra.top,
});
const axes = () => ({
  x: { ticks: { color: INK }, grid: { display: false } },
  y: { ticks: { color: INK, callback: (v) => shortRupiah(v) }, grid: { color: GRID }, beginAtZero: true },
});
const tooltip = { callbacks: { label: (c) => `${c.dataset.label ? c.dataset.label + ": " : ""}${formatRupiah(c.parsed.y ?? c.parsed)}` } };

export const barConfig = (labels, datasets) => ({
  type: "bar", data: { labels, datasets: datasets.map((d, i) => ({ borderRadius: 6, backgroundColor: PALETTE[d.color ?? i], ...d })) },
  options: { ...base({ plugins: { tooltip } }), scales: axes() },
});
export const lineConfig = (labels, datasets) => ({
  type: "line", data: { labels, datasets: datasets.map((d, i) => ({ borderColor: PALETTE[d.color ?? i], backgroundColor: PALETTE[d.color ?? i], tension: 0.3, pointRadius: 3, ...d })) },
  options: { ...base({ plugins: { tooltip } }), scales: axes() },
});
export const doughnutConfig = (labels, values) => ({
  type: "doughnut", data: { labels, datasets: [{ data: values, backgroundColor: labels.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 0 }] },
  options: { ...base({ plugins: { tooltip: { callbacks: { label: (c) => `${c.label}: ${formatRupiah(c.parsed)}` } } } }), cutout: "62%" },
});
