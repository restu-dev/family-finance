import { createFamily, joinFamily, familyErrorMessage } from "./family.js";
import { cleanText } from "./utils.js";
import { toast, setLoading } from "./ui.js";

export function renderOnboarding(el, ctx, onDone) {
  el.innerHTML = `
    <div class="grid-2">
      <section class="card">
        <h2>Buat keluarga baru</h2>
        <p class="muted">Pilih ini jika Anda yang pertama mendaftar. Setelah keluarga dibuat, bagikan kode undangan ke pasangan.</p>
        <div class="form-error" id="create-error" role="alert" hidden></div>
        <form id="create-form" novalidate>
          <div class="field"><label for="family-name">Nama keluarga</label>
            <input id="family-name" type="text" maxlength="60" placeholder="Contoh: Keluarga Pratama" required></div>
          <button class="btn btn-primary btn-block" type="submit" id="create-btn">Buat keluarga</button>
        </form>
      </section>
      <section class="card">
        <h2>Gabung dengan kode undangan</h2>
        <p class="muted">Pilih ini jika pasangan Anda sudah membuat keluarga dan memberi Anda kode.</p>
        <div class="form-error" id="join-error" role="alert" hidden></div>
        <form id="join-form" novalidate>
          <div class="field"><label for="invite-code">Kode undangan</label>
            <input id="invite-code" type="text" maxlength="9" autocapitalize="characters" autocomplete="off"
              placeholder="ABCD-2345" required></div>
          <button class="btn btn-primary btn-block" type="submit" id="join-btn">Gabung</button>
        </form>
      </section>
    </div>`;

  const show = (id, msg) => { const n = el.querySelector(id); n.textContent = msg; n.hidden = !msg; };
  const identity = { uid: ctx.user.uid, displayName: ctx.profile.displayName };

  el.querySelector("#create-form").addEventListener("submit", async (e) => {
    e.preventDefault(); show("#create-error", "");
    const btn = el.querySelector("#create-btn");
    setLoading(btn, true, "Membuat...");
    try {
      await createFamily({ ...identity, name: cleanText(el.querySelector("#family-name").value, 60) });
      toast("Keluarga berhasil dibuat.", "success");
      await onDone();
    } catch (err) {
      show("#create-error", familyErrorMessage(err, "create"));
      setLoading(btn, false);
    }
  });

  el.querySelector("#join-form").addEventListener("submit", async (e) => {
    e.preventDefault(); show("#join-error", "");
    const btn = el.querySelector("#join-btn");
    setLoading(btn, true, "Memproses...");
    try {
      await joinFamily({ ...identity, codeInput: el.querySelector("#invite-code").value });
      toast("Berhasil bergabung ke keluarga.", "success");
      await onDone();
    } catch (err) {
      show("#join-error", familyErrorMessage(err, "join"));
      setLoading(btn, false);
    }
  });
}
