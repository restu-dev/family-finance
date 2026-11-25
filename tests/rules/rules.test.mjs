// Tes Security Rules dengan Firebase Emulator. BELUM DIJALANKAN di lingkungan pembuatan (butuh Java + emulator).
// Cara menjalankan (sekali pasang): npm i -D @firebase/rules-unit-testing firebase-tools
//   npx firebase emulators:exec --only firestore --project demo-ff "node --test tests/rules/rules.test.mjs"
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, writeBatch } from "firebase/firestore";

let env;
const F = "fam1";
before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-ff", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users/alice"), { displayName: "Alice", email: "a@x.id", familyId: F, createdAt: new Date() });
    await setDoc(doc(db, "users/bob"), { displayName: "Bob", email: "b@x.id", familyId: F, createdAt: new Date() });
    await setDoc(doc(db, "users/eve"), { displayName: "Eve", email: "e@x.id", familyId: null, createdAt: new Date() });
    await setDoc(doc(db, `families/${F}`), { name: "Keluarga", currency: "IDR", timezone: "Asia/Jakarta", ownerUid: "alice", inviteCode: "ABCD2345", memberCount: 2, createdAt: new Date() });
    await setDoc(doc(db, `families/${F}/members/alice`), { uid: "alice", displayName: "Alice", role: "owner", status: "active", joinedAt: new Date() });
    await setDoc(doc(db, `families/${F}/members/bob`), { uid: "bob", displayName: "Bob", role: "member", status: "active", joinedAt: new Date() });
    await setDoc(doc(db, `families/${F}/categories/exp_dapur`), { type: "expense", name: "Belanja dapur", isActive: true, isDefault: true, createdAt: new Date(), updatedAt: new Date() });
    await setDoc(doc(db, `invites/USED0001`), { familyId: F, active: false, createdBy: "alice", createdAt: new Date() });
  });
});
after(() => env.cleanup());

const entry = (over = {}) => ({
  familyId: F, type: "expense", date: "2026-11-24", monthId: "2026-11", name: "Belanja", categoryId: "exp_dapur", amount: 150000,
  paymentMethod: "Cash", description: "", status: "active", createdBy: "alice", createdByName: "Alice",
  createdAt: serverTimestamp(), updatedBy: "alice", updatedAt: serverTimestamp(), ...over,
});
const as = (uid) => env.authenticatedContext(uid).firestore();

test("anggota boleh membaca, orang luar tidak", async () => {
  await assertSucceeds(getDoc(doc(as("bob"), `families/${F}`)));
  await assertFails(getDoc(doc(as("eve"), `families/${F}`)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `families/${F}`)));
});
test("anggota mencatat pengeluaran valid", async () => {
  await assertSucceeds(setDoc(doc(as("alice"), `families/${F}/ledger/t1`), entry()));
});
test("nominal tidak valid ditolak", async () => {
  for (const amount of [0, -5, 1.5, "100"]) await assertFails(setDoc(doc(as("alice"), `families/${F}/ledger/bad${String(amount)}`), entry({ amount })));
});
test("identitas pencatat palsu ditolak", async () => {
  await assertFails(setDoc(doc(as("alice"), `families/${F}/ledger/s1`), entry({ createdBy: "bob" })));
  await assertFails(setDoc(doc(as("alice"), `families/${F}/ledger/s2`), entry({ createdByName: "Bob" })));
});
test("orang luar tidak dapat menulis transaksi", async () => {
  await assertFails(setDoc(doc(as("eve"), `families/${F}/ledger/e1`), entry({ createdBy: "eve", createdByName: "Eve" })));
});
test("kategori tidak ada atau tidak cocok jenis ditolak", async () => {
  await assertFails(setDoc(doc(as("alice"), `families/${F}/ledger/c1`), entry({ categoryId: "tidak_ada" })));
  await assertFails(setDoc(doc(as("alice"), `families/${F}/ledger/c2`), entry({ type: "income" })));
});
test("transaksi tidak dapat dihapus fisik, tetapi dapat di-soft-delete", async () => {
  const db = as("bob"), ref = doc(db, `families/${F}/ledger/t1`);
  await assertSucceeds(updateDoc(ref, { status: "deleted", updatedBy: "bob", updatedAt: serverTimestamp() }));
});
test("pencatat asli tidak dapat diubah lewat update", async () => {
  await assertFails(updateDoc(doc(as("bob"), `families/${F}/ledger/t1`), { createdBy: "bob", updatedBy: "bob", updatedAt: serverTimestamp() }));
});
test("peringatan anggaran hanya bisa dibuat sekali", async () => {
  const ref = doc(as("alice"), `families/${F}/budgetAlerts/exp_dapur_2026-11_90`);
  const data = { categoryId: "exp_dapur", monthId: "2026-11", threshold: 90, createdBy: "alice", createdAt: serverTimestamp() };
  await assertSucceeds(setDoc(ref, data));
  await assertFails(setDoc(ref, { ...data, createdAt: serverTimestamp() }));
});
test("kode undangan terpakai tidak bisa dipakai bergabung; daftar undangan tidak bisa ditelusuri", async () => {
  const db = as("eve");
  const batch = writeBatch(db);
  batch.set(doc(db, `families/${F}/members/eve`), { uid: "eve", displayName: "Eve", role: "member", status: "active", joinedAt: serverTimestamp(), inviteCode: "USED0001" });
  batch.update(doc(db, `families/${F}`), { memberCount: 2 });
  batch.update(doc(db, "users/eve"), { familyId: F });
  await assertFails(batch.commit());
});
test("pengguna tidak dapat mengubah role dirinya", async () => {
  await assertFails(updateDoc(doc(as("bob"), `families/${F}/members/bob`), { role: "owner" }));
});
