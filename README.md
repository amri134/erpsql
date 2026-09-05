# ERPJIN — PT Hajijin Amri

Backend awal untuk sistem ERP, memakai Node.js, TypeScript, Express, dan Microsoft SQL Server.

## Menjalankan proyek

1. Pastikan file `.env` terisi. Gunakan `.env.example` sebagai acuan dan jangan menyimpan password di Git. Gunakan `DB_USERNAME`, bukan `USERNAME`, karena Windows sudah memakai `USERNAME` untuk nama akun komputer.
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

Buka `http://localhost:5173`. Setelah login sebagai Administrator, halaman **Pengaturan → Koneksi Database** memuat konfigurasi dari `.env`. Password perlu diisi setiap kali menguji perubahan. Jika koneksi berhasil, konfigurasi lokal disimpan ke `.env`; jika gagal, konfigurasi tidak ditimpa dan dapat dikoreksi. Di Heroku, penyimpanan permanen tetap dilakukan melalui Config Vars.

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

Project disiapkan sebagai satu aplikasi: Heroku membangun TypeScript dan React, menjalankan migrasi pada release phase, lalu Express menyajikan API dan dashboard.

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

4. Tambahkan Config Vars melalui **Heroku Dashboard → App → Settings → Config Vars**:

   - `SERVER`: host SQL Server
   - `DB_PORT`: `1433`
   - `DATABASE`: nama database
   - `DB_USERNAME`: login SQL Server
   - `PASSWORD`: password SQL Server
   - `JWT_SECRET`: secret acak minimal 32 karakter untuk menandatangani sesi login

   `DB_ENCRYPT` dan `DB_TRUST_SERVER_CERTIFICATE` bersifat opsional; jika tidak diisi, aplikasi memakai `true`. Untuk SQL Server dengan sertifikat TLS resmi, atur `DB_TRUST_SERVER_CERTIFICATE=false`.

   Jangan membuat Config Var bernama `PORT`; Heroku mengaturnya secara otomatis.

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

Project mempunyai proses `web` untuk Express dan `release` untuk migrasi. Proses `release` berjalan sekali sebelum rilis aktif, sehingga yang perlu dinyalakan terus hanya satu dyno `web`.

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

Config Vars minimum dapat diatur dari PowerShell sebagai berikut. Ganti seluruh nilai contoh dan jangan menyalin password asli ke dokumentasi atau Git:

Untuk membuat `JWT_SECRET` pada Windows PowerShell versi lama maupun baru:

```powershell
$jwtBytes = New-Object byte[] 48
$jwtGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
$jwtGenerator.GetBytes($jwtBytes)
$jwtSecret = [Convert]::ToBase64String($jwtBytes)
$jwtGenerator.Dispose()
```

```powershell
heroku config:set SERVER="PUBLIC_IP_SQL" DB_PORT="1433" DATABASE="erp" DB_USERNAME="sqlserver" PASSWORD="PASSWORD_SQL" JWT_SECRET="$jwtSecret" -a NAMA-APLIKASI
heroku config -a NAMA-APLIKASI
```

Perintah pertama menyimpan nilai sensitif dalam riwayat terminal. Untuk mesin bersama, masukkan `PASSWORD` dan `JWT_SECRET` melalui Dashboard Heroku, atau bersihkan riwayat PowerShell setelah konfigurasi.

Pada Heroku, filesystem dyno bersifat sementara. Karena itu perubahan koneksi dari halaman Settings hanya dapat diuji; agar permanen, ubah Config Vars di Heroku Dashboard lalu restart app. Untuk koneksi SQL Server publik, batasi firewall bila Anda memiliki alamat outbound statis; `0.0.0.0/0` sebaiknya hanya untuk pengujian.

## Login pertama

Setelah migrasi berhasil, buka dashboard. Jika tabel pengguna masih kosong, halaman otomatis meminta pembuatan Administrator pertama. Setelah akun dibuat, login berikutnya memakai username dan password tersebut. Password disimpan sebagai hash bcrypt, bukan teks asli.

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
