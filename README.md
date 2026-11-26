# Family Finance

Aplikasi web manajemen keuangan keluarga untuk suami dan istri: login masing-masing, satu data bersama, real-time.
Stack: HTML/CSS/JavaScript ES Modules, Firebase Authentication + Cloud Firestore, Chart.js, PWA, hosting Vercel. Semua gratis (Firebase Spark).

## Fitur

Autentikasi, keluarga dengan kode undangan (maksimal 2 anggota), pemasukan, pengeluaran, kategori bisa diatur, anggaran bulanan dengan peringatan 75/90/100% (tanpa notifikasi ganda), pos tabungan (tambah, tarik, transfer antarpos), saldo bulanan berbasis ledger, dashboard dan grafik, laporan (harian, mingguan, bulanan, tahunan, kategori) dengan ekspor CSV, riwayat transaksi, notifikasi aktivitas pasangan real-time, notifikasi push browser (opsional, butuh konfigurasi), keluar dari keluarga atau mengeluarkan pasangan, ganti nama pengguna, persetujuan akun baru oleh admin, PWA yang bisa dipasang.

Dokumentasi: [docs/DATABASE.md](docs/DATABASE.md) (struktur data dan rumus), [docs/TESTING.md](docs/TESTING.md) (skenario uji).

## 1. Menyiapkan Firebase (sekali)

1. https://console.firebase.google.com > **Add project** (Google Analytics boleh dimatikan).
2. **Authentication** > Get started > Sign-in method > aktifkan **Email/Password**.
3. **Firestore Database** > Create database > mode **production**, lokasi `asia-southeast2` (Jakarta) bila ada.
4. **Project settings** > Your apps > ikon web `</>` > Register app > salin nilai `firebaseConfig`.
5. **Firestore Database > Rules**: tempel seluruh isi `firestore.rules` > **Publish**. Ulangi setiap kali file ini berubah.
6. (Opsional) Authentication > Templates: ubah bahasa email reset kata sandi ke Indonesia.

## 2. Menjalankan lokal

```bash
cp .env.example .env     # isi 6 nilai dari firebaseConfig
npm run config:local     # membuat assets/js/firebase-config.js (butuh Node 20+)
npm start                # http://localhost:3000
npm test                 # tes perhitungan keuangan dan utilitas
npm run test:integration # tes lapisan penulisan dan fitur anggota (Firestore palsu)
npm run check            # pemeriksaan impor antarmodul
```

## 3. Deploy ke Vercel

1. Buat repositori GitHub, lalu `git init && git add . && git commit -m "Family Finance" && git remote add origin <url> && git push -u origin main`. File `.env` dan `firebase-config.js` sudah di `.gitignore`.
2. https://vercel.com > Add New > Project > impor repositori. Framework preset: **Other**. Build command (`npm run build`) dan output directory (`dist`) sudah diatur di `vercel.json`. Jika sebelumnya Anda mengatur Output Directory secara manual di dasbor Vercel, kosongkan agar mengikuti `vercel.json`.
3. Settings > Environment Variables: isi 6 variabel dari `.env.example` (`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`), lalu Deploy.
4. Firebase Console > Authentication > Settings > **Authorized domains** > tambahkan domain `*.vercel.app` Anda (dan domain sendiri bila ada).
5. Domain sendiri: Vercel > Settings > Domains > Add, lalu ikuti petunjuk DNS.
6. Buka alamat Vercel di HP Android (Chrome), pilih **Pasang aplikasi** atau menu Install.

Kunci Firebase Web bukan rahasia; yang melindungi data adalah Security Rules. Jangan pernah menaruh kunci Admin SDK di repositori.

## Persetujuan akun baru oleh pemilik aplikasi (admin)

Akun yang baru mendaftar berstatus **menunggu persetujuan** dan belum dapat membuat atau bergabung ke keluarga, sehingga orang asing yang menemukan alamat aplikasi Anda tidak dapat memakainya. Penguncian dilakukan oleh Security Rules, bukan hanya tampilan.

**Menjadikan Anda admin (sekali saja, lewat Console):**

