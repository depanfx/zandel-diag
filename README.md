# Zandel Diag

Tool diagnostik device untuk bengkel **Zandel Service** — membantu teknisi mendiagnosis kondisi HP dan laptop secara cepat dan terstruktur.

## Stack

- **Frontend**: HTML/CSS/JS (vanilla)
- **Backend**: Node.js + Express
- **Database**: PostgreSQL 14
- **Server**: Nginx 1.18 + PM2 (VPS Biznet Gio, Ubuntu 22.04)

## Setup Lokal

### Prasyarat

- Node.js 20+
- PostgreSQL 14+

### Langkah

```bash
# Clone repo
git clone https://github.com/depanfx/zandel-diag.git
cd zandel-diag

# Setup backend
cd backend
cp .env.example .env
# Edit .env sesuai konfigurasi lokal
npm install
npm run dev
```

Backend berjalan di `http://localhost:3005`.
Health check: `GET http://localhost:3005/api/health`

## Deploy ke VPS

```bash
# Di VPS (Ubuntu 22.04)
git clone https://github.com/depanfx/zandel-diag.git /home/apotekadmin/zandel-diag

# Setup backend
cd /home/apotekadmin/zandel-diag/backend
cp .env.example .env
# Edit .env untuk production
npm install --omit=dev

# Start dengan PM2
pm2 start src/index.js --name zandel-diag
pm2 save

# Setup Nginx
sudo cp /home/apotekadmin/zandel-diag/nginx/apotekz.my.id.conf /etc/nginx/sites-available/apotekz.my.id
sudo ln -s /etc/nginx/sites-available/apotekz.my.id /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Struktur Folder

```
zandel-diag/
├── frontend/               # Static files (HTML/CSS/JS)
│   ├── index.html
│   └── assets/
│       ├── css/main.css
│       ├── js/main.js
│       └── fonts/
├── backend/                # Node.js API
│   ├── src/
│   │   ├── index.js        # Entry point
│   │   ├── routes/         # Express routers
│   │   ├── controllers/    # Business logic
│   │   ├── models/         # DB queries
│   │   └── middleware/     # Auth, error handling
│   ├── package.json
│   └── .env.example
├── nginx/                  # Nginx config
│   └── apotekz.my.id.conf
├── .gitignore
└── README.md
```
