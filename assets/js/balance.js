// Perhitungan keuangan MURNI (tanpa Firebase/DOM) agar mudah diuji.
// Sumber kebenaran: daftar entri ledger. Semua saldo dihitung dari sini, tidak pernah disimpan sebagai angka bebas.
import { monthStart, monthEnd, addMonths, monthLabel, formatRupiah, formatDateStr, addDays, weekStart } from "./utils.js";

export const isActive = (e) => e.status !== "deleted";

// Dampak satu entri ledger terhadap saldo utama dan saldo pos tabungan.
export function effect(e) {
  const a = e.amount;
  switch (e.type) {
    case "income":
    case "opening_balance": return { main: a, sav: {} };
    case "expense": return { main: -a, sav: {} };
    case "savings_deposit": return { main: -a, sav: { [e.savingsId]: a } };
    case "savings_withdraw": return { main: a, sav: { [e.savingsId]: -a } };
    case "savings_transfer": return { main: 0, sav: { [e.savingsId]: -a, [e.toSavingsId]: a } };
    default: return { main: 0, sav: {} };
  }
}

export function mainBalanceThrough(entries, date) {
  let s = 0;
  for (const e of entries) if (isActive(e) && e.date <= date) s += effect(e).main;
  return s;
}
export function mainBalanceBefore(entries, date) {
  let s = 0;
  for (const e of entries) if (isActive(e) && e.date < date) s += effect(e).main;
  return s;
}

export function savingsBalances(entries, through = null) {
  const b = {};
  for (const e of entries) {
    if (!isActive(e) || (through && e.date > through)) continue;
    for (const [id, v] of Object.entries(effect(e).sav)) b[id] = (b[id] || 0) + v;
  }
  return b;
}
export function totalSavings(entries, through = null) {
  return Object.values(savingsBalances(entries, through)).reduce((a, b) => a + b, 0);
}

// Ringkasan satu periode (rentang tanggal inklusif).
export function periodTotals(entries, from, to) {
  const r = { income: 0, expense: 0, savingsIn: 0, savingsOut: 0, initial: 0,
    byCategory: {}, incomeByCategory: {}, largestExpense: null, count: 0 };
  for (const e of entries) {
    if (!isActive(e) || e.date < from || e.date > to) continue;
    r.count++;
    switch (e.type) {
      case "income":
        r.income += e.amount;
        r.incomeByCategory[e.categoryId] = (r.incomeByCategory[e.categoryId] || 0) + e.amount;
        break;
      case "expense":
        r.expense += e.amount;
        r.byCategory[e.categoryId] = (r.byCategory[e.categoryId] || 0) + e.amount;
        if (!r.largestExpense || e.amount > r.largestExpense.amount) r.largestExpense = e;
        break;
      case "savings_deposit": r.savingsIn += e.amount; break;
      case "savings_withdraw": r.savingsOut += e.amount; break;
      case "opening_balance": r.initial += e.amount; break;
      default: break;
    }
  }
  return r;
}

// Saldo Akhir = Saldo Awal + Pemasukan - Pengeluaran - Alokasi ke Tabungan + Tarik dari Tabungan
// (+ saldo awal akun bila dicatat pada bulan itu). Saldo Awal = saldo akhir bulan sebelumnya, dihitung dari ledger.
export function monthSummary(entries, monthId) {
  const from = monthStart(monthId), to = monthEnd(monthId);
  const t = periodTotals(entries, from, to);
  const opening = mainBalanceBefore(entries, from);
  return {
    monthId, opening, initial: t.initial, income: t.income, expense: t.expense,
    savingsIn: t.savingsIn, savingsOut: t.savingsOut,
    closing: opening + t.initial + t.income - t.expense - t.savingsIn + t.savingsOut,
  };
}

// Anggaran: hijau <75, kuning 75 sampai <90, oranye 90 sampai <100, merah >=100.
export function budgetStatus(limit, actual) {
  const pct = limit > 0 ? (actual * 100) / limit : 0;
  const level = pct >= 100 ? "red" : pct >= 90 ? "orange" : pct >= 75 ? "yellow" : "green";
  return { pct, pctLabel: Math.floor(pct), remaining: limit - actual, level };
}

export const alertKey = (categoryId, monthId, t) => `${categoryId}_${monthId}_${t}`;

// Ambang tertinggi yang terlewati dan belum pernah dikirim; null jika tidak ada.
export function alertDecision({ actual, limit, thresholds, isSent }) {
  if (!(limit > 0)) return null;
  const pct = (actual * 100) / limit;
  const crossed = (thresholds && thresholds.length ? thresholds : [75, 90, 100])
    .filter((t) => pct >= t).sort((a, b) => b - a);
  if (!crossed.length) return null;
  return isSent(crossed[0]) ? null : crossed[0];
}

// Pencegah penghapusan entri tabungan yang membuat saldo pos menjadi negatif.
export function deletionProblem(entries, entry) {
  if (!["savings_deposit", "savings_withdraw", "savings_transfer"].includes(entry.type)) return null;
  const after = savingsBalances(entries.filter((e) => e.id !== entry.id));
  for (const id of [entry.savingsId, entry.toSavingsId].filter(Boolean)) {
    if ((after[id] || 0) < 0) return "Tidak dapat menghapus: saldo pos tabungan akan menjadi negatif.";
  }
  return null;
}

