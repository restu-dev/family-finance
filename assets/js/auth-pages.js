import {
  loginUser, registerUser, resetPassword, redirectIfAuthed, friendlyError,
} from "./auth.js";
import { isValidEmail, passwordProblem, cleanText } from "./utils.js";
import { setLoading, toast, registerServiceWorker } from "./ui.js";

registerServiceWorker();

redirectIfAuthed();

const $ = (id) => document.getElementById(id);
function fail(el, msg) { el.textContent = msg; el.hidden = !msg; }

const loginForm = $("login-form");
if (loginForm) {
  const err = $("form-error");
  const btn = $("submit-btn");
  const resetBtn = $("reset-btn");

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    fail(err, "");
    const email = cleanText($("email").value, 120).toLowerCase();
    const password = $("password").value;
    if (!isValidEmail(email)) return fail(err, "Format email tidak valid.");
    if (!password) return fail(err, "Kata sandi wajib diisi.");
    setLoading(btn, true, "Memproses...");
    try {
      await loginUser(email, password);
      location.replace("index.html");
    } catch (ex) {
      fail(err, friendlyError(ex));
      setLoading(btn, false);
    }
  });

  resetBtn.addEventListener("click", async () => {
    fail(err, "");
    const email = cleanText($("email").value, 120).toLowerCase();
    if (!isValidEmail(email)) return fail(err, "Isi email Anda di atas, lalu pilih Lupa kata sandi.");
    setLoading(resetBtn, true, "Mengirim...");
    try {
      await resetPassword(email);
    } catch (ex) {
      // Sengaja tidak membocorkan apakah email terdaftar atau tidak.
      if (ex.code === "auth/network-request-failed") { fail(err, friendlyError(ex)); setLoading(resetBtn, false); return; }
    }
    toast("Jika email terdaftar, tautan atur ulang kata sandi sudah dikirim.", "success");
    setLoading(resetBtn, false);
  });
}

const registerForm = $("register-form");
if (registerForm) {
  const err = $("form-error");
  const btn = $("submit-btn");

  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    fail(err, "");
    const name = cleanText($("name").value, 60);
    const email = cleanText($("email").value, 120).toLowerCase();
    const password = $("password").value;
    if (name.length < 2) return fail(err, "Nama minimal 2 karakter.");
    if (!isValidEmail(email)) return fail(err, "Format email tidak valid.");
    const pw = passwordProblem(password);
    if (pw) return fail(err, pw);
    if (password !== $("password2").value) return fail(err, "Konfirmasi kata sandi tidak sama.");
    setLoading(btn, true, "Mendaftarkan...");
    try {
      await registerUser({ name, email, password });
      location.replace("index.html");
    } catch (ex) {
      fail(err, friendlyError(ex));
      setLoading(btn, false);
    }
  });
}
