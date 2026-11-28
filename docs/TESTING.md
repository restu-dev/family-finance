# Pengujian

## A. Otomatis (sudah dijalankan saat pembuatan)

`npm test` menjalankan tes logika murni (`tests/`): rumus saldo, pergantian bulan, transaksi terlambat, koreksi dan hapus, tabungan tanpa penghitungan ganda, indikator anggaran 75/90/100, penentuan peringatan tanpa pengulangan, analisis otomatis, laporan periodik, CSV, utilitas tanggal. `npm run test:integration` menjalankan `ledger.js` dan `store.js` sungguhan dengan Firestore palsu: batch atomis (ledger + log audit + notifikasi), validasi input, pengiriman ulang tanpa duplikat, perilaku offline, peringatan anggaran 75/90/100% tepat sekali per ambang (termasuk teks pesan), edit/hapus, setoran dan transfer tabungan, target tercapai. `tests/integration/members.test.mjs` menguji komposisi atomis aksi keluar, keluarkan, ganti nama, pelengkapan `partnerUid`, dan pemulihan keanggotaan. `tests/integration/approvals.test.mjs` menguji status awal pendaftaran (pending), tindakan setujui/tolak, dan pemeriksaan admin. `tests/monthly-report.test.mjs` menguji isi dan keamanan HTML laporan bulanan (angka kunci, transaksi bulan lain dan yang dihapus tidak ikut, teks berbahaya di-escape). Tes di `tests/balance.test.mjs` juga mencakup label anggaran (100% = habis) dan hitungan dana darurat. `npm run check` memeriksa konsistensi impor antarmodul.

## B. Tes Security Rules (BELUM dijalankan, butuh emulator)

`tests/rules/rules.test.mjs`. Petunjuk ada di bagian atas berkas. Mencakup: orang luar ditolak, nominal tidak valid, identitas pencatat palsu, kategori tidak ada, soft delete, peringatan hanya sekali, kode undangan terpakai, role tidak dapat diubah.

## C. Manual di browser dan Firebase (WAJIB dilakukan pemilik; belum diuji oleh pembuat)

Gunakan dua akun email (suami dan istri). Jendela penyamaran untuk akun kedua.

**Auth**: daftar berhasil; login berhasil; login salah menampilkan pesan; keluar; Lupa kata sandi mengirim email; halaman dalam tidak bisa dibuka tanpa login.

**Keluarga**: A membuat keluarga; B bergabung dengan kode; A melihat B muncul tanpa muat ulang; akun C ditolak memakai kode yang sama; C tidak bisa melihat data keluarga.

**Pemasukan/Pengeluaran**: tambah, ubah, hapus; cari dan filter tanggal/kategori; nominal 0 atau negatif ditolak; klik Simpan dua kali tidak membuat dua transaksi.

**Anggaran**: buat anggaran Belanja dapur Rp2.000.000. Catat pengeluaran sampai Rp1.500.000 (peringatan 75%), Rp1.800.000 (90%), Rp2.000.000 (100%). Setiap ambang hanya satu notifikasi. Ubah nominal ke bawah ambang lalu naikkan lagi: tidak ada notifikasi ganda. Hapus transaksi: persentase turun.

**Tabungan**: saldo utama Rp5.000.000, pindahkan Rp1.000.000 ke pos Pendidikan. Saldo utama Rp4.000.000, pos Rp1.000.000, **pengeluaran bulan itu tidak bertambah**. Tarik sebagian. Transfer antarpos. Setoran melebihi saldo ditolak. Capai target: muncul notifikasi tercapai.

**Saldo bulanan**: atur saldo awal; catat transaksi di bulan lalu (tanggal mundur): saldo akhir bulan itu dan saldo awal bulan ini berubah konsisten. Ubah nominal transaksi lama: saldo ikut berubah. Laporan > Ringkasan: saldo akhir bulan N sama dengan saldo awal bulan N+1.

**Notifikasi**: aktivitas A muncul di akun B (toast saat aplikasi terbuka, lencana di lonceng) dan sebaliknya. Tandai dibaca.

**Responsif dan PWA**: Android, iPhone, tablet, desktop; tidak ada gulir horizontal; tombol + mudah dijangkau; pasang sebagai aplikasi; matikan internet: halaman terbuka dengan data terakhir dan penanda Offline, tombol simpan menolak dengan pesan jelas.

## D. Fitur anggota dan push (WAJIB diuji pemilik; belum diuji di browser/Firebase)

Butuh dua akun. Sebelum mulai, publish ulang `firestore.rules`.

