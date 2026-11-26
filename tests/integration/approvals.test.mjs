import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";

Object.defineProperty(globalThis, "navigator", { value: { onLine: true }, configurable: true, writable: true });
const A = await import("../../assets/js/approvals.js");
const { registerUser } = await import("../../assets/js/auth.js");

let updates, sets;
beforeEach(() => {
  navigator.onLine = true; updates = []; sets = [];
  globalThis.__updateDoc = (path, data) => { updates.push([path, data]); };
  globalThis.__setDoc = (path, data) => { sets.push([path, data]); };
  globalThis.__getDoc = undefined;
});
const admin = { user: { uid: "adm" } };

test("akun lama tanpa field dianggap disetujui; akun baru pending", () => {
  assert.equal(A.approvalStatus({}), "approved");
  assert.equal(A.approvalStatus({ approvalStatus: "pending" }), "pending");
  assert.equal(A.approvalStatus({ approvalStatus: "rejected" }), "rejected");
});

test("pendaftaran menyimpan profil dengan status pending dan tanpa keluarga", async () => {
  await registerUser({ name: "  Istri ", email: "i@x.id", password: "abcd1234" });
  const [path, data] = sets[0];
  assert.equal(path, "users/new1");
  assert.equal(data.approvalStatus, "pending");
  assert.equal(data.familyId, null);
  assert.equal(data.displayName, "Istri");
  assert.deepEqual(Object.keys(data).sort(), ["approvalStatus", "createdAt", "displayName", "email", "familyId"]);
});

test("admin menyetujui dan menolak: hanya field peninjauan yang ditulis", async () => {
  await A.reviewUser(admin, "u9", "approved");
  await A.reviewUser(admin, "u9", "rejected");
  assert.deepEqual(updates[0], ["users/u9", { approvalStatus: "approved", reviewedBy: "adm", reviewedAt: "__TS__" }]);
  assert.equal(updates[1][1].approvalStatus, "rejected");
});

test("status tidak valid dan offline ditolak", async () => {
  await assert.rejects(A.reviewUser(admin, "u9", "pending"), /tidak valid/);
  await assert.rejects(A.reviewUser(admin, "u9", "admin"), /tidak valid/);
  navigator.onLine = false;
  await assert.rejects(A.reviewUser(admin, "u9", "approved"), /offline/i);
  assert.equal(updates.length, 0);
});

test("pemeriksaan admin mengikuti ada tidaknya dokumen admins/{uid}", async () => {
  globalThis.__getDoc = async (path) => ({ exists: () => path === "admins/adm" });
  assert.equal(await A.checkAdmin("adm"), true);
  assert.equal(await A.checkAdmin("orang"), false);
  globalThis.__getDoc = async () => { throw new Error("denied"); };
  assert.equal(await A.checkAdmin("adm"), false);
});
