# ERPJIN — PT Hajijin Amri

Backend awal untuk sistem ERP, memakai Node.js, TypeScript, Express, dan Microsoft SQL Server.

## Menjalankan proyek

1. File `.env` bersifat opsional. Jika belum berisi koneksi, aplikasi menampilkan wizard SQL Server sebelum login. Gunakan `DB_USERNAME`, bukan `USERNAME`, bila memilih menyimpan koneksi lokal.
2. Pasang dependensi:

   ```powershell
   npm install
   ```

3. Jalankan backend saat pengembangan:

   ```powershell
   npm run dev
   ```

Server tersedia di `http://localhost:3000` secara bawaan. Ubah `APP_PORT` dalam `.env` bila diperlukan.

## Menjalankan dashboard

Jalankan backend dan dashboard pada dua terminal terpisah dari root project:

```powershell
# Terminal 1 — API dan koneksi SQL Server
npm run dev
```

```powershell
# Terminal 2 — dashboard React
npm run dev:web
```

Buka `http://localhost:5173`. Alurnya adalah **hubungkan SQL Server → migrasi schema otomatis → buat Administrator pertama atau login → dashboard**. Koneksi lokal yang berhasil disimpan ke `.env`. Perubahan dari menu **Pengaturan** mengaktifkan database baru dan mengeluarkan sesi lama agar pengguna login dengan akun milik database baru tersebut.

## Endpoint awal

- `GET /health` — memastikan server Express berjalan.
- `GET /health/db` — menguji koneksi aplikasi ke SQL Server dan menampilkan nama server/database saja. Password tidak pernah dikembalikan.

