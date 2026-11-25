# Family Finance

Aplikasi web manajemen keuangan keluarga untuk suami dan istri: login masing-masing, satu data bersama, real-time.
Stack: HTML/CSS/JavaScript ES Modules, Firebase Authentication + Cloud Firestore, Chart.js, PWA, hosting Vercel. Semua gratis (Firebase Spark).

## Fitur

Autentikasi, keluarga dengan kode undangan (maksimal 2 anggota), pemasukan, pengeluaran, kategori bisa diatur, anggaran bulanan dengan peringatan 75/90/100% (tanpa notifikasi ganda), pos tabungan (tambah, tarik, transfer antarpos), saldo bulanan berbasis ledger, dashboard dan grafik, laporan (harian, mingguan, bulanan, tahunan, kategori) dengan ekspor CSV, riwayat transaksi, notifikasi aktivitas pasangan real-time, PWA yang bisa dipasang.

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
npm run test:integration # tes lapisan penulisan (Firestore palsu)
npm run check            # pemeriksaan impor antarmodul
```

## 3. Deploy ke Vercel

1. Buat repositori GitHub, lalu `git init && git add . && git commit -m "Family Finance" && git remote add origin <url> && git push -u origin main`. File `.env` dan `firebase-config.js` sudah di `.gitignore`.
2. https://vercel.com > Add New > Project > impor repositori. Framework preset: **Other**. Build command dan output directory sudah diatur di `vercel.json`.
3. Settings > Environment Variables: isi 6 variabel dari `.env.example` (`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`), lalu Deploy.
4. Firebase Console > Authentication > Settings > **Authorized domains** > tambahkan domain `*.vercel.app` Anda (dan domain sendiri bila ada).
5. Domain sendiri: Vercel > Settings > Domains > Add, lalu ikuti petunjuk DNS.
6. Buka alamat Vercel di HP Android (Chrome), pilih **Pasang aplikasi** atau menu Install.

Kunci Firebase Web bukan rahasia; yang melindungi data adalah Security Rules. Jangan pernah menaruh kunci Admin SDK di repositori.

## Cara kerja dan batasannya (baca ini)

- **Tanpa backend berbayar.** Logika berjalan di browser, tetapi penulisan dikunci Security Rules dan dilakukan atomis (`writeBatch`).
- **Saldo selalu dihitung dari ledger**, tidak pernah disimpan sebagai angka yang bisa menyimpang.
- **Yang tidak bisa ditegakkan Security Rules** (karena tanpa server): saldo tidak boleh negatif saat setoran tabungan, dan peringatan anggaran yang benar-benar dipicu transaksi. Dua hal itu dicek di aplikasi. Untuk jaminan penuh dibutuhkan Cloud Functions (paket Blaze, berbayar). Untuk dua anggota keluarga yang saling percaya, risiko ini dapat diterima.
- **Offline = hanya baca.** Data terakhir tetap tampil dari cache, tetapi perubahan baru ditolak saat offline supaya tidak ada transaksi yang terlihat tersimpan padahal belum terkirim, dan tidak ada konflik saat kembali online. Indikator Online/Offline ada di pojok atas.
- **Notifikasi push browser (FCM) belum aktif.** Pengiriman push ke perangkat pasangan butuh server tepercaya. Yang aktif: notifikasi dalam aplikasi real-time, lencana belum dibaca, dan pemberitahuan toast saat aplikasi terbuka.
- **Belum ada:** menghapus anggota atau keluar dari keluarga, ganti nama pengguna, kunci bulan. Rules sengaja menolak operasi itu sampai aturannya dirancang aman.
- **Kuota Firebase Spark:** sekitar 50.000 baca dan 20.000 tulis per hari. Aplikasi memakai cache lokal Firestore sehingga pembukaan ulang hanya membaca perubahan. Untuk dua pengguna dengan pencatatan harian ini sangat cukup. Bila suatu saat mendekati batas, ekspor CSV lalu arsipkan data lama.
- Grafik memakai Chart.js dari CDN jsDelivr (versi terkunci). Saat pertama dibuka tanpa internet, grafik menampilkan pesan pengganti.
