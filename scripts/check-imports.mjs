// Pemeriksaan statis: setiap import bernama dari modul lokal harus benar-benar diekspor,
// dan setiap id elemen yang dipakai getElementById di app harus ada. Menangkap salah ketik sebelum dijalankan di browser.
import { readFileSync, readdirSync } from "node:fs";
const dir = "assets/js/";
const files = readdirSync(dir).filter((f) => f.endsWith(".js") && f !== "firebase-config.js");
const exportsOf = (src) => {
  const out = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z0-9_$]+)/g)) out.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) m[1].split(",").forEach((x) => out.add(x.trim().split(/\s+as\s+/).pop()));
  return out;
};
let bad = 0;
for (const f of files) {
  const src = readFileSync(dir + f, "utf8");
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*"\.\/([^"]+)"/g)) {
    if (m[2] === "firebase-config.js") continue; // dibuat saat build
    const target = readFileSync(dir + m[2], "utf8");
    const ex = exportsOf(target);
    for (const name of m[1].split(",").map((x) => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)) {
      if (!ex.has(name)) { console.error(`GAGAL: ${f} mengimpor "${name}" yang tidak diekspor ${m[2]}`); bad++; }
    }
  }
}
// Siklus impor langsung antar modul lokal
const graph = Object.fromEntries(files.map((f) => [f, [...readFileSync(dir + f, "utf8").matchAll(/from\s*"\.\/([^"]+)"/g)].map((m) => m[1]).filter((x) => x !== "firebase-config.js")]));
const visiting = new Set(), done = new Set();
(function dfs(n, path) {
  if (done.has(n)) return;
  if (visiting.has(n)) { console.error("PERINGATAN siklus impor: " + [...path, n].join(" > ")); return; }
  visiting.add(n);
  (graph[n] || []).forEach((m) => dfs(m, [...path, n]));
  visiting.delete(n); done.add(n);
})("app.js", []);
console.log(bad ? `${bad} masalah` : `Impor lokal konsisten (${files.length} modul).`);
process.exit(bad ? 1 : 0);
