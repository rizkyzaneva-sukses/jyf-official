# ELYASR Management System

Sistem manajemen operasional bisnis e-commerce multi-platform.

<!-- last updated: 2026-07-12 -->

## Stack
- **Frontend/Backend**: Next.js 15 (App Router)
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: iron-session (cookie-based)
- **UI**: TailwindCSS + custom components (dark mode)
- **State**: TanStack React Query
- **Report Telegram**: node-cron (auto daily/weekly/monthly)
- **AI Insights**: Antigravity API (1 Default + 1 Fallback)

---

## 🚀 Setup Lokal

### 1. Clone & Install
```bash
git clone https://github.com/rizkyzaneva-sukses/elyasr-ops.git
cd elyasr-ops
npm install
```

### 2. Environment
```bash
copy .env.example .env
# Edit .env — isi DATABASE_URL dan SESSION_SECRET
```

### 3. Database
```bash
# Jalankan PostgreSQL (atau pakai Docker)
docker-compose up db -d

# Push schema ke database
npm run db:push

# Seed initial data (admin user + wallets)
npm run db:seed
```

### 4. Jalankan dev server
```bash
npm run dev
# Buka http://localhost:3000
# Login: admin / admin123
```

---

## 🐳 Deploy ke EasyPanel (VPS)

### Step 1 — Siapkan PostgreSQL di EasyPanel
1. Buka EasyPanel → **Services** → **New Service** → **PostgreSQL**
2. Catat: host, port, user, password, database name
3. Connection string format:
   ```
   postgresql://USER:PASSWORD@HOST:PORT/DATABASE
   ```

### Step 2 — Push ke GitHub
```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/rizkyzaneva-sukses/elyasr-ops.git
git push -u origin master
```

### Step 3 — Buat App di EasyPanel
1. **New Service** → **App** → pilih **GitHub**
2. Pilih repo `elyasr-ops`
3. **Build Method**: Dockerfile
4. Set environment variables:

| Key | Value | Keterangan |
|-----|-------|------------|
| `DATABASE_URL` | `postgresql://user:pass@db-host:5432/elyasr_ops` | Koneksi PostgreSQL |
| `SESSION_SECRET` | Random 32+ karakter | Enkripsi session cookie |
| `NODE_ENV` | `production` | Mode production |
| `NEXT_PUBLIC_APP_NAME` | `ELYASR Business Operation` | Nama app |
| `ANTIGRAVITY_URL_1` | `https://api.example.com/v1` | AI provider default |
| `ANTIGRAVITY_KEY_1` | `your-api-key` | API key default |
| `ANTIGRAVITY_MODEL_1` | `model-name` | Model AI default |
| `ANTIGRAVITY_URL_2` | `https://fallback.example.com/v1` | AI provider fallback |
| `ANTIGRAVITY_KEY_2` | `your-fallback-key` | API key fallback |
| `ANTIGRAVITY_MODEL_2` | `fallback-model` | Model AI fallback |
| `TELEGRAM_BOT_TOKEN` | `123456:ABC-DEF` | Bot token Telegram |

5. **Port**: 3000
6. Deploy!

### Step 4 — Setup Database (first time)
Setelah app running, buka terminal EasyPanel atau SSH ke VPS:
```bash
# Jalankan migrations
npx prisma migrate deploy

# Seed initial data
npm run db:seed
```

### Step 5 — Login
- URL: `https://your-domain.easypanel.host`
- Username: `admin`
- Password: `admin123`
- ⚠️ **Ganti password segera setelah login pertama!**

---

## 📋 User Roles

| Role | Akses |
|------|-------|
| OWNER | Full access semua fitur + AI Insights |
| FINANCE | Procurement, Finance Room, Inventori internal, CRM, Alerts, Laporan |
| STAFF | Dashboard (terbatas), Orders, Scan Resi, Inventori operasional, Suggest Revision |
| EXTERNAL | External Inventory (read-only) |

---

## 🗄️ Database Commands

