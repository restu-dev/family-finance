import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRupiah, formatDate, passwordProblem, isValidEmail,
  generateInviteCode, normalizeInviteCode, formatInviteCode,
} from "../assets/js/utils.js";

test("formatRupiah", () => {
  assert.equal(formatRupiah(1000000), "Rp1.000.000");
  assert.equal(formatRupiah(0), "Rp0");
  assert.equal(formatRupiah(-2500), "-Rp2.500");
  assert.equal(formatRupiah(999), "Rp999");
});

test("formatDate memakai zona Asia/Jakarta", () => {
  assert.equal(formatDate(new Date("2026-11-24T20:00:00Z")), "25/11/2026");
  assert.equal(formatDate(new Date("2026-11-24T10:00:00Z")), "24/11/2026");
});

test("validasi kata sandi dan email", () => {
  assert.notEqual(passwordProblem("abc123"), "");
  assert.notEqual(passwordProblem("abcdefgh"), "");
  assert.equal(passwordProblem("abcd1234"), "");
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("a@b"), false);
});

test("kode undangan: panjang, alfabet, dan keunikan", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const c = generateInviteCode();
    assert.match(c, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    seen.add(c);
  }
  assert.equal(seen.size, 2000);
});

test("normalisasi dan format kode undangan", () => {
  assert.equal(normalizeInviteCode(" abcd-2345 "), "ABCD2345");
  assert.equal(normalizeInviteCode("abcd 2345"), "ABCD2345");
  assert.equal(formatInviteCode("ABCD2345"), "ABCD-2345");
  assert.equal(normalizeInviteCode(formatInviteCode("ABCD2345")), "ABCD2345");
  assert.equal(normalizeInviteCode(null), "");
});
