# Zandel Diag — VPS Deployment Guide

Target server: **apotekz.my.id** (Biznet Gio, Ubuntu 22.04)

---

## Prerequisites

Pastikan sudah terinstall di server:

```bash
node -v   # Node.js 20+
npm -v
psql -V   # PostgreSQL 14+
pm2 -v    # PM2 (npm install -g pm2)
nginx -v  # Nginx 1.18+
```

Install jika belum ada:
```bash
# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm install -g pm2

# Nginx + Certbot
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## Step 1 — Clone Repository

```bash
cd /home/apotekadmin/zandel-diag
git clone https://github.com/depanfx/zandel-diag.git .
```

---

## Step 2 — Backend Dependencies

```bash
cd /home/apotekadmin/zandel-diag/backend
npm install --omit=dev
```

---

## Step 3 — Environment Variables

```bash
cp .env.example .env
nano .env
```

Isi dengan nilai produksi:
```env
DATABASE_URL=postgresql://zandeldiag_user:STRONG_PASSWORD@localhost:5432/zandeldiag
JWT_SECRET=GANTI_INI_DENGAN_STRING_RANDOM_PANJANG_MIN_32_KARAKTER
PORT=3005
NODE_ENV=production
FRONTEND_URL=https://apotekz.my.id
```

Generate JWT_SECRET yang aman:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Step 4 — Database Setup

### 4a. Buat user dan database PostgreSQL

```bash
sudo -u postgres psql
```

Di dalam psql:
```sql
CREATE USER zandeldiag_user WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE zandeldiag OWNER zandeldiag_user;
GRANT ALL PRIVILEGES ON DATABASE zandeldiag TO zandeldiag_user;
\q
```

### 4b. Jalankan skema database

```bash
cd /home/apotekadmin/zandel-diag/backend
node src/setup-db.js
```

Output yang diharapkan:
```
Database setup complete.
Default superadmin created: admin / ZandelDiag2024!
```

> **PENTING:** Segera ganti password default superadmin setelah login pertama kali!

---

## Step 5 — PM2 Process Manager

```bash
cd /home/apotekadmin/zandel-diag/backend
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

Jalankan perintah yang ditampilkan oleh `pm2 startup` (biasanya mulai dengan `sudo env PATH=...`).

Verifikasi:
```bash
pm2 list
pm2 logs zandel-diag --lines 20
```

---

## Step 6 — Nginx Configuration

```bash
sudo cp /home/apotekadmin/zandel-diag/nginx/apotekz.my.id.conf /etc/nginx/sites-available/apotekz.my.id
sudo ln -sf /etc/nginx/sites-available/apotekz.my.id /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## Step 7 — SSL Certificate

```bash
sudo certbot --nginx -d apotekz.my.id
```

Pilih opsi redirect HTTP ke HTTPS saat diminta. Certbot akan otomatis update konfigurasi Nginx.

Verifikasi auto-renewal:
```bash
sudo certbot renew --dry-run
```

---

## Step 8 — Verifikasi

```bash
# Health check backend
curl https://apotekz.my.id/api/health

# Seharusnya menjawab:
# {"status":"ok","timestamp":"..."}
```

Buka browser di:
- `https://apotekz.my.id` — frontend
- `https://apotekz.my.id/#login` — halaman login

Login dengan: **admin / ZandelDiag2024!** — lalu ganti password segera.

---

## Update Workflow

Setiap kali ada perubahan kode:

```bash
cd /home/apotekadmin/zandel-diag
git pull origin main
cd backend
npm install --omit=dev
pm2 restart zandel-diag
```

Jika ada perubahan schema database:
```bash
node src/setup-db.js
pm2 restart zandel-diag
```

---

## Troubleshooting

**Backend tidak mau start:**
```bash
pm2 logs zandel-diag --lines 50
# Cek apakah .env sudah benar
# Cek apakah PostgreSQL berjalan: sudo systemctl status postgresql
```

**502 Bad Gateway dari Nginx:**
```bash
# Pastikan backend jalan di port 3005
curl http://127.0.0.1:3005/api/health
pm2 list
```

**Frontend tidak update setelah git pull:**
```bash
# Frontend adalah file statis, nginx langsung serve dari /home/apotekadmin/zandel-diag/frontend
# Tidak perlu build step — perubahan langsung aktif setelah git pull
sudo nginx -t && sudo systemctl reload nginx
```

**Database connection error:**
```bash
# Test koneksi
psql "postgresql://zandeldiag_user:STRONG_PASSWORD@localhost:5432/zandeldiag" -c "\dt"
```

---

## Default Credentials

| Field    | Value              |
|----------|--------------------|
| Username | `admin`            |
| Password | `ZandelDiag2024!`  |
| Role     | `superadmin`       |

**Ganti password ini segera setelah deploy pertama via Admin Panel > Edit akun.**
