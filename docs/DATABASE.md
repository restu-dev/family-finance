# Struktur Firestore

Semua data keuangan berada di bawah `families/{familyId}`. Hanya anggota aktif keluarga itu yang dapat membaca/menulis (lihat `firestore.rules`).
Nominal selalu **bilangan bulat rupiah**. Tanggal transaksi disimpan sebagai string `YYYY-MM-DD` (zona Asia/Jakarta), `monthId` = `YYYY-MM`.

| Koleksi | ID dokumen | Field utama |
|---|---|---|
| `users/{uid}` | uid Firebase Auth | `displayName`, `email`, `familyId` (null sampai bergabung), `approvalStatus` (pending/approved/rejected; akun lama tanpa field dianggap approved), `reviewedBy`, `reviewedAt`, `createdAt` |
| `admins/{uid}` | uid pemilik aplikasi | `enabled`. Hanya dibuat lewat Console; pengguna hanya dapat memeriksa dokumennya sendiri |
| `invites/{kode}` | kode 8 karakter | `familyId`, `active`, `createdBy`, `createdAt`, `usedBy` (saat dipakai) |
| `families/{familyId}` | otomatis | `name`, `currency` ("IDR"), `timezone`, `ownerUid`, `inviteCode`, `memberCount` (1 atau 2), `partnerUid` (uid anggota kedua, null bila sendiri), `createdAt` |
| `.../members/{uid}` | uid | `uid`, `displayName`, `role` (owner/member), `status`, `joinedAt`, `inviteCode` (anggota yang bergabung) |
| `.../categories/{id}` | slug bawaan atau otomatis | `type` (income/expense), `name`, `isActive`, `isDefault`, `createdAt`, `updatedAt` |
| `.../ledger/{entryId}` | UUID dari form (anti duplikat) | `familyId`, `type`, `date`, `monthId`, `name`, `categoryId`, `amount`, `paymentMethod`, `description`, `savingsId`, `toSavingsId`, `status` (active/deleted), `createdBy`, `createdByName`, `createdAt`, `updatedBy`, `updatedAt` |
| `.../budgets/{monthId_categoryId}` | `YYYY-MM_kategori` | `monthId`, `categoryId`, `limitAmount`, `thresholds` (subset 75/90/100), `createdBy`, `createdAt`, `updatedAt` |
| `.../budgetAlerts/{kategori_bulan_ambang}` | deterministik | `categoryId`, `monthId`, `threshold`, `createdBy`, `createdAt` (hanya create) |
| `.../savingsGoals/{savingsId}` | otomatis | `name`, `targetAmount`, `startDate`, `targetDate` ("" bila kosong), `description`, `status` (active/achieved/archived), `createdBy`, `createdAt`, `updatedAt` |
| `.../notifications/{id}` | otomatis | `type`, `message`, `actorUid`, `actorName`, `readBy` ({uid: true}), `createdAt` |
| `.../pushTokens/{sha256(token)}` | hash token FCM | `token`, `uid`, `updatedAt` (hanya terbaca oleh pemiliknya; server membaca semuanya) |
| `.../activityLogs/{id}` | otomatis | `action`, `entityType` (ledger/budget/savingsGoal/member), `entityId`, `summary`, `before`, `after`, `actorUid`, `actorName`, `createdAt` (append-only) |

## Jenis entri ledger

| `type` | Saldo utama | Pos tabungan | Dihitung sebagai |
|---|---|---|---|
| `opening_balance` | + | - | Saldo awal (bukan pemasukan) |
| `income` | + | - | Pemasukan |
| `expense` | - | - | Pengeluaran |
| `savings_deposit` | - | + (`savingsId`) | Perpindahan internal, **bukan** pengeluaran |
| `savings_withdraw` | + | - (`savingsId`) | Perpindahan internal, **bukan** pemasukan |
| `savings_transfer` | 0 | - `savingsId`, + `toSavingsId` | Netral |

## Rumus (semua dihitung dari ledger, lihat `assets/js/balance.js`)

```
Saldo utama (sampai tanggal T) = saldo awal + pemasukan - pengeluaran - setoran tabungan + tarikan tabungan   (entri aktif, date <= T)
Saldo awal bulan M  = saldo utama sebelum tanggal 1 bulan M
Saldo akhir bulan M = saldo awal M + pemasukan M - pengeluaran M - setoran M + tarikan M
Saldo pos tabungan  = Σ efek entri aktif pada pos itu
Total kekayaan      = saldo utama + Σ saldo semua pos tabungan
```

## Keputusan desain yang berbeda dari rancangan awal (dan alasannya)

- **`currentBalance` pos tabungan tidak disimpan.** Dihitung dari ledger. Angka tersimpan tidak bisa diverifikasi Security Rules dan bisa menyimpang; angka turunan tidak.
- **`monthlySummaries` tidak dipakai.** Ringkasan bulan dihitung langsung dari ledger, jadi transaksi terlambat otomatis memperbarui saldo akhir bulan itu dan saldo awal bulan berikutnya, tanpa proses reset.
- **Satu koleksi `ledger`** menggantikan `transactions` + `savingsTransactions` agar tidak ada penghitungan ganda.
- **Hapus = `status: "deleted"`.** Tidak ada penghapusan fisik transaksi; jejaknya tetap ada di `activityLogs`.

## Keanggotaan

- Keluar atau dikeluarkan = dokumen `members/{uid}` **dihapus**, `memberCount` turun ke 1, `partnerUid` dikosongkan, semuanya dalam satu batch yang dikunci Security Rules (tidak ada cara menurunkan hitungan tanpa menghapus anggota, atau sebaliknya).
- Transaksi yang pernah dicatat tidak dihapus. `createdBy` menyimpan uid; nama yang ditampilkan diambil dari data anggota saat ini (`createdByName` hanya cadangan).
- Pengguna yang dikeluarkan pemilik tidak bisa mengubah profilnya saat itu juga; saat membuka aplikasi, `users/{uid}.familyId` dikosongkan oleh aplikasinya sendiri, dan rules hanya mengizinkannya bila data anggotanya memang sudah tidak ada.
- Ganti nama mengubah `users/{uid}.displayName` dan `members/{uid}.displayName` dalam satu batch; rules menolak bila keduanya tidak sama.
- `notifications.pushedAt` ditulis server saat push dikirim (mencegah kiriman ganda); klien tidak bisa mengubahnya.