```bash
# Generate Prisma client
npm run db:generate

# Push schema (dev, tanpa migration file)
npm run db:push

# Buat migration file (production)
npm run db:migrate

# Deploy migrations (production)
npm run db:migrate:prod

# Seed data awal
npm run db:seed

# Buka Prisma Studio
npm run db:studio
```

---

## 📁 Struktur Project

```
elyasr-ops/
├── prisma/
│   ├── schema.prisma      # 30+ entities (AppUser, Order, Wallet, PO, dll)
│   └── seed.ts            # Initial data (admin + wallets)
├── src/
│   ├── app/
│   │   ├── api/           # API routes (orders, inventory, finance, report, ai, dll)
│   │   ├── dashboard/     # Dashboard CEO (scoreboard, KPI, cashflow, AR/AP)
│   │   ├── orders/        # Pesanan (import CSV TikTok/Shopee)
│   │   ├── inventory/     # Inventori (stok, ledger, scan, opname, master produk)
│   │   ├── procurement/   # Procurement (PO, vendor, payment, monitoring)
│   │   ├── finance/       # Finance Room (wallet, payout, utang-piutang, aset, laporan)
│   │   ├── reports/       # Laporan keuangan (P&L, Arus Kas, Neraca)
│   │   ├── ai-insights/   # AI Business Insights (review mingguan/bulanan)
│   │   ├── alerts/        # Alerts stok & operasional
│   │   ├── crm/           # CRM pelanggan
│   │   ├── owner-room/    # Owner Room (user mgmt, audit, backup, settings, telegram)
│   │   ├── scan-order/    # Scan resi kirim
│   │   ├── produk-gabungan/# Mapping SKU gabungan marketplace
│   │   ├── suggest-revision/# Board masukan & revisi
│   │   ├── documentation/ # Dokumentasi sistem
│   │   ├── external-inventory/ # Stok read-only untuk EXTERNAL
│   │   └── login/         # Halaman login
│   ├── components/
│   │   ├── layout/        # Sidebar, AppLayout
│   │   ├── ui/            # Shared UI components (modals, toaster)
│   │   └── providers.tsx  # Auth context + React Query
│   ├── lib/
│   │   ├── prisma.ts      # DB client singleton
│   │   ├── session.ts     # iron-session auth
│   │   ├── utils.ts       # Helpers (formatRupiah, cn, dll)
│   │   ├── api-helpers.ts # withAuth/withFinance/withOwnerOnly wrappers
│   │   ├── dashboard-helpers.ts # getTotalCash, getBurnRate, getMonthlyTarget
│   │   ├── order-parsers.ts # Parser CSV TikTok & Shopee
│   │   ├── daily-report.ts  # Builder laporan harian Telegram
│   │   ├── weekly-report.ts # Builder laporan mingguan Telegram
│   │   ├── monthly-report.ts # Builder laporan bulanan Telegram
│   │   ├── telegram.ts      # Broadcast multi-recipient Telegram
│   │   ├── telegram-menu.ts # Bot command menu
│   │   ├── telegram-ai.ts   # AI integration Telegram bot
│   │   ├── report-schedule.ts # Penjadwalan report
│   │   ├── report-scheduler.ts # Report scheduler engine
│   │   ├── po-pdf.ts        # Generator PDF Purchase Order
│   │   ├── rate-limit.ts    # Rate limiter (login, API)
│   │   ├── quick-commands.ts # Telegram quick commands
│   │   └── bot-tools/       # Telegram bot tools (analytics, finance, inventory, procurement, sales)
│   └── middleware.ts      # Role-based route protection
├── scripts/               # Utility scripts
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 🔐 Session Secret

Generate random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 Features

### Order & Sales
- ✅ Multi-platform order management (TikTok, Shopee, Tokopedia)
- ✅ CSV import otomatis (deteksi platform, parse SKU gabungan, hitung realOmzet)
- ✅ Scan resi kirim dengan beep feedback
- ✅ Mapping produk gabungan marketplace → SKU internal

### Inventory
- ✅ Real-time SOH calculation (stok awal + ledger IN − OUT)
- ✅ Barcode/SKU scan IN/OUT batch (draft → commit)
- ✅ Stock opname dengan reconciliation
- ✅ Alert stok kritis (SOH ≤ ROP, minus, habis)
- ✅ Inventory ledger (audit trail per SKU)

### Procurement
- ✅ Purchase Order (PO) dengan status tracking
- ✅ Goods receipt & auto-match ke PO (FIFO)
- ✅ Vendor management & vendor payments
- ✅ Print PO resmi (PDF dengan layout tabel adaptif)

### Finance
- ✅ Multi-wallet & financial ledger (11 tipe transaksi)
- ✅ Payout management (TikTok/Shopee)
- ✅ Utang & Piutang dengan tracking pembayaran
- ✅ Aset Tetap dengan penyusutan otomatis
- ✅ Modal Awal setup
- ✅ Laporan keuangan: P&L, Arus Kas, Neraca (balance-checked)

### Report & AI
- ✅ **Laporan Harian Telegram** — omzet, profit, kas & runway, target pacing, ROAS, 1–3 Eksekusi Besok (auto-derive), alert stok
- ✅ **Laporan Mingguan Telegram** — recap vs minggu lalu, top produk, 1–10 Eksekusi Minggu Depan (operasional + marketing + konten)
- ✅ **Laporan Bulanan Telegram** — P&L summary, growth, payout, top/bottom produk, top kota, breakdown pengeluaran
- ✅ **AI Business Insights** — analisis 5 dimensi (Operasional, Marketing, Finance, Creative, Strategis) via Antigravity API (1 Default + 1 Fallback)
- ✅ Auto-report scheduler (daily 17:30 WIB, weekly Senin 08:00, monthly tgl 1 09:00) dengan catch-up window & anti double-send
- ✅ Multi-recipient Telegram + support Group Topics

### Telegram Bot
- ✅ Bot webhook dengan command menu
- ✅ Quick commands: cek finance, inventory, procurement, sales
- ✅ AI-powered responses via Telegram

### Operasional
- ✅ Dashboard CEO (scoreboard, KPI, cashflow, AR/AP, inventory health, profitability)
- ✅ CRM pelanggan
- ✅ Alerts (stok kritis, operasional)
- ✅ Suggest Revision dengan paste screenshot
- ✅ External inventory read-only untuk role EXTERNAL
- ✅ Role-based access control (4 roles: OWNER, FINANCE, STAFF, EXTERNAL)
- ✅ Audit trail semua aksi penting
- ✅ Backup & restore
- ✅ Dark mode UI

---

## 📝 Testing

```bash
# Jalankan semua test
npm test

