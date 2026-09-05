# ERP Backend

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

Buka `http://localhost:5173`. Halaman **Pengaturan → Koneksi Database** memuat host, port, database, dan username dari `.env`; password perlu diisi setiap kali pengujian. Tombol **Uji Koneksi SQL Server** mengirim kredensial hanya untuk pengujian dan tidak menyimpannya.

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
   - `DB_ENCRYPT`: `true`
   - `DB_TRUST_SERVER_CERTIFICATE`: `true` untuk pengembangan; gunakan `false` dengan sertifikat valid
   - `JWT_SECRET`: secret acak minimal 32 karakter untuk menandatangani sesi login

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

Pada Heroku, filesystem dyno bersifat sementara. Karena itu perubahan koneksi dari halaman Settings hanya dapat diuji; agar permanen, ubah Config Vars di Heroku Dashboard lalu restart app. Untuk koneksi SQL Server publik, batasi firewall bila Anda memiliki alamat outbound statis; `0.0.0.0/0` sebaiknya hanya untuk pengujian.

## Login pertama

Setelah migrasi berhasil, buka dashboard. Jika tabel pengguna masih kosong, halaman otomatis meminta pembuatan Administrator pertama. Setelah akun dibuat, login berikutnya memakai username dan password tersebut. Password disimpan sebagai hash bcrypt, bukan teks asli.

Format koneksi pada halaman Settings mengikuti `sqlcmd`:

```text
tcp:PUBLIC_IP,1433
```
