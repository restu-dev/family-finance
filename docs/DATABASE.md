# Struktur Firestore

Semua data keuangan berada di bawah `families/{familyId}`. Hanya anggota aktif keluarga itu yang dapat membaca/menulis (lihat `firestore.rules`).
Nominal selalu **bilangan bulat rupiah**. Tanggal transaksi disimpan sebagai string `YYYY-MM-DD` (zona Asia/Jakarta), `monthId` = `YYYY-MM`.

| Koleksi | ID dokumen | Field utama |
|---|---|---|
| `users/{uid}` | uid Firebase Auth | `displayName`, `email`, `familyId` (null sampai bergabung), `createdAt` |
| `invites/{kode}` | kode 8 karakter | `familyId`, `active`, `createdBy`, `createdAt`, `usedBy` (saat dipakai) |
| `families/{familyId}` | otomatis | `name`, `currency` ("IDR"), `timezone`, `ownerUid`, `inviteCode`, `memberCount` (1 atau 2), `createdAt` |
| `.../members/{uid}` | uid | `uid`, `displayName`, `role` (owner/member), `status`, `joinedAt`, `inviteCode` (anggota yang bergabung) |
| `.../categories/{id}` | slug bawaan atau otomatis | `type` (income/expense), `name`, `isActive`, `isDefault`, `createdAt`, `updatedAt` |
| `.../ledger/{entryId}` | UUID dari form (anti duplikat) | `familyId`, `type`, `date`, `monthId`, `name`, `categoryId`, `amount`, `paymentMethod`, `description`, `savingsId`, `toSavingsId`, `status` (active/deleted), `createdBy`, `createdByName`, `createdAt`, `updatedBy`, `updatedAt` |
| `.../budgets/{monthId_categoryId}` | `YYYY-MM_kategori` | `monthId`, `categoryId`, `limitAmount`, `thresholds` (subset 75/90/100), `createdBy`, `createdAt`, `updatedAt` |
| `.../budgetAlerts/{kategori_bulan_ambang}` | deterministik | `categoryId`, `monthId`, `threshold`, `createdBy`, `createdAt` (hanya create) |
| `.../savingsGoals/{savingsId}` | otomatis | `name`, `targetAmount`, `startDate`, `targetDate` ("" bila kosong), `description`, `status` (active/achieved/archived), `createdBy`, `createdAt`, `updatedAt` |
| `.../notifications/{id}` | otomatis | `type`, `message`, `actorUid`, `actorName`, `readBy` ({uid: true}), `createdAt` |
| `.../activityLogs/{id}` | otomatis | `action`, `entityType`, `entityId`, `summary`, `before`, `after`, `actorUid`, `actorName`, `createdAt` (append-only) |

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