# Watch mode
npm run test:watch
```

---

## 🤖 Telegram Report Setup

### Konfigurasi (via Owner Room → Settings)
1. Masukkan **Bot Token** Telegram
2. Tambah **Telegram Recipients** (chat ID / group ID, opsional thread ID untuk grup dengan topics)
3. Atur **jadwal report** (daily/weekly)
4. Test kirim via tombol "Test" di UI

### Environment Variables (opsional, fallback)
```
TELEGRAM_BOT_TOKEN=123456:ABC-DEF
TELEGRAM_CHAT_ID=123456789
```

### AI Insights Setup
```
ANTIGRAVITY_URL_1=https://api.example.com/v1    # Default provider
ANTIGRAVITY_KEY_1=your-api-key
ANTIGRAVITY_MODEL_1=model-name
ANTIGRAVITY_URL_2=https://fallback.example.com/v1 # Fallback jika default error
ANTIGRAVITY_KEY_2=your-fallback-key
ANTIGRAVITY_MODEL_2=fallback-model
```

---

## 🔗 Tech Stack Reference

- [Next.js 15](https://nextjs.org/)
- [Prisma](https://www.prisma.io/)
- [TanStack Query](https://tanstack.com/query)
- [TailwindCSS](https://tailwindcss.com/)
- [iron-session](https://github.com/vvo/iron-session)
- [Radix UI](https://www.radix-ui.com/)
- [Recharts](https://recharts.org/)
- [Lucide Icons](https://lucide.dev/)