**Ganti nama**: Pengaturan > Ubah nama. Nama baru muncul di sidebar, daftar anggota, dan kolom pencatat transaksi lama. Di akun pasangan nama itu juga berubah setelah muat ulang. Nama 1 karakter ditolak.

**Keluar dari keluarga**: dengan akun pasangan, Pengaturan > Keluar. Akun itu kembali ke layar buat/gabung. Akun pemilik melihat jumlah anggota 1 dari 2 dan tombol kode undangan baru, serta notifikasi bahwa pasangan keluar. Pemilik tidak punya tombol Keluar.

**Bergabung lagi**: pemilik buat kode baru, pasangan gabung dengan kode itu. Transaksi lama yang dicatat pasangan masih ada dengan namanya.

**Mengeluarkan pasangan**: pemilik klik Keluarkan > konfirmasi. Dengan aplikasi pasangan terbuka, akses ditolak dan aplikasi memulihkan diri lalu kembali ke layar buat/gabung. Dengan aplikasi pasangan tertutup, hal yang sama terjadi saat dibuka. Kode lama tidak bisa dipakai.

**Batas dua anggota**: akun ketiga mencoba bergabung dengan kode yang sudah terpakai atau saat keluarga penuh: ditolak.

**Push (setelah konfigurasi README)**: Aktifkan push di kedua perangkat. Kirim notifikasi tes: muncul di perangkat itu. Tutup aplikasi di perangkat istri, catat transaksi dari akun suami: notifikasi muncul di perangkat istri, tanpa muncul di perangkat suami. Satu transaksi hanya satu push. Logout lalu catat dari pasangan: perangkat yang logout tidak menerima push. Ketuk notifikasi: aplikasi terbuka di halaman Notifikasi.

## E. Persetujuan akun (WAJIB diuji pemilik; belum diuji di browser/Firebase)

Sebelum mulai: publish ulang `firestore.rules`, buat dokumen `admins/{UID Anda}` (README), dan siapkan satu email baru untuk percobaan.

1. Daftar dengan email baru. Aplikasi menampilkan **Menunggu persetujuan**, tanpa form buat/gabung keluarga.
2. Di akun baru, buka `#pemasukan`, `#dashboard`, dsb.: tetap layar menunggu.
3. Di akun Anda (admin): menu **Persetujuan akun** menampilkan angka 1 dan akun baru terdaftar. Klik **Setujui**.
4. Di akun baru, layar terbuka otomatis (atau klik Periksa lagi) menjadi layar buat/gabung keluarga. Coba bergabung dengan kode undangan.
5. Daftarkan email baru lagi, **Tolak**: layar pendaftar berubah menjadi "tidak disetujui". Klik **Setujui** pada daftar Sudah diproses: pendaftar bisa lanjut.
6. Akun non-admin tidak melihat menu Persetujuan akun, dan membuka `#persetujuan` mengarah ke Dashboard.
7. Akun lama Anda dan istri (yang dibuat sebelum fitur ini) tetap bisa masuk seperti biasa.

## F. Dana darurat, PDF, dan label anggaran (WAJIB diuji pemilik; belum diuji di browser)

Publish ulang `firestore.rules` terlebih dahulu (ada field baru `isEmergency` pada pos tabungan).

1. **Anggaran tepat 100%:** buat anggaran Rp100.000 untuk satu kategori, catat pengeluaran tepat Rp100.000. Status di menu Anggaran: **Anggaran habis**, merah, dan notifikasi "sudah mencapai 100% ... Sisa Rp0". Tambah Rp1.000: status **Melewati batas** dan banner "sudah melewati batas ... Melebihi anggaran Rp1.000".
2. **Dana darurat:** Tabungan > ubah pos Dana darurat > centang Tandai sebagai dana darurat. Muncul pil "Dana darurat" di kartu. Dengan data pengeluaran minimal satu bulan penuh sebelumnya, Dashboard dan halaman Tabungan menampilkan perkiraan bulan. Cek angkanya manual: saldo pos dibagi rata-rata pengeluaran bulanan (tanpa setoran tabungan).
3. **Tanpa pos bertanda:** hapus centang. Dashboard menampilkan "-" dan petunjuk menandai pos.
4. **PDF:** Laporan > Ringkasan > Cetak laporan PDF > Cetak / simpan PDF > Simpan sebagai PDF. Periksa: angka sama dengan layar Laporan, daftar transaksi lengkap, tabel tidak terpotong di tengah baris, halaman dan menu aplikasi tidak ikut tercetak, nama berkas berawalan "Laporan <bulan> <tahun>". Coba juga di HP.
5. **Bulan kosong:** pilih bulan tanpa data lalu cetak: laporan tetap terbentuk dengan keterangan "Tidak ada ...".
