// Menyalin berkas statis ke dist/ agar Vercel hanya menyajikan aplikasi (api/ tetap menjadi fungsi server).
import { rmSync, mkdirSync, cpSync } from "node:fs";
rmSync("dist", { recursive: true, force: true });
mkdirSync("dist");
for (const p of ["index.html", "login.html", "register.html", "offline.html", "manifest.json", "sw.js", "assets"]) {
  cpSync(p, `dist/${p}`, { recursive: true });
}
console.log("dist/ dibuat.");
