// Menguji members.js dengan Firestore palsu: komposisi operasi tiap aksi (atomis dalam satu batch).
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
const { state } = await import("../../assets/js/store.js");
const M = await import("../../assets/js/members.js");
const { LedgerError } = await import("../../assets/js/ledger.js");

const owner = { user: { uid: "own", email: "o@x.id" }, profile: { displayName: "Suami", familyId: "f1" } };
const partner = { user: { uid: "par", email: "p@x.id" }, profile: { displayName: "Istri", familyId: "f1" } };
let commits, updates;

beforeEach(() => {
  navigator.onLine = true;
  Object.assign(state, {
    family: { id: "f1", ownerUid: "own", memberCount: 2, partnerUid: "par" },
    members: [{ uid: "own", displayName: "Suami", role: "owner" }, { uid: "par", displayName: "Istri", role: "member" }],
  });
  commits = []; updates = [];
  globalThis.__commit = async (ops) => { commits.push(ops); };
  globalThis.__updateDoc = (path, data) => { updates.push([path, data]); };
  globalThis.__getDoc = undefined;
});
const find = (ops, op, pathPart) => ops.find(([o, p]) => o === op && p.includes(pathPart));

test("pasangan keluar: hapus anggota, turunkan memberCount, kosongkan familyId, catat log dan notifikasi (satu batch)", async () => {
  await M.leaveFamily(partner);
  assert.equal(commits.length, 1);
  const ops = commits[0];
  assert.ok(find(ops, "delete", "families/f1/members/par"));
  assert.deepEqual(find(ops, "update", "families/f1")[2], { memberCount: 1, partnerUid: null });
  assert.deepEqual(find(ops, "update", "users/par")[2], { familyId: null });
  assert.ok(find(ops, "set", "activityLogs"));
  assert.equal(find(ops, "set", "notifications")[2].message, "Istri keluar dari keluarga.");
});

test("pemilik tidak dapat keluar; data tidak sinkron ditolak sebelum menulis", async () => {
  await assert.rejects(M.leaveFamily(owner), /Pemilik keluarga tidak dapat keluar/);
  state.family.partnerUid = "orang-lain";
  await assert.rejects(M.leaveFamily(partner), /belum sinkron/);
  assert.equal(commits.length, 0);
});

test("pemilik mengeluarkan pasangan: hapus anggota pasangan dan turunkan memberCount", async () => {
  await M.removePartner(owner, "par");
  const ops = commits[0];
  assert.ok(find(ops, "delete", "families/f1/members/par"));
  assert.deepEqual(find(ops, "update", "families/f1")[2], { memberCount: 1, partnerUid: null });
  assert.equal(find(ops, "update", "users/"), undefined, "pemilik tidak menyentuh profil pasangan");
  assert.match(find(ops, "set", "activityLogs")[2].summary, /Suami mengeluarkan Istri/);
});

test("hanya pemilik yang dapat mengeluarkan; pemilik tidak dapat dikeluarkan", async () => {
  await assert.rejects(M.removePartner(partner, "own"), LedgerError);
  await assert.rejects(M.removePartner(owner, "own"), /Anggota tidak ditemukan/);
  assert.equal(commits.length, 0);
});

test("ganti nama: profil dan data anggota diubah dalam satu batch bersama log dan notifikasi", async () => {
  await M.renameUser(partner, "  Istri Tercinta ");
  const ops = commits[0];
  assert.deepEqual(find(ops, "update", "users/par")[2], { displayName: "Istri Tercinta" });
  assert.deepEqual(find(ops, "update", "families/f1/members/par")[2], { displayName: "Istri Tercinta" });
  assert.equal(find(ops, "set", "notifications")[2].message, "Istri mengganti nama menjadi Istri Tercinta.");
  assert.equal(partner.profile.displayName, "Istri Tercinta");
});

test("ganti nama: terlalu pendek ditolak, nama sama tidak menulis apa pun", async () => {
  await assert.rejects(M.renameUser(owner, "A"), /minimal 2 karakter/);
  await M.renameUser(owner, "Suami");
  assert.equal(commits.length, 0);
});

test("melengkapi partnerUid pada keluarga lama", async () => {
  state.family = { id: "f1", ownerUid: "own", memberCount: 2 };
  await M.backfillPartner(owner);
  assert.deepEqual(updates[0], ["families/f1", { partnerUid: "par" }]);
  updates.length = 0;
  state.family.partnerUid = "par";
  await M.backfillPartner(owner);
  assert.equal(updates.length, 0);
});

test("pemulihan keanggotaan: profil dikosongkan hanya bila data anggota memang tidak ada", async () => {
  globalThis.__getDoc = async () => ({ exists: () => false });
  assert.equal(await M.healMembership("par", "f1"), true);
  assert.deepEqual(updates[0], ["users/par", { familyId: null }]);
  updates.length = 0;
  globalThis.__getDoc = async () => ({ exists: () => true });
  assert.equal(await M.healMembership("par", "f1"), false);
  assert.equal(updates.length, 0);
});

test("offline: semua aksi anggota ditolak", async () => {
  navigator.onLine = false;
  await assert.rejects(M.leaveFamily(partner), /offline/i);
  await assert.rejects(M.removePartner(owner, "par"), /offline/i);
  await assert.rejects(M.renameUser(owner, "Nama Baru"), /offline/i);
});