1. Publish ulang `firestore.rules`, lalu deploy kode terbaru.
2. Firebase Console > **Authentication** > **Users** > salin **User UID** akun Anda.
3. **Firestore Database** > **Start collection** (atau Add collection) dengan ID `admins` > Document ID: tempel UID Anda > tambah field `enabled` bertipe boolean bernilai `true` > Save.
4. Muat ulang aplikasi. Menu **Persetujuan akun** muncul di sidebar (di HP, buka lewat tombol Lainnya). Jumlah akun yang menunggu tampil di menu itu, dan muncul pemberitahuan bila ada pendaftar baru saat aplikasi Anda terbuka.

**Alurnya:** pendaftar membuat akun, melihat layar Menunggu persetujuan, Anda menyetujuinya di menu Persetujuan akun, lalu layar pendaftar terbuka otomatis dan ia dapat memasukkan kode undangan. Anda juga bisa Tolak (dan menyetujuinya kembali nanti). Untuk istri: daftarkan akunnya, setujui, baru ia memasukkan kode undangan keluarga.

**Penting:**

- Akun yang dibuat **sebelum** fitur ini dianggap sudah disetujui (tidak punya field status). Buka Authentication > Users dan hapus akun yang tidak Anda kenal. Atau untuk akun yang meragukan, ubah dokumen `users/{uid}` miliknya di Firestore: tambah field `approvalStatus` bernilai `pending`.
- Admin selalu dianggap disetujui. Anda bisa menambah admin lain dengan cara yang sama.
- Pendaftaran akun di Firebase Authentication tetap terbuka (orang asing masih bisa membuat akun, tetapi akunnya tidak bisa melakukan apa pun). Jika di Authentication > Settings > User actions ada opsi untuk menonaktifkan pembuatan akun (sign-up), Anda bisa mematikannya setelah istri terdaftar; periksa dulu apakah opsi ini tersedia di project Anda.
- Anda tidak mendapat pemberitahuan di luar aplikasi saat ada pendaftar (belum ada email atau push untuk admin); cek menu Persetujuan akun secara berkala atau saat menunggu pendaftar yang Anda kenal.

## Notifikasi push browser (opsional, BELUM diuji oleh pembuat)

Notifikasi dalam aplikasi sudah aktif tanpa konfigurasi. Push ke layar HP/komputer pasangan saat aplikasi tertutup butuh server tepercaya, karena kredensial pengirim tidak boleh ada di browser. Server itu adalah fungsi gratis Vercel di `api/push.js`. Tanpa langkah di bawah, tombol push di Pengaturan menampilkan "belum dikonfigurasi" dan aplikasi tetap berjalan normal.

1. **Aktifkan Cloud Messaging.** Firebase Console > Project settings > tab **Cloud Messaging**. Pastikan **Firebase Cloud Messaging API (V1)** berstatus Enabled.
2. **Kunci VAPID (publik).** Di tab yang sama, bagian **Web configuration > Web Push certificates** > **Generate key pair**. Salin Key pair-nya. Isi di Vercel sebagai `FIREBASE_VAPID_KEY` (dan di `.env` untuk lokal).
3. **Akun layanan (RAHASIA).** Project settings > tab **Service accounts** > **Generate new private key**. Berkas JSON yang terunduh berisi kunci dengan akses penuh ke project Anda. Buka berkasnya, salin **seluruh isinya**, lalu tempel sebagai nilai environment variable `FIREBASE_SERVICE_ACCOUNT` di Vercel. Jangan menaruhnya di repositori, `.env`, chat, atau layar yang dibagikan. Hapus berkas unduhan setelah disalin.
4. **Publish ulang `firestore.rules`** (ada aturan baru untuk token push, keluar/keluarkan anggota, dan ganti nama), lalu **Redeploy** di Vercel supaya variabel baru terbaca.
5. Di aplikasi: Pengaturan > Notifikasi > **Aktifkan notifikasi push** > izinkan > **Kirim notifikasi tes**. Lakukan di kedua perangkat (suami dan istri).
6. Uji sungguhan: tutup aplikasi di perangkat istri, catat pengeluaran dari akun suami. Notifikasi harus muncul di perangkat istri.