Contoh pengujian dari PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/health
Invoke-RestMethod http://localhost:3000/health/db
```

Saat koneksi berhasil, endpoint database memberikan respons seperti ini:

```json
{
  "status": "ok",
  "database": "ERPDB",
  "server": "nama-server-sql"
}
```

## Membuat schema akses ERP

Migrasi awal membuat tabel `departments`, `roles`, `permissions`, `users`, `role_permissions`, `user_roles`, dan `audit_logs`, serta data dasar departemen, role, dan permission.

Jalankan dari root project:

```powershell
npm run db:migrate
```

Migrasi ini aman dijalankan ulang; tabel dan data bawaan hanya dibuat bila belum ada.

Migrasi berikutnya menambahkan master data Inventory: kategori, satuan, gudang, barang, dan transaksi stok. Jalankan kembali perintah yang sama setiap ada file migrasi baru.

## Catatan keamanan

- Jangan commit `.env`; file tersebut sudah dikecualikan melalui `.gitignore`.
- `DB_TRUST_SERVER_CERTIFICATE=true` hanya cocok untuk tahap pengembangan. Produksi harus menggunakan sertifikat TLS SQL Server yang valid dan mengubah nilai tersebut menjadi `false`.
- Batasi firewall SQL Server ke IP yang perlu mengaksesnya setelah pengujian selesai.

## Deploy ke Heroku

Project disiapkan sebagai satu aplikasi: Heroku membangun TypeScript dan React, lalu Express menyajikan wizard koneksi, API, dan dashboard. Jika belum ada koneksi, release phase dilewati dengan aman; migrasi berjalan otomatis setelah wizard berhasil terhubung.

1. Install Heroku CLI dan login:

   ```powershell
   heroku login
   ```

2. Buat repository Git jika belum ada:

   ```powershell
   git init
   git add .
   git commit -m "Prepare ERP application for Heroku"
   git branch -M main
   ```

3. Buat aplikasi Heroku:

   ```powershell
   heroku create NAMA-APLIKASI --stack heroku-26
   ```

4. Config Vars database tidak diperlukan untuk mode demo ini. Jangan membuat Config Var `PORT`; Heroku mengaturnya otomatis. `JWT_SECRET` juga opsional: bila kosong, aplikasi membuat secret sementara dan sesi login akan berakhir ketika dyno restart.

5. Deploy:

   ```powershell
   git push heroku main
   heroku open
   ```

6. Periksa status dan log bila diperlukan:

   ```powershell
   heroku ps
   heroku logs --tail
   ```

### Dyno dan konfigurasi melalui CLI

Project mempunyai proses `web` untuk Express dan `release` yang aman tanpa database. Gunakan tepat **satu dyno web** karena koneksi demo Heroku disimpan di memori proses.

Untuk demo/pengembangan yang boleh tidur saat tidak aktif, gunakan Eco (memerlukan langganan Eco):

```powershell
heroku ps:type web=eco -a NAMA-APLIKASI
heroku ps:scale web=1 -a NAMA-APLIKASI
```

Untuk penggunaan ERP yang harus selalu tersedia, mulai dari Basic:

```powershell
heroku ps:type web=basic -a NAMA-APLIKASI
heroku ps:scale web=1 -a NAMA-APLIKASI
```

Jika ingin sesi JWT tetap berlaku setelah restart, Anda boleh menambahkan satu Config Var `JWT_SECRET`. Ini opsional dan bukan tempat konfigurasi database:

Untuk membuat `JWT_SECRET` pada Windows PowerShell versi lama maupun baru:

```powershell
$jwtBytes = New-Object byte[] 48
$jwtGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
$jwtGenerator.GetBytes($jwtBytes)
$jwtSecret = [Convert]::ToBase64String($jwtBytes)
$jwtGenerator.Dispose()
```

```powershell
heroku config:set JWT_SECRET="$jwtSecret" -a NAMA-APLIKASI
heroku config -a NAMA-APLIKASI
```

Pada Heroku, koneksi aktif hanya tersimpan di memori dyno. Setelah restart/deploy, wizard akan muncul lagi. Ini sengaja untuk demo tanpa Config Vars; produksi memerlukan penyimpanan terenkripsi eksternal. Untuk SQL Server publik, `0.0.0.0/0` sebaiknya hanya untuk pengujian.

## Login pertama

Buka aplikasi dan isi koneksi SQL Server terlebih dahulu. ERPJIN menjalankan migrasi otomatis. Jika database tersebut belum mempunyai pengguna, halaman meminta pembuatan Administrator pertama; jika sudah, halaman login langsung muncul. Password ERP disimpan sebagai hash bcrypt, bukan teks asli.

Format koneksi pada halaman Settings mengikuti `sqlcmd`:

```text
tcp:PUBLIC_IP,1433
```

## Tahap fitur saat ini

- Dashboard, koneksi SQL Server, migrasi otomatis, dan kesiapan local/Heroku.
- Login serta bootstrap Administrator pertama dengan JWT dan bcrypt; status aktif, role, dan permission divalidasi ulang pada setiap request.
- User & Akses: daftar pengguna, tambah akun, ubah departemen/multi-role, aktif/nonaktif akun, serta editor permission per role.
- Inventory awal: master barang, ringkasan stok, serta transaksi masuk/keluar.
- Purchasing awal: supplier, Purchase Request multi-item, estimasi nilai, serta alur persetujuan/penolakan berbasis permission.

Permission `inventory.read` dan `inventory.manage` sudah diterapkan pada API. Administrator selalu mempunyai akses penuh; role lain mengikuti permission yang disimpan melalui menu **User & Akses → Role & Permission**.

Role operasional mempunyai permission awal yang aman: Warehouse Staff dapat membaca/mengelola inventory, sedangkan Manager, PPIC, QC, dan Finance mendapat akses baca. Administrator dapat menyesuaikannya melalui editor permission.

Tahap lanjutan yang belum dikerjakan adalah konversi Purchase Request menjadi Purchase Order, PPIC/Produksi, Quality Control, Finance, laporan dinamis, dan pengujian otomatis yang lebih lengkap.

## Memperbarui deployment Heroku

Setiap selesai mengubah aplikasi, jalankan pemeriksaan lengkap dari root project:

```powershell
npm run verify
```

Periksa file yang akan dikirim, buat commit baru, lalu push branch `main` ke aplikasi Heroku yang sudah terhubung:

```powershell
git status
git add .
git status
git commit -m "Jelaskan perubahan terbaru"
git push heroku main
```

Pastikan release baru berhasil sebelum menganggap deployment selesai:

```powershell
heroku releases -a ppic11
heroku ps -a ppic11
heroku logs --tail -a ppic11
```

Jika release gagal, lihat output release yang gagal dengan mengganti nomor versinya:

```powershell
heroku releases:output vN -a ppic11
```

Perubahan Config Vars membuat release baru secara otomatis. Pastikan release tersebut berstatus berhasil sebelum menjalankan atau memeriksa dyno `web`.