export function topCategory(byCategory) {
  let best = null;
  for (const [id, amount] of Object.entries(byCategory)) if (!best || amount > best.amount) best = { id, amount };
  return best;
}

// Analisis otomatis untuk satu bulan.
export function analyze({ entries, monthId, budgets, catName }) {
  const out = [];
  const label = monthLabel(monthId);
  const prevId = addMonths(monthId, -1);
  const cur = periodTotals(entries, monthStart(monthId), monthEnd(monthId));
  const prev = periodTotals(entries, monthStart(prevId), monthEnd(prevId));

  const top = topCategory(cur.byCategory);
  if (top) out.push(`${catName(top.id)} menjadi kategori pengeluaran terbesar pada ${label} (${formatRupiah(top.amount)}).`);

  if (prev.expense > 0) {
    const ch = ((cur.expense - prev.expense) * 100) / prev.expense;
    out.push(Math.abs(ch) < 0.5
      ? `Pengeluaran ${label} sama dengan bulan sebelumnya.`
      : `Pengeluaran ${label} ${ch > 0 ? "meningkat" : "menurun"} ${Math.round(Math.abs(ch))}% dibandingkan bulan sebelumnya.`);
  } else if (cur.expense > 0) {
    out.push("Belum ada data pengeluaran bulan sebelumnya untuk dibandingkan.");
  }

  const diff = totalSavings(entries, monthEnd(monthId)) - totalSavings(entries, monthEnd(prevId));
  if (diff > 0) out.push(`Total tabungan meningkat ${formatRupiah(diff)} dibandingkan bulan lalu.`);
  else if (diff < 0) out.push(`Total tabungan menurun ${formatRupiah(-diff)} dibandingkan bulan lalu.`);

  if (cur.income > 0) {
    out.push(`Dana yang dialokasikan ke tabungan pada ${label} sebesar ${Math.round((cur.savingsIn * 100) / cur.income)}% dari pemasukan.`);
  }

  for (const b of budgets.filter((x) => x.monthId === monthId)) {
    const actual = cur.byCategory[b.categoryId] || 0;
    if (actual > b.limitAmount) out.push(`${catName(b.categoryId)} melebihi anggaran sebesar ${formatRupiah(actual - b.limitAmount)}.`);
  }

  const e = [-2, -1, 0].map((n) => {
    const m = addMonths(monthId, n);
    return periodTotals(entries, monthStart(m), monthEnd(m)).expense;
  });
  if (e.every((v) => v > 0) && e[0] < e[1] && e[1] < e[2]) out.push("Tren: pengeluaran naik tiga bulan berturut-turut.");
  if (e.every((v) => v > 0) && e[0] > e[1] && e[1] > e[2]) out.push("Tren: pengeluaran turun tiga bulan berturut-turut.");
  return out;
}

// ---- Laporan periodik (tabel) ----
export function buildReport(entries, kind, from, to, catName) {
  const act = entries.filter((e) => e.status !== "deleted" && e.date >= from && e.date <= to);
  if (kind === "kategori") {
    const t = periodTotals(act, from, to);
    const mk = (type, label, map, total) => Object.entries(map).sort((a, b) => b[1] - a[1])
      .map(([id, v]) => [label, catName(id), v, total ? `${((v * 100) / total).toFixed(1)}%` : "-"]);
    return { headers: ["Jenis", "Kategori", "Total", "Persentase"],
      rows: [...mk("expense", "Pengeluaran", t.byCategory, t.expense), ...mk("income", "Pemasukan", t.incomeByCategory, t.income)], totals: null };
  }
  const keyOf = { harian: (d) => d, mingguan: weekStart, bulanan: (d) => d.slice(0, 7), tahunan: (d) => d.slice(0, 4) }[kind];
  const labelOf = {
    harian: formatDateStr, mingguan: (k) => `${formatDateStr(k)} - ${formatDateStr(addDays(k, 6))}`,
    bulanan: monthLabel, tahunan: (k) => k,
  }[kind];
  const g = {};
  for (const e of act) {
    const k = keyOf(e.date);
    g[k] ??= { inc: 0, exp: 0, dep: 0, wd: 0 };
    if (e.type === "income") g[k].inc += e.amount;
    if (e.type === "expense") g[k].exp += e.amount;
    if (e.type === "savings_deposit") g[k].dep += e.amount;
    if (e.type === "savings_withdraw") g[k].wd += e.amount;
  }
  const rows = Object.keys(g).sort().map((k) => [labelOf(k), g[k].inc, g[k].exp, g[k].inc - g[k].exp, g[k].dep, g[k].wd]);
  const sum = (i) => rows.reduce((s, r) => s + r[i], 0);
  return { headers: ["Periode", "Pemasukan", "Pengeluaran", "Selisih", "Ke tabungan", "Dari tabungan"], rows,
    totals: rows.length ? ["Total", sum(1), sum(2), sum(3), sum(4), sum(5)] : null };
}