Cara kerja: setelah transaksi tersimpan, aplikasi meminta `api/push.js` mengirim push. Server memverifikasi login pemanggil, memastikan ia anggota keluarga, lalu mengirim isi notifikasi yang sudah tersimpan di Firestore (bukan teks dari klien) hanya ke perangkat anggota lain, sekali per notifikasi. Token perangkat disimpan di `families/{id}/pushTokens` dan hanya dapat dibaca pemiliknya.

Catatan: di iPhone (iOS 16.4 ke atas), push hanya berfungsi jika aplikasi sudah dipasang ke Layar Utama dari Safari. `npm start` lokal tidak menjalankan `api/push.js`; uji push langsung di alamat Vercel (atau gunakan `vercel dev`). Keluar (logout) mematikan push di perangkat itu; aktifkan lagi setelah masuk.

## Keluar dari keluarga, mengeluarkan anggota, ganti nama

- **Pasangan keluar sendiri:** Pengaturan > Anggota keluarga > **Keluar**. Akses ke data keluarga berhenti. Transaksi yang pernah dicatat tetap ada di keluarga. Untuk bergabung lagi, pemilik harus membuat kode undangan baru.
- **Pemilik mengeluarkan pasangan:** tombol **Keluarkan** di daftar anggota. Pasangan langsung kehilangan akses; saat membuka aplikasi ia diarahkan kembali ke layar buat/gabung keluarga.
- **Pemilik tidak dapat keluar** dari keluarga pada versi ini (belum ada pemindahan kepemilikan atau penutupan keluarga).
- **Ganti nama:** Pengaturan > Profil pengguna > **Ubah nama**. Nama pencatat pada transaksi lama ikut tampil dengan nama baru. Teks notifikasi lama tetap memakai nama saat kejadian.
- Keluarga yang dibuat sebelum versi ini otomatis dilengkapi field `partnerUid` saat salah satu anggota membuka aplikasi.

## Cara kerja dan batasannya (baca ini)

- **Tanpa backend berbayar.** Logika berjalan di browser, tetapi penulisan dikunci Security Rules dan dilakukan atomis (`writeBatch`).
- **Saldo selalu dihitung dari ledger**, tidak pernah disimpan sebagai angka yang bisa menyimpang.
- **Yang tidak bisa ditegakkan Security Rules** (karena tanpa server): saldo tidak boleh negatif saat setoran tabungan, dan peringatan anggaran yang benar-benar dipicu transaksi. Dua hal itu dicek di aplikasi. Untuk jaminan penuh dibutuhkan Cloud Functions (paket Blaze, berbayar). Untuk dua anggota keluarga yang saling percaya, risiko ini dapat diterima.
- **Offline = hanya baca.** Data terakhir tetap tampil dari cache, tetapi perubahan baru ditolak saat offline supaya tidak ada transaksi yang terlihat tersimpan padahal belum terkirim, dan tidak ada konflik saat kembali online. Indikator Online/Offline ada di pojok atas.
- **Notifikasi push** butuh konfigurasi (bagian di atas) dan belum diuji. Tanpa itu yang aktif: notifikasi dalam aplikasi real-time, lencana belum dibaca, dan pemberitahuan toast saat aplikasi terbuka.
- **Belum ada:** pemindahan kepemilikan atau penutupan keluarga (pemilik tidak bisa keluar), kunci bulan, dan penggantian email.
- **Kuota Firebase Spark:** sekitar 50.000 baca dan 20.000 tulis per hari. Aplikasi memakai cache lokal Firestore sehingga pembukaan ulang hanya membaca perubahan. Untuk dua pengguna dengan pencatatan harian ini sangat cukup. Bila suatu saat mendekati batas, ekspor CSV lalu arsipkan data lama.
- Grafik memakai Chart.js dari CDN jsDelivr (versi terkunci). Saat pertama dibuka tanpa internet, grafik menampilkan pesan pengganti.
