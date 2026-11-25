# Pengujian

## A. Otomatis (sudah dijalankan saat pembuatan)

`npm test` menjalankan tes logika murni (`tests/`): rumus saldo, pergantian bulan, transaksi terlambat, koreksi dan hapus, tabungan tanpa penghitungan ganda, indikator anggaran 75/90/100, penentuan peringatan tanpa pengulangan, analisis otomatis, laporan periodik, CSV, utilitas tanggal. `npm run test:integration` menjalankan `ledger.js` dan `store.js` sungguhan dengan Firestore palsu: batch atomis (ledger + log audit + notifikasi), validasi input, pengiriman ulang tanpa duplikat, perilaku offline, peringatan anggaran 75/90/100% tepat sekali per ambang (termasuk teks pesan), edit/hapus, setoran dan transfer tabungan, target tercapai. `npm run check` memeriksa konsistensi impor antarmodul.

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
