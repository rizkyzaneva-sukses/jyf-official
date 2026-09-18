'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect } from 'react'
import { useAuth } from '@/components/providers'
import {
  BookOpen, LayoutDashboard, ShoppingCart, Package, ScanLine,
  Wallet, Users, Shield, ClipboardCheck, Building2, CreditCard,
  BarChart3, TrendingUp, AlertTriangle, FileText, Database,
  Store, MessageSquarePlus, Megaphone, GitMerge, Brain,
  ChevronDown, ChevronRight, CheckCircle2, Clock, Zap,
  ArrowRight, Star, Info, Boxes, Receipt, PiggyBank,
  Landmark, PackageSearch, Truck, BadgeCheck, CircleDot,
  Lock, Unlock, Eye, EyeOff, Lightbulb,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type RoleKey = 'OWNER' | 'FINANCE' | 'STAFF' | 'EXTERNAL'

interface WorkflowStep {
  time?: string
  title: string
  desc: string
  path?: string
  icon: React.ElementType
  tips?: string[]
}

interface Module {
  icon: React.ElementType
  color: string
  title: string
  path: string
  desc: string
  keyActions: string[]
}

interface RoleData {
  key: RoleKey
  label: string
  color: string
  bg: string
  border: string
  ring: string
  tagline: string
  description: string
  dailyWorkflow: WorkflowStep[]
  weeklyTasks: string[]
  modules: Module[]
  importantNotes: string[]
}

interface OwnerSecretFeature {
  title: string
  icon: React.ElementType
  desc: string
  details: string[]
  useCases: string[]
  tips: string[]
}

// ─── Role Data ────────────────────────────────────────────────────────────────

const OWNER_SECRET_FEATURES: OwnerSecretFeature[] = [
  {
    title: '🔐 User Management & Role Assignment',
    icon: Users,
    desc: 'Buat, edit, dan kelola akun pengguna dengan role assignment. Kontrol siapa yang bisa akses modul apa.',
    details: [
      'Buat user baru dengan username & password unik',
      'Assign role: OWNER, FINANCE, STAFF, EXTERNAL',
      'Edit user: nama, role, password, status aktif/nonaktif',
      'Bulk deactivate users yang sudah resign',
      'Reset password user jika lupa',
      'Track user activity melalui audit logs',
    ],
    useCases: [
      'Onboard karyawan baru → buat user + assign role STAFF/FINANCE',
      'Promosi user → ubah role dari STAFF ke FINANCE',
      'Offboard → deactivate akun untuk security',
      'Vendor integration → create EXTERNAL user untuk mitra',
    ],
    tips: [
      'JANGAN share admin credentials dengan siapa saja',
      'Ganti default password admin (admin/admin123) setelah first login',
      'Backup passwords lama sebelum reset',
      'Monitor user activity di Audit Logs jika ada aktivitas mencurigakan',
    ],
  },
  {
    title: '📊 Audit Trail & Activity Monitoring',
    icon: BarChart3,
    desc: 'Pantau semua aktivitas sistem: siapa edit apa, kapan, dan hasilnya. Essential untuk compliance & security audit.',
    details: [
      'Real-time log: CREATE, UPDATE, DELETE, SCAN, COMMIT, CANCEL',
      'Filter by user, modul, date range',
      'Lihat full detail: siapa, tanggal, waktu, perubahan data',
      'Export audit log untuk arsip compliance',
      'Search user activity spesifik',
      'Detect anomali: edit data multiple kali, delete bulk, perubahan harga HPP',
    ],
    useCases: [
      'Audit internal: verifikasi siapa yang edit harga/HPP bulan lalu',
      'Investigasi bug: track kapan data corrupted',
      'Compliance: siap untuk audit eksternal/pajak',
      'Security: deteksi unauthorized access atau bulk delete',
    ],
    tips: [
      'Rutin check audit logs 1x/minggu untuk anomali',
      'Jika ada perubahan mencurigakan, cross-check dengan user yang bersangkutan',
      'Archive audit logs bulanan untuk historical records',
      'Alert: lebih dari 5 DELETE dalam 10 menit = suspicious activity',
    ],
  },
  {
    title: '💾 Data Backup & Restore',
    icon: Database,
    desc: 'Export semua data aplikasi dalam format JSON atau import kembali. Backup sebelum perubahan besar, import untuk disaster recovery.',
    details: [
      'Export all entities: products, orders, vendors, wallets, ledger, SKU mappings',
      'Format JSON terstruktur dengan metadata (exportedAt, exportedBy)',
      'Single entity export atau all-in-one backup',
      'Import dengan duplicate handling: INSERT baru / UPDATE existing',
      'Preview data sebelum import (preview count)',
      'Restore dari backup lama kapan saja tanpa downtime',
    ],
    useCases: [
      'Sebelum migrasi server → backup all data',
      'Disaster recovery → restore dari backup harian',
      'Migration antar sistem → export dari old system, import ke baru',
      'Bulk data reset untuk testing → backup produksi, clear data, test, restore',
      'Data analysis → export historical data untuk analisis di Excel/Python',
    ],
    tips: [
      'Backup SETIAP HARI PUKUL 23:59 → simpan di drive/nas',
      'Test restore backup 1x/bulan untuk ensure dapat direcover',
      'Jangan export saat high traffic → bisa lambat/timeout',
      'Simpan encrypted backup offline untuk disaster recovery',
      'Dokumentasikan: tanggal backup, jumlah records, purpose',
    ],
  },
  {
    title: '⚙️ System Settings & Configuration',
    icon: Shield,
    desc: 'Konfigurasi platform fee, Telegram bot, master data, dan parameter sistem lainnya.',
    details: [
      'Platform fee: Shopee %, TikTok % (otomatis hitung net omzet)',
      'Telegram bot config: chat ID, thread ID, schedule laporan',
      'Report frequency: daily (jadwal DB), weekly Senin, monthly tgl 2 09:00 (Laba Rugi kas)',
      'Master categories: expense categories untuk profit calculation',
      'ROP (Reorder Point): minimum stok default per kategori',
      'HPP default: untuk produk baru',
      'Currency & timezone setting',
    ],
    useCases: [
      'Setup: konfigurasi platform fee saat pertama kali setup',
      'Telegram integration: set chat ID untuk laporan otomatis',
      'Adjust fee: jika Shopee/TikTok fee berubah, update langsung di setting',
      'Master kategori: tambah kategori expense baru untuk akun akuntan',
    ],
    tips: [
      'Platform fee harus akurat — mempengaruhi profit calculation',
      'Telegram chat ID harus group/supergroup, bukan personal chat',
      'Jangan asal ubah ROP default — bisa trigger false alerts stok',
      'Backup setting sebelum perubahan besar',
    ],
  },
  {
    title: '🎯 Advanced Data Management',
    icon: Database,
    desc: 'Bulk operasi data: import, update, delete. Fitur power-user untuk manajemen skala besar.',
    details: [
      'Bulk delete products (soft delete/deactivate)',
      'Bulk import products dari Excel dengan format standar',
      'Update HPP & ROP bulk untuk kategori tertentu',
      'Migrate SKU: merge/split produk dengan mapping',
      'Bulk edit product metadata (category, unit, deskripsi)',
      'CSV export/import untuk integration eksternal',
    ],
    useCases: [
      'Stock reset: awal tahun, deactivate all products, import dari master baru',
      'HPP adjustment: semua produk naikkan harga 10% → bulk update HPP',
      'Category merge: pisahkan produk ke kategori baru → bulk recategorize',
      'Marketplace sync: import produk dari Shopee bulk 500 SKU',
    ],
    tips: [
      'ALWAYS backup sebelum bulk delete — tidak bisa undo!',
      'Test dengan sample data dulu sebelum bulk import besar',
      'Jangan import saat peak traffic hours (19:00-22:00)',
      'Validate file format sebelum upload (check HPP, SKU unique)',
      'Monitor server resources saat bulk operation berjalan',
    ],
  },
  {
    title: '🤖 AI Strategic Insights',
    icon: Brain,
    desc: 'AI-powered analytics untuk strategi bisnis: ROAS analysis, margin optimization, inventory forecasting, trend prediction.',
    details: [
      'Weekly AI Brief: ringkasan strategi untuk minggu depan',
      'ROAS optimization: per platform, recommended budget reallocation',
      'Margin analysis: produk paling profitable, produk loss-leader',
      'Inventory forecast: prediksi penjualan 2 minggu ke depan',
      'Trend analysis: produk trend naik/turun dalam 30 hari',
      'Competitor pricing: rekomendasi harga vs kompetitor (jika data tersedia)',
      'Cash flow forecast: proyeksi likuiditas bulan depan',
    ],
    useCases: [
      'Setiap Senin pagi: baca AI Brief → buat keputusan strategis minggu ini',
      'Optimalkan ad spend: lihat ROAS per platform → reallocate budget',
      'Manage inventory: lihat forecast → buat PO lebih akurat, kurangi deadstock',
      'Pricing strategy: lihat margin analysis → adjust harga produk low-margin',
    ],
    tips: [
      'AI insights akurat hanya jika data bersih (cek audit logs untuk anomali)',
      'Jangan 100% percaya AI — cross-check dengan domain knowledge Anda',
      'Update master data rutin agar AI training data akurat',
      'Archive AI Brief bulanan untuk historical analysis & learning',
      'Share AI Insights dengan tim Finance/Manager untuk diskusi strategis',
    ],
  },
]

const ROLES: RoleData[] = [
  // ══════════════════════════════════════════════════════════ OWNER
  {
    key: 'OWNER',
    label: 'Owner',
    color: 'text-emerald-400',
    bg: 'bg-emerald-900/30',
    border: 'border-emerald-700',
    ring: 'ring-emerald-500/30',
    tagline: 'Akses penuh ke semua modul',
    description:
      'Owner memiliki akses ke seluruh sistem tanpa batasan — dari laporan keuangan, manajemen user, hingga AI Insights. Bertanggung jawab atas keputusan strategis bisnis berdasarkan data real-time.',

    dailyWorkflow: [
      {
        time: '08.00',
        icon: LayoutDashboard,
        title: 'Buka Dashboard',
        path: '/dashboard',
        desc: 'Lihat KPI utama hari ini: Omzet, Gross Profit, Stok Kritis, dan Aging Backlog. Ganti filter ke "Hari Ini" untuk data terkini. Pantau ROAS per platform (Shopee/TikTok).',
        tips: ['Jika Backlog >48 Jam merah → segera koordinasi tim gudang', 'ROAS < 2x → evaluasi spending iklan platform tersebut'],
      },
      {
        time: '08.15',
        icon: AlertTriangle,
        title: 'Cek Alerts',
        path: '/alerts',
        desc: 'Buka halaman Alerts untuk lihat stok habis, stok kritis, dan order pending terlalu lama. Tindaki sesuai prioritas — buat PO jika stok hampir habis.',
        tips: ['Klik "Buat PO" langsung dari alert stok kritis untuk lanjut ke Procurement'],
      },
      {
        time: '08.30',
        icon: ShoppingCart,
        title: 'Review Pesanan Baru',
        path: '/orders',
        desc: 'Filter pesanan dengan status "Perlu Dikirim". Pastikan tidak ada order yang stuck tanpa resi. Untuk pesanan bermasalah, edit langsung dari halaman ini.',
        tips: ['Gunakan filter Platform untuk focus per marketplace', 'Bulk delete duplikat import jika ada'],
      },
      {
        time: '09.00',
        icon: Wallet,
        title: 'Pantau Saldo & Finance',
        path: '/finance',
        desc: 'Cek saldo wallet aktif. Lihat apakah ada payout marketplace yang masuk hari ini (tab Payout). Jika ada pengeluaran operasional, catat di Wallet & Ledger.',
        tips: ['Tab Budget Iklan → catat spending iklan harian per platform', 'Utang jatuh tempo muncul di tab Utang & Piutang'],
      },
      {
        time: '17.00',
        icon: Brain,
        title: 'Cek Laporan Harian (Telegram)',
        path: '/owner-room',
        desc: 'Laporan harian otomatis dikirim via Telegram setiap sore. Lihat ringkasan omzet, profit, stok kritis, dan order pending. Bisa juga tanya langsung ke bot Telegram.',
        tips: ['Ketik "omset hari ini" atau "stok kritis" ke bot Telegram', 'Bot bisa jawab pertanyaan tanggal spesifik, misal "omset 1-5 Mei"'],
      },
    ],

    weeklyTasks: [
      'Senin pagi: Generate AI Weekly Brief di /ai-insights → baca rekomendasi, delegasikan ke manager',
      'Review Laporan Laba Rugi (Finance → Laporan) — pastikan margin sesuai target',
      'Cek ROAS per platform di Dashboard → evaluasi alokasi budget iklan minggu depan',
      'Review outstanding PO di Procurement → follow up vendor yang terlambat',
      'Audit Log (Owner Room) → spot-check aktivitas user jika ada yang mencurigakan',
      'Backup data mingguan via Owner Room → Tab Backup Data',
    ],

    modules: [
      {
        icon: LayoutDashboard, color: 'text-emerald-400',
        title: 'Dashboard', path: '/dashboard',
        desc: 'Ringkasan KPI real-time bisnis.',
        keyActions: ['Filter tanggal fleksibel (Hari ini, Minggu, Bulan)', 'ROAS per platform otomatis', 'Aging backlog visual', 'Top Provinsi & Kota'],
      },
      {
        icon: ShoppingCart, color: 'text-blue-400',
        title: 'Pesanan', path: '/orders',
        desc: 'Manajemen order dari semua marketplace.',
        keyActions: ['Import CSV TikTok/Shopee', 'Edit & hapus order (Owner only)', 'Bulk delete', 'Export ke CSV'],
      },
      {
        icon: ScanLine, color: 'text-cyan-400',
        title: 'Scan Resi', path: '/scan-order',
        desc: 'Verifikasi pengiriman via scan barcode.',
        keyActions: ['Scan barcode / kamera', 'Deteksi duplikat otomatis', 'Bulk upload CSV resi', 'Riwayat scan harian'],
      },
      {
        icon: Package, color: 'text-yellow-400',
        title: 'Inventori', path: '/inventory',
        desc: 'Stok overview, ledger, scan, opname, master produk.',
        keyActions: ['SOH real-time per SKU', 'Scan masuk/keluar/endorsement', 'Stock opname & adjustment', 'Master produk & ROP'],
      },
      {
        icon: GitMerge, color: 'text-yellow-400',
        title: 'Produk Gabungan', path: '/produk-gabungan',
        desc: 'Mapping SKU marketplace ke SKU internal.',
        keyActions: ['Tambah/edit mapping bundle', 'Import massal dari Excel', 'Otomatis split saat import order'],
      },
      {
        icon: FileText, color: 'text-orange-400',
        title: 'Procurement', path: '/procurement',
        desc: 'PO, vendor, dan pembayaran supplier.',
        keyActions: ['Buat PO ke vendor', 'Catat pembayaran', 'Monitor PO overdue', 'Print dokumen PO resmi'],
      },
      {
        icon: Wallet, color: 'text-violet-400',
        title: 'Finance Room', path: '/finance',
        desc: 'Wallet, iklan, aset, modal, payout, utang, laporan.',
        keyActions: ['Catat spending iklan per platform', 'Laporan L/R & Neraca', 'Utang & Piutang', 'Modal awal & payout'],
      },
      {
        icon: Users, color: 'text-pink-400',
        title: 'CRM', path: '/crm',
        desc: 'Manajemen data pelanggan.',
        keyActions: ['Riwayat pembelian per pelanggan', 'Segmentasi pelanggan', 'Tambah & edit kontak'],
      },
      {
        icon: AlertTriangle, color: 'text-red-400',
        title: 'Alerts', path: '/alerts',
        desc: 'Peringatan stok kritis & order delayed.',
        keyActions: ['Stok habis & kritis', 'Order pending >24/48 jam', 'Auto-refresh 5 menit', 'Shortcut buat PO'],
      },
      {
        icon: Brain, color: 'text-purple-400',
        title: 'AI Insights', path: '/ai-insights',
        desc: 'Analisis bisnis mingguan oleh AI.',
        keyActions: ['Weekly/Monthly review', 'Insight ROAS, stok, margin', 'Rekomendasi CEO-level', 'Snapshot data otomatis'],
      },
      {
        icon: Shield, color: 'text-emerald-400',
        title: 'Owner Room', path: '/owner-room',
        desc: 'Admin sistem eksklusif Owner.',
        keyActions: ['Manajemen user & role', 'Audit log semua aktivitas', 'Backup & restore data', 'Konfigurasi platform fee & Telegram bot'],
      },
      {
        icon: MessageSquarePlus, color: 'text-zinc-400',
        title: 'Suggest Revision', path: '/suggest-revision',
        desc: 'Papan masukan & bug report internal.',
        keyActions: ['Tambah saran dengan screenshot (CTRL+V)', 'Tandai selesai/pending', 'Akses semua role'],
      },
    ],

    importantNotes: [
      'Hanya Owner yang bisa hapus pesanan, edit harga, dan akses Owner Room',
      'AI Insights tersedia di /ai-insights — generate weekly untuk rekomendasi strategis',
      'Konfigurasi Telegram bot (chat ID, jadwal laporan) ada di Owner Room → Pengaturan',
      'Perubahan HPP & ROP produk langsung mempengaruhi kalkulasi profit di seluruh sistem',
      'Backup data sebelum import massal atau perubahan besar',
    ],
  },

  // ══════════════════════════════════════════════════════════ FINANCE
  {
    key: 'FINANCE',
    label: 'Finance',
    color: 'text-blue-400',
    bg: 'bg-blue-900/30',
    border: 'border-blue-700',
    ring: 'ring-blue-500/30',
    tagline: 'Keuangan, procurement, dan inventori operasional',
    description:
      'Finance mengelola seluruh arus kas perusahaan — dari pencatatan transaksi harian, pengelolaan PO vendor, hingga laporan keuangan bulanan. Akses ke inventori dan pesanan untuk keperluan rekonsiliasi.',

    dailyWorkflow: [
      {
        time: '08.00',
        icon: LayoutDashboard,
        title: 'Pantau Dashboard',
        path: '/dashboard',
        desc: 'Lihat total omzet, saldo wallet, dan status payout. Filter "Hari Ini" untuk data terkini. Catat anomali yang perlu ditindaklanjuti.',
        tips: ['Bandingkan omzet hari ini vs kemarin untuk deteksi penurunan signifikan'],
      },
      {
        time: '08.30',
        icon: Wallet,
        title: 'Catat Transaksi Harian',
        path: '/finance',
        desc: 'Buka Finance → Wallet & Ledger. Catat semua pengeluaran operasional (bayar kurir, supplies, dll) dan pemasukan yang belum tercatat. Pastikan saldo wallet sesuai rekening fisik.',
        tips: ['Gunakan kategori yang tepat agar masuk L/R report dengan benar', 'TRANSFER antar wallet tidak mengurangi total saldo'],
      },
      {
        time: '09.00',
        icon: Megaphone,
        title: 'Catat Spending Iklan',
        path: '/finance?tab=iklan',
        desc: 'Finance → Budget Iklan → mode "Catat Spending". Pilih platform (TikTok/Shopee), masukkan tanggal dan nominal spending iklan hari ini. ROAS otomatis terupdate di Dashboard.',
        tips: ['Jika isi ulang saldo iklan, gunakan mode "Deposit/Top-up" pilih sumber dana', 'Lakukan ini setiap hari agar ROAS akurat'],
      },
      {
        time: '09.30',
        icon: FileText,
        title: 'Cek PO & Pembayaran Vendor',
        path: '/procurement',
        desc: 'Procurement → Monitor → lihat PO yang sudah jatuh tempo atau hampir due. Jika ada pembayaran yang harus dilakukan, catat di tab Pembayaran Vendor.',
        tips: ['PO status "Partial" = barang sudah diterima sebagian, pastikan bayar sesuai yang diterima'],
      },
      {
        time: '10.00',
        icon: AlertTriangle,
        title: 'Cek Alerts Stok',
        path: '/alerts',
        desc: 'Pantau stok kritis dan habis. Koordinasi dengan tim gudang untuk konfirmasi stok fisik sebelum buat PO baru.',
        tips: ['Klik "Buat PO" dari alert untuk langsung ke form PO baru', 'Cek dulu SOH di Inventori sebelum buat PO besar'],
      },
      {
        time: '16.00',
        icon: Receipt,
        title: 'Rekonsiliasi Payout',
        path: '/finance?tab=payout',
        desc: 'Finance → Payout → cek payout marketplace yang masuk hari ini. Pastikan jumlah sesuai dengan settlement dari TikTok/Shopee. Catat di Wallet & Ledger jika belum masuk.',
        tips: ['Payout Shopee biasanya D+2 setelah pesanan terkirim', 'Bandingkan dengan laporan settlement dari seller center'],
      },
    ],

    weeklyTasks: [
      'Rekonsiliasi total ledger vs saldo rekening bank fisik',
      'Review Laporan Laba Rugi (Finance → Laporan) — presentasikan ke Owner setiap Senin',
      'Cek utang vendor yang jatuh tempo minggu ini (Finance → Utang & Piutang)',
      'Review piutang yang belum terbayar lebih dari 7 hari',
      'Export data transaksi mingguan untuk arsip keuangan',
      'Verifikasi seluruh PO yang sudah received telah dicatat dengan benar',
    ],

    modules: [
      {
        icon: LayoutDashboard, color: 'text-emerald-400',
        title: 'Dashboard', path: '/dashboard',
        desc: 'Pantau KPI keuangan real-time.',
        keyActions: ['Filter periode (hari/minggu/bulan)', 'ROAS platform', 'Saldo wallet snapshot', 'Payout terkini'],
      },
      {
        icon: ShoppingCart, color: 'text-blue-400',
        title: 'Pesanan', path: '/orders',
        desc: 'Lihat & rekonsiliasi data pesanan.',
        keyActions: ['Filter per platform & status', 'Export CSV untuk rekonsiliasi', 'Lihat real omzet & HPP per order'],
      },
      {
        icon: ScanLine, color: 'text-cyan-400',
        title: 'Scan Resi', path: '/scan-order',
        desc: 'Verifikasi pengiriman.',
        keyActions: ['Scan manual/kamera', 'Bulk upload CSV resi', 'Riwayat scan harian'],
      },
      {
        icon: Package, color: 'text-yellow-400',
        title: 'Inventori', path: '/inventory',
        desc: 'Stok overview & ledger mutasi.',
        keyActions: ['SOH per SKU', 'Ledger mutasi (IN/OUT)', 'Stock opname', 'Master produk & HPP'],
      },
      {
        icon: GitMerge, color: 'text-yellow-400',
        title: 'Produk Gabungan', path: '/produk-gabungan',
        desc: 'Mapping SKU marketplace.',
        keyActions: ['Tambah/edit mapping bundle', 'Import dari Excel', 'Preview split SKU'],
      },
      {
        icon: FileText, color: 'text-orange-400',
        title: 'Procurement', path: '/procurement',
        desc: 'PO, vendor, dan pembayaran.',
        keyActions: ['Buat & track PO', 'Catat pembayaran vendor', 'Monitor overdue PO', 'Manajemen data vendor'],
      },
      {
        icon: Wallet, color: 'text-violet-400',
        title: 'Finance Room', path: '/finance',
        desc: 'Keuangan lengkap (kecuali Modal Awal).',
        keyActions: ['Wallet & Ledger harian', 'Budget Iklan per platform', 'Aset Tetap & depresiasi', 'Payout, Utang/Piutang, Laporan'],
      },
      {
        icon: Users, color: 'text-pink-400',
        title: 'CRM', path: '/crm',
        desc: 'Data pelanggan & riwayat pembelian.',
        keyActions: ['Cari pelanggan', 'Lihat riwayat order', 'Data kontak & alamat'],
      },
      {
        icon: AlertTriangle, color: 'text-red-400',
        title: 'Alerts', path: '/alerts',
        desc: 'Peringatan stok & order.',
        keyActions: ['Stok habis/kritis', 'Order delayed >48 jam', 'Shortcut buat PO'],
      },
      {
        icon: MessageSquarePlus, color: 'text-zinc-400',
        title: 'Suggest Revision', path: '/suggest-revision',
        desc: 'Laporan bug & saran sistem.',
        keyActions: ['Tambah masukan + screenshot', 'Tandai selesai'],
      },
    ],

    importantNotes: [
      'Finance tidak bisa hapus pesanan atau edit harga — hubungi Owner jika ada koreksi',
      'Catat spending iklan SETIAP HARI agar ROAS di dashboard akurat',
      'Kategori transaksi mempengaruhi Laporan L/R — pilih kategori dengan benar',
      'PO hanya bisa dihapus oleh Owner; Finance bisa request delete melalui Suggest Revision',
      'Modal Awal di Finance Room hanya bisa diakses Owner',
    ],
  },

  // ══════════════════════════════════════════════════════════ STAFF
  {
    key: 'STAFF',
    label: 'Staff',
    color: 'text-zinc-300',
    bg: 'bg-zinc-800/60',
    border: 'border-zinc-600',
    ring: 'ring-zinc-500/30',
    tagline: 'Operasional harian: pesanan, gudang, dan pengiriman',
    description:
      'Staff mengelola operasional harian di gudang dan pengiriman. Fokus pada verifikasi resi, mutasi stok masuk/keluar, dan memantau pesanan yang perlu dikirim. Tidak memiliki akses ke data keuangan.',

    dailyWorkflow: [
      {
        time: '08.00',
        icon: LayoutDashboard,
        title: 'Cek Dashboard Backlog',
        path: '/dashboard',
        desc: 'Lihat Aging Backlog — berapa order yang perlu dikirim dan sudah berapa lama pending. Prioritaskan yang masuk bucket >24 jam atau >48 jam.',
        tips: ['Fokus ke bagian "Backlog Pengiriman" di Dashboard', 'Order >48 jam harus segera diproses atau dilaporkan ke atasan'],
      },
      {
        time: '08.15',
        icon: ShoppingCart,
        title: 'Cek Pesanan Perlu Dikirim',
        path: '/orders',
        desc: 'Filter pesanan dengan status "Perlu Dikirim". Cetak atau catat daftar order yang harus dikirim hari ini. Koordinasi dengan kurir/ekspedisi.',
        tips: ['Gunakan filter Platform untuk pisahkan order Shopee dan TikTok', 'Cari berdasarkan No. Order atau nama pembeli jika ada pertanyaan'],
      },
      {
        time: '09.00',
        icon: Boxes,
        title: 'Catat Barang Masuk (Gudang)',
        path: '/inventory-scan',
        desc: 'Ketika barang dari supplier tiba: buka Inventori → Scan Masuk/Keluar → tab "Scan Masuk". Scan atau ketik SKU satu per satu, atur qty, lalu COMMIT batch. Stok otomatis bertambah.',
        tips: ['Scan SKU dari barcode di dus/kemasan produk', 'Cek PO terlebih dahulu untuk verifikasi qty yang seharusnya datang', 'Jangan commit sebelum semua item selesai di-scan'],
      },
      {
        time: '10.00',
        icon: Truck,
        title: 'Scan Resi Pengiriman',
        path: '/scan-order',
        desc: 'Setelah paket diserahkan ke kurir, scan setiap resi di halaman Scan Resi. Ini memperbarui status order menjadi terkirim dan tercatat di sistem.',
        tips: ['Gunakan mode kamera untuk scan lebih cepat', 'Sistem berbunyi 1x (sukses), 2x (duplikat), 3x (tidak ditemukan)', 'Upload CSV jika resi banyak — format: No. Resi, Tanggal'],
      },
      {
        time: '11.00',
        icon: PackageSearch,
        title: 'Cek Stok Overview',
        path: '/inventory',
        desc: 'Buka Inventori → lihat produk dengan SOH rendah atau merah. Laporkan ke Finance/Owner jika ada stok yang perlu segera di-restock.',
        tips: ['SOH merah = sudah di bawah ROP → perlu PO segera', 'SOH 0 atau minus = stok habis, jangan terima order produk ini'],
      },
      {
        time: '14.00',
        icon: ScanLine,
        title: 'Catat Endorsement / Sample',
        path: '/inventory-scan',
        desc: 'Jika ada barang keluar untuk KOL/endorsement: Inventori → Scan Masuk/Keluar → tab "Endorsement". Catat produk dan qty yang keluar. Ini dicatat sebagai Beban Sample.',
        tips: ['Endorsement otomatis tercatat sebagai MARKETING keluar dari stok', 'Wajib catat agar stok fisik dan sistem selalu sinkron'],
      },
    ],

    weeklyTasks: [
      'Laporkan kondisi stok fisik yang mencurigakan (selisih) ke Finance untuk jadwal Stock Opname',
      'Pastikan semua resi minggu ini sudah di-scan (tidak ada yang terlewat)',
      'Cek riwayat scan (Global Ledger) untuk verifikasi mutasi stok minggu ini sudah benar',
      'Berikan masukan atau laporkan bug melalui Suggest Revision',
    ],

    modules: [
      {
        icon: LayoutDashboard, color: 'text-emerald-400',
        title: 'Dashboard', path: '/dashboard',
        desc: 'Pantau backlog dan status operasional.',
        keyActions: ['Aging backlog pengiriman', 'Total order per hari', 'Stok kritis count'],
      },
      {
        icon: ShoppingCart, color: 'text-blue-400',
        title: 'Pesanan', path: '/orders',
        desc: 'Lihat daftar pesanan (view only).',
        keyActions: ['Filter status & platform', 'Cari per resi/order', 'Lihat detail item & penerima'],
      },
      {
        icon: ScanLine, color: 'text-cyan-400',
        title: 'Scan Resi', path: '/scan-order',
        desc: 'Verifikasi pengiriman setelah paket dikirim.',
        keyActions: ['Scan barcode resi (kamera/manual)', 'Deteksi duplikat otomatis + suara', 'Bulk upload CSV resi', 'Histori scan hari ini'],
      },
      {
        icon: Package, color: 'text-yellow-400',
        title: 'Inventori — Stok Overview', path: '/inventory',
        desc: 'Lihat kondisi stok semua produk.',
        keyActions: ['SOH real-time per SKU', 'Indikator Aman/Kritis/Habis', 'Filter per kategori', 'Riwayat ledger per SKU'],
      },
      {
        icon: FileText, color: 'text-yellow-400',
        title: 'Inventori — Global Ledger', path: '/inventory-ledger',
        desc: 'Riwayat semua mutasi stok.',
        keyActions: ['Filter tanggal & SKU', 'Lihat IN/OUT per produk', 'Verifikasi catatan mutasi'],
      },
      {
        icon: ScanLine, color: 'text-yellow-400',
        title: 'Inventori — Scan Masuk/Keluar', path: '/inventory-scan',
        desc: 'Catat mutasi stok via scan barcode.',
        keyActions: ['Tab Scan Masuk (barang dari supplier)', 'Tab Scan Keluar (barang keluar)', 'Tab Endorsement (sample KOL)', 'Tab Retur (barang kembali)', 'Upload CSV batch'],
      },
      {
        icon: MessageSquarePlus, color: 'text-zinc-400',
        title: 'Suggest Revision', path: '/suggest-revision',
        desc: 'Laporan bug dan masukan sistem.',
        keyActions: ['Tambah masukan + paste screenshot (CTRL+V)', 'Lihat status masukan sebelumnya'],
      },
    ],

    importantNotes: [
      'Staff TIDAK memiliki akses ke data keuangan (Finance Room, Procurement, CRM)',
      'Selalu COMMIT batch scan — jangan tinggalkan batch yang belum di-submit',
      'Jika menemukan selisih stok fisik vs sistem, laporkan ke Finance untuk stock opname',
      'Scan Resi dilakukan SETELAH paket benar-benar diserahkan ke kurir, bukan sebelumnya',
      'Gunakan Suggest Revision untuk lapor bug atau minta fitur baru',
    ],
  },

  // ══════════════════════════════════════════════════════════ EXTERNAL
  {
    key: 'EXTERNAL',
    label: 'External',
    color: 'text-purple-400',
    bg: 'bg-purple-900/30',
    border: 'border-purple-700',
    ring: 'ring-purple-500/30',
    tagline: 'Akses read-only stok produk tersedia',
    description:
      'User External adalah mitra atau pihak luar yang perlu melihat ketersediaan stok produk tanpa akses ke data internal bisnis. Setelah login, otomatis diarahkan ke halaman External Inventory.',

    dailyWorkflow: [
      {
        time: '',
        icon: Store,
        title: 'Login → External Inventory',
        path: '/external-inventory',
        desc: 'Setelah login, sistem otomatis mengarahkan ke halaman External Inventory. Halaman ini menampilkan daftar produk yang masih memiliki stok tersedia.',
        tips: ['Hanya produk aktif dengan stok > 0 yang ditampilkan', 'Tidak ada data harga atau informasi internal lain'],
      },
      {
        time: '',
        icon: PackageSearch,
        title: 'Cari Produk',
        path: '/external-inventory',
        desc: 'Gunakan kolom pencarian untuk cari produk berdasarkan SKU atau nama produk. Sistem menampilkan nama produk dan jumlah stok saat ini.',
        tips: ['Cari dengan SKU untuk hasil paling akurat', 'Stok yang ditampilkan adalah data real-time dari sistem'],
      },
      {
        time: '',
        icon: MessageSquarePlus,
        title: 'Suggest Revision (jika diperlukan)',
        path: '/suggest-revision',
        desc: 'Jika ada masukan atau menemukan masalah pada halaman yang bisa diakses, bisa disampaikan melalui halaman Suggest Revision.',
        tips: ['Bisa paste screenshot langsung dengan CTRL+V'],
      },
    ],

    weeklyTasks: [
      'Tidak ada tugas mingguan khusus untuk role External',
      'Hubungi tim internal jika ada produk yang tidak terlihat di daftar stok',
    ],

    modules: [
      {
        icon: Store, color: 'text-purple-400',
        title: 'External Inventory', path: '/external-inventory',
        desc: 'Halaman stok produk read-only untuk mitra eksternal.',
        keyActions: ['Lihat daftar produk tersedia', 'Cari per SKU atau nama produk', 'Data stok real-time', 'Read-only (tidak bisa edit apapun)'],
      },
      {
        icon: MessageSquarePlus, color: 'text-zinc-400',
        title: 'Suggest Revision', path: '/suggest-revision',
        desc: 'Papan masukan dan saran.',
        keyActions: ['Tambah masukan + screenshot', 'Lihat status laporan sebelumnya'],
      },
    ],

    importantNotes: [
      'Akses External hanya bisa lihat stok — tidak bisa edit, hapus, atau tambah data apapun',
      'Harga, HPP, data keuangan, dan pesanan tidak ditampilkan ke role External',
      'Jika butuh akses lebih luas, hubungi Owner untuk perubahan role',
      'Session login berlaku selama browser aktif — logout setelah selesai di komputer bersama',
    ],
  },
]

// ─── Role colors for badges ───────────────────────────────────────────────────

const ROLE_BADGE: Record<RoleKey, string> = {
  OWNER: 'bg-emerald-900/50 text-emerald-400 border-emerald-700',
  FINANCE: 'bg-blue-900/50 text-blue-400 border-blue-700',
  STAFF: 'bg-zinc-800 text-zinc-300 border-zinc-600',
  EXTERNAL: 'bg-purple-900/50 text-purple-400 border-purple-700',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ModuleCard({ mod }: { mod: Module }) {
  const [open, setOpen] = useState(false)
  const Icon = mod.icon
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0">
          <Icon size={16} className={mod.color} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-200">{mod.title}</p>
          <p className="text-xs text-zinc-500 truncate">{mod.desc}</p>
        </div>
        <a
          href={mod.path}
          onClick={e => e.stopPropagation()}
          className="text-[10px] text-zinc-600 hover:text-emerald-400 transition-colors font-mono mr-2 shrink-0"
        >
          {mod.path}
        </a>
        {open ? <ChevronDown size={14} className="text-zinc-500 shrink-0" /> : <ChevronRight size={14} className="text-zinc-600 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-zinc-800/60">
          <ul className="mt-3 space-y-1.5">
            {mod.keyActions.map((a, i) => (
              <li key={i} className="flex items-start gap-2">
                <CheckCircle2 size={12} className="text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-xs text-zinc-400">{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function OwnerSecretCard({ feature }: { feature: OwnerSecretFeature }) {
  const [open, setOpen] = useState(false)
  const Icon = feature.icon
  return (
    <div className="bg-gradient-to-br from-emerald-950/40 to-zinc-900 border border-emerald-700/40 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-emerald-950/30 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-lg bg-emerald-900/40 border border-emerald-700/40 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-emerald-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-emerald-300">{feature.title}</p>
          <p className="text-xs text-emerald-200/60 truncate">{feature.desc}</p>
        </div>
        {open ? <ChevronDown size={14} className="text-emerald-600 shrink-0" /> : <ChevronRight size={14} className="text-emerald-700 shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-emerald-700/30 space-y-4">
          {/* Details */}
          <div className="mt-4">
            <p className="text-xs font-semibold text-emerald-300 mb-2">📋 Fitur Detail:</p>
            <ul className="space-y-1">
              {feature.details.map((d, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircle2 size={11} className="text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-xs text-emerald-200/70">{d}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Use Cases */}
          <div>
            <p className="text-xs font-semibold text-emerald-300 mb-2">🎯 Use Cases:</p>
            <ul className="space-y-1">
              {feature.useCases.map((uc, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Zap size={11} className="text-yellow-500 shrink-0 mt-0.5" />
                  <span className="text-xs text-emerald-200/70">{uc}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tips */}
          <div>
            <p className="text-xs font-semibold text-emerald-300 mb-2">💡 Pro Tips:</p>
            <ul className="space-y-1">
              {feature.tips.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Lightbulb size={11} className="text-amber-500 shrink-0 mt-0.5" />
                  <span className="text-xs text-emerald-200/70">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

function WorkflowCard({ step, index }: { step: WorkflowStep; index: number }) {
  const [open, setOpen] = useState(false)
  const Icon = step.icon
  return (
    <div className="relative flex gap-4">
      {/* Connector line */}
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 z-10">
          <span className="text-xs font-bold text-zinc-400">{index + 1}</span>
        </div>
        <div className="w-px flex-1 bg-zinc-800 mt-1" />
      </div>
      {/* Content */}
      <div className="flex-1 pb-4">
        <div
          className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden cursor-pointer"
          onClick={() => setOpen(o => !o)}
        >
          <div className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors">
            <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
              <Icon size={14} className="text-zinc-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {step.time && (
                  <span className="text-[10px] font-mono text-zinc-600 bg-zinc-800 px-1.5 py-0.5 rounded">
                    {step.time}
                  </span>
                )}
                <p className="text-sm font-semibold text-zinc-200">{step.title}</p>
              </div>
            </div>
            {step.path && (
              <a
                href={step.path}
                onClick={e => e.stopPropagation()}
                className="text-[10px] text-zinc-600 hover:text-emerald-400 font-mono transition-colors shrink-0"
              >
                {step.path}
              </a>
            )}
            {open ? <ChevronDown size={13} className="text-zinc-500 shrink-0" /> : <ChevronRight size={13} className="text-zinc-600 shrink-0" />}
          </div>
          {open && (
            <div className="px-4 pb-4 border-t border-zinc-800/60">
              <p className="text-sm text-zinc-400 leading-relaxed mt-3">{step.desc}</p>
              {step.tips && step.tips.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {step.tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Zap size={11} className="text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-amber-400/80">{tip}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const FAQ_ITEMS: { q: string; a: string[] }[] = [
  {
    q: 'Apa beda Omzet Ops vs Laba Rugi (PENJUALAN)?',
    a: [
      'Omzet Ops (Telegram harian/mingguan, dashboard): order masuk berdasarkan trx_date / tanggal order — estimasi real_omzet.',
      'Laba Rugi PENJUALAN: order yang DICAIRKAN di periode itu (payouts.released_date), pakai totalIncome aktual marketplace.',
      'Contoh: order Juni yang cair Juli masuk Laba Rugi Juli, bukan Juni.',
    ],
  },
  {
    q: 'Kapan HPP dihitung di Laba Rugi?',
    a: [
      'HPP dihitung dari orderNos yang punya payout cair di periode Laba Rugi.',
      'Baris order berstatus RETUR / return / dikembalikan dikeluarkan dari HPP (stok kembali gudang).',
      'Retur sebelum diterima konsumen biasanya tidak masuk settlement → tidak masuk pencairan & tidak pakai HPP di L/R.',
      'Retur setelah diterima: fee/ongkir retur sudah net di settlement (bisa minus); HPP tidak dihitung karena status retur.',
    ],
  },
  {
    q: 'Settlement negatif vs settlement 0?',
    a: [
      'Settlement < 0: masuk payout negatif, mengurangi total pencairan & saldo wallet. Bisa retur fee, adjustment, claim.',
      'HPP hanya dibalik/dikeluarkan jika status order = retur (stok kembali), bukan otomatis setiap settlement negatif.',
      'Settlement = 0: net nol (fee/promo offset). Dilewati dari total cair; BUKAN otomatis berarti retur fisik.',
    ],
  },
  {
    q: 'Fee platform & retur double-count?',
    a: [
      'Tidak. Fee komisi/AMS sudah ter-net di totalIncome (pencairan bersih). Di L/R baris fee hanya info.',
      'Biaya retur platform ikut mengurangi settlement — jangan catat lagi sebagai OPEX terpisah.',
    ],
  },
  {
    q: 'Bayar Vendor masuk OPEX?',
    a: [
      'Tidak. HPP sudah membebankan harga pokok per transaksi. Bayar vendor = pelunasan hutang dagang (arus kas).',
      'Di Laba Rugi & Telegram bulanan, Bayar Vendor ditampilkan sebagai info saja, tidak mengurangi laba.',
    ],
  },
  {
    q: 'Cara catat biaya iklan (workflow)',
    a: [
      '1) Setup sekali: Finance → Wallet & Ledger → Kelola Wallet → centang "Wallet Iklan (Ads)" + pilih linked platform (Shopee/TikTok).',
      '2) Top-up budget: Finance → Budget Iklan → mode Deposit/Top-up. TRANSFER dari kas operasional ke wallet iklan. Ini BUKAN beban OPEX — hanya pindah saldo.',
      '3) Catat spending: Budget Iklan → mode Catat Spending → pilih wallet iklan, tanggal, nominal. Sistem buat EXPENSE kategori "Iklan {platform}" dari wallet ads. Inilah yang dihitung sebagai biaya iklan.',
      '4) Catat SETIAP HARI (atau saat spend terjadi) agar ROAS dashboard & % iklan akurat.',
      'Jangan catat spending iklan dari wallet non-ads tanpa flag isAdsBudget — dashboard & L/R tidak menghitungnya sebagai iklan.',
    ],
  },
  {
    q: 'Iklan di Laba Rugi, Telegram, ROAS — bedanya?',
    a: [
      'Sumber tunggal: EXPENSE dari wallet is_ads_budget = true (bukan top-up TRANSFER).',
      'Laba Rugi & Telegram bulanan: total spending iklan masuk OPEX; ditampilkan baris Iklan + % thd pencairan bersih.',
      'Telegram harian: total iklan + % thd omzet ops hari itu + ROAS per platform (omzet ops ÷ ad spend).',
      'Dashboard ROAS: ad spend per linked_platform wallet ads ÷ omzet ops platform (periode filter).',
      'Fee AMS Shopee di file payout: sudah ter-net di pencairan (totalIncome). JANGAN catat ulang sebagai spending iklan — double count.',
    ],
  },
  {
    q: 'Iklan: apa yang BUKAN biaya iklan?',
    a: [
      'Top-up / deposit ke wallet iklan (TRANSFER) — bukan OPEX.',
      'Fee AMS / komisi marketplace di settlement — sudah mengurangi pencairan, info di L/R saja.',
      'Sample produk / ongkir sample: kalau dicatat di wallet non-ads sebagai EXPENSE biasa, masuk OPEX umum, bukan metrik "Iklan/ROAS" (kecuali kamu sengaja pakai wallet ads).',
    ],
  },
  {
    q: 'Tanggal order: masuk, kirim, cair, retur',
    a: [
      'trx_date order = tanggal order masuk (ops). TIDAK diganti saat import payout.',
      'Tanggal cair = payouts.released_date — hanya untuk Laba Rugi & ringkasan payout.',
      'Status retur di order menentukan HPP keluar dari L/R; rekap retur stok di modul retur/status order.',
    ],
  },
  {
    q: 'Jadwal Telegram bulanan',
    a: [
      'Otomatis setiap tanggal 2 jam 09:00 WIB — Laba Rugi kas bulan sebelumnya + cuplikan ops.',
      'Test manual: Owner Room → Telegram section (tombol test / menu bot Laporan Bulanan).',
      'Harian & mingguan tetap basis order masuk (ops), bukan pencairan.',
    ],
  },
  {
    q: 'Poin 1 — Restore / audit trx_date historis (apa & kenapa)',
    a: [
      'Masalah: dulu import payout menimpa orders.trx_date = tanggal cair. Akibatnya omzet ops/Telegram harian bisa “pindah bulan” ke bulan pencairan.',
      'Sekarang: import payout TIDAK lagi mengubah trx_date. Tanggal cair hanya di payouts.released_date (Laba Rugi).',
      'Restore: Finance → Tools Finance → Restore trx_date. Dry-run dulu, lalu eksekusi (OWNER). Sumber: parse order_created_at → tulis ulang trx_date.',
      'Kapan pakai: setelah migrasi bug lama, atau omzet ops bulan X terlihat aneh dibanding CSV order.',
      'API: GET/POST /api/orders/restore-trx-date (dryRun default true).',
    ],
  },
  {
    q: 'Poin 2 — Rekonsiliasi order ↔ payout (apa & kenapa)',
    a: [
      'Tujuan: lihat gap antara “order masuk” vs “sudah cair” vs data rusak (payout tanpa order, settlement minus, retur masih payout +).',
      'Lokasi: Finance → Tools Finance → Rekonsiliasi. Pilih rentang tanggal (WIB).',
      'ordersBelumCair: normal jika belum settle marketplace. orphanPayouts: upload CSV order dulu agar HPP L/R akurat.',
      'negativePayouts: fee retur/adjustment — kurangi pencairan. returWithPositivePayout: cek partial/timing status.',
      'Catatan schema: 1 orderNo = 1 payout (unique) — multi-batch settlement belum didukung.',
      'API: GET /api/reports/reconcile?dateFrom=&dateTo=',
    ],
  },
  {
    q: 'Poin 3 — Retur stok terstruktur (alur yang benar)',
    a: [
      'Retur sebelum diterima konsumen: biasanya tidak bayar / tidak masuk settlement → tidak di Laba Rugi sebagai penjualan cair.',
      'Retur setelah diterima: scan stok masuk lewat Inventori → Scan → Scan Retur (RETURN_SALES). Status order jadi RETUR; SOH naik untuk qty Baik.',
      'Laba Rugi: HPP baris status retur dikeluarkan (stok kembali). Fee/ongkir retur sudah net di settlement (bisa minus) — jangan catat ulang OPEX.',
      'Partial retur (langka): isi qty per SKU di scan retur; return ratio di PL proporsional realOmzet.',
      'Retur pembelian ke vendor: mode Retur Pembelian (OUT / RETURN_PURCHASE) — beda alur dari retur customer.',
      'Jangan andalkan settlement 0 sebagai “retur fisik” — net nol bisa fee/promo offset, bukan barang kembali.',
    ],
  },
  {
    q: 'Tools Finance baru: Cash vs Ops, Closing, SKU Profit, Saran PO',
    a: [
      'Cash vs Ops: bandingan omzet ops (trx_date) vs Laba Rugi kas (released_date) + iklan % di kedua basis.',
      'Closing bulanan: checklist tgl 1–2 (order, payout, HPP, orphan, iklan, preview L/R).',
      'SKU Profit Kas: margin per SKU setelah alokasi totalIncome payout (bukan estimasi real_omzet saja).',
      'Saran PO: velocity 30 hari + ROP + lead time → suggestOrderQty (bukan auto-buat PO).',
      'Export L/R CSV: tombol di Laporan atau Tools — formula sama computeProfitLoss.',
    ],
  },
]

function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0)
  return (
    <div className="space-y-2 max-w-3xl">
      <p className="text-sm text-zinc-400 mb-4">
        Definisi perhitungan profit, retur, HPP, iklan, dan tanggal — agar angka Laba Rugi & Telegram tidak salah dibaca.
      </p>
      {FAQ_ITEMS.map((item, i) => {
        const open = openIdx === i
        return (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenIdx(open ? null : i)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-zinc-800/50"
            >
              <span className="text-sm font-semibold text-zinc-200">{item.q}</span>
              {open ? <ChevronDown size={14} className="text-zinc-500 shrink-0" /> : <ChevronRight size={14} className="text-zinc-600 shrink-0" />}
            </button>
            {open && (
              <ul className="px-4 pb-4 space-y-2 border-t border-zinc-800/60 pt-3">
                {item.a.map((line, j) => (
                  <li key={j} className="text-sm text-zinc-400 flex items-start gap-2">
                    <Info size={12} className="text-emerald-500 shrink-0 mt-1" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

type DocTab = RoleKey | 'FAQ' | 'DETAIL'

const APP_CATALOG: {
  domain: string
  items: { name: string; path: string; roles: string; desc: string; tips?: string }[]
}[] = [
  {
    domain: 'Sales & Ops',
    items: [
      { name: 'Dashboard', path: '/dashboard', roles: 'OWNER · FINANCE · STAFF', desc: 'KPI scoreboard, cashflow, action center, inventory health. STAFF lihat fokus ops.' },
      { name: 'Pesanan', path: '/orders', roles: 'OWNER · FINANCE · STAFF', desc: 'Import CSV Shopee/TikTok, filter status (termasuk Retur), export, isi HPP kosong.' },
      { name: 'Scan Resi', path: '/scan-order', roles: 'OWNER · FINANCE · STAFF', desc: 'Scan AWB pack/kirim, bulk CSV, deteksi duplikat.' },
      { name: 'CRM', path: '/crm', roles: 'OWNER · FINANCE', desc: 'Daftar buyer unik dari order (omzet & frekuensi).' },
      { name: 'Produk Gabungan', path: '/produk-gabungan', roles: 'OWNER · FINANCE', desc: 'Mapping SKU combo marketplace → SKU internal (HPP import).' },
      { name: 'Alerts', path: '/alerts', roles: 'OWNER · FINANCE', desc: 'Stok habis/kritis, order pending, alert iklan % / ROAS 3 hari.' },
    ],
  },
  {
    domain: 'Inventori',
    items: [
      { name: 'Stok Overview', path: '/inventory?tab=overview', roles: 'OWNER · FINANCE · STAFF', desc: 'SOH, ROP, pencarian produk.' },
      { name: 'Inventory Ledger', path: '/inventory?tab=ledger', roles: 'OWNER · FINANCE · STAFF', desc: 'Riwayat IN/OUT per alasan.' },
      { name: 'Scan Masuk/Keluar/Retur', path: '/inventory?tab=scan', roles: 'OWNER · FINANCE · STAFF', desc: 'Masuk PO, keluar sales, endorsement, Scan Retur customer (RETURN_SALES), retur beli vendor.' },
      { name: 'Stock Opname', path: '/inventory?tab=opname', roles: 'OWNER · FINANCE', desc: 'Hitung fisik vs sistem, commit penyesuaian.' },
      { name: 'Master Produk', path: '/inventory?tab=master', roles: 'OWNER · FINANCE', desc: 'SKU, HPP, ROP, lead time, import/export.' },
      { name: 'External Inventory', path: '/external-inventory', roles: 'EXTERNAL', desc: 'Read-only stok SOH > 0 untuk mitra.' },
    ],
  },
  {
    domain: 'Procurement',
    items: [
      { name: 'Purchase Orders', path: '/procurement?tab=po', roles: 'OWNER · FINANCE', desc: 'Buat PO, terima barang, status OPEN→CLOSED.' },
      { name: 'Vendors', path: '/procurement?tab=vendor', roles: 'OWNER · FINANCE', desc: 'Master supplier & rekening.' },
      { name: 'Vendor Payments', path: '/procurement?tab=payment', roles: 'OWNER · FINANCE', desc: 'Bayar DP/partial/lunas dari wallet (bukan OPEX L/R).' },
      { name: 'Monitor PO', path: '/procurement?tab=monitor', roles: 'OWNER · FINANCE', desc: 'Pantau fulfillment & pembayaran.' },
    ],
  },
  {
    domain: 'Finance Room',
    items: [
      { name: 'Wallet & Ledger', path: '/finance?tab=wallet', roles: 'OWNER · FINANCE', desc: 'Multi-wallet, EXPENSE/TRANSFER/PAYOUT, edit request FINANCE → approve OWNER.' },
      { name: 'Budget Iklan', path: '/finance?tab=iklan', roles: 'OWNER · FINANCE', desc: 'Top-up TRANSFER + Catat Spending EXPENSE di wallet isAdsBudget. ROAS dashboard.' },
      { name: 'Aset Tetap', path: '/finance?tab=aset', roles: 'OWNER · FINANCE', desc: 'Penyusutan masuk Laba Rugi otomatis.' },
      { name: 'Modal Awal', path: '/finance?tab=modal', roles: 'OWNER', desc: 'Modal pembuka per wallet.' },
      { name: 'Payout', path: '/finance?tab=payout', roles: 'OWNER · FINANCE', desc: 'Import settlement Shopee/TikTok → totalIncome & released_date. Reset all = OWNER.' },
      { name: 'Utang & Piutang', path: '/finance?tab=utang', roles: 'OWNER · FINANCE', desc: 'Utang modal/bank + piutang karyawan/vendor.' },
      { name: 'Laporan', path: '/finance?tab=laporan', roles: 'OWNER · FINANCE', desc: 'Ringkasan, Laba Rugi kas, Arus Kas, Neraca, export CSV L/R.' },
      { name: 'Tools Finance', path: '/finance?tab=tools', roles: 'OWNER · FINANCE', desc: 'Cash vs Ops, Rekonsiliasi order-payout, SKU profit kas, Closing checklist, Saran PO, Restore trx_date (OWNER).' },
    ],
  },
  {
    domain: 'Laporan Telegram & AI',
    items: [
      { name: 'Tele Harian', path: 'Owner Room → Pengaturan', roles: 'OWNER setup', desc: 'Omzet ops order masuk + GP estimasi + % iklan + ROAS. Jadwal dari DB.' },
      { name: 'Tele Mingguan', path: 'Owner Room → Pengaturan', roles: 'OWNER setup', desc: 'Recap ops minggu lalu + iklan % + eksekusi.' },
      { name: 'Tele Bulanan', path: 'tgl 2 09:00 WIB', roles: 'auto', desc: 'Laba Rugi basis pencairan + cuplikan ops. Test via bot / Owner Room.' },
      { name: 'AI Insights', path: '/ai-insights', roles: 'OWNER', desc: 'Analisis strategis (Gemini), cache DB.' },
      { name: 'AI Assistant', path: '/ai-assistant', roles: 'OWNER · FINANCE · STAFF', desc: 'Chat how-to fitur app.' },
    ],
  },
  {
    domain: 'Owner Room & Admin',
    items: [
      { name: 'Users', path: '/owner-room', roles: 'OWNER', desc: 'CRUD user & role OWNER/FINANCE/STAFF/EXTERNAL.' },
      { name: 'Edit Requests', path: '/owner-room', roles: 'OWNER', desc: 'Approve/reject edit ledger dari FINANCE.' },
      { name: 'Audit Log', path: '/owner-room', roles: 'OWNER', desc: 'Jejak CREATE/UPDATE/DELETE.' },
      { name: 'Kategori', path: '/owner-room', roles: 'OWNER', desc: 'Kategori expense & master.' },
      { name: 'Kesehatan', path: '/owner-room', roles: 'OWNER', desc: 'DB health, scheduler, last report, data freshness.' },
      { name: 'Backup', path: '/owner-room', roles: 'OWNER', desc: 'Export/import JSON entitas.' },
      { name: 'Pengaturan', path: '/owner-room', roles: 'OWNER', desc: 'Fee admin %, Telegram recipients, jadwal report.' },
      { name: 'Suggest Revision', path: '/suggest-revision', roles: 'Semua login', desc: 'Feedback fitur + gambar.' },
      { name: 'Dokumentasi', path: '/documentation', roles: 'Semua login', desc: 'Workflow per role + FAQ + Detail App (katalog ini).' },
    ],
  },
]

function DetailAppSection() {
  return (
    <div className="space-y-8 max-w-4xl">
      <p className="text-sm text-zinc-400">
        Katalog fitur ELYASR Ops — pakai ini agar tim tahu modul mana untuk tugas apa.
        Perhitungan profit & retur: tab <b className="text-zinc-300">FAQ</b>.
      </p>
      <div className="grid sm:grid-cols-2 gap-2 text-xs">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-emerald-400 font-semibold mb-1">Dua basis angka</p>
          <p className="text-zinc-500">OPS = order masuk (trx_date). KAS / Laba Rugi = dicairkan (released_date).</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3">
          <p className="text-amber-400 font-semibold mb-1">Iklan</p>
          <p className="text-zinc-500">Hanya EXPENSE wallet Ads. Top-up TRANSFER & fee AMS payout bukan metrik iklan.</p>
        </div>
      </div>
      {APP_CATALOG.map(sec => (
        <div key={sec.domain}>
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Boxes size={14} className="text-emerald-500" />
            {sec.domain}
          </h3>
          <div className="space-y-2">
            {sec.items.map(it => (
              <div key={it.path + it.name} className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <a href={it.path.startsWith('/') ? it.path : undefined} className="text-sm font-semibold text-zinc-100 hover:text-emerald-400">
                    {it.name}
                  </a>
                  <span className="text-[10px] text-zinc-600 font-mono">{it.path}</span>
                </div>
                <p className="text-[10px] text-emerald-700/80 mt-0.5">{it.roles}</p>
                <p className="text-sm text-zinc-400 mt-1">{it.desc}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function DocumentationPage() {
  const [activeRole, setActiveRole] = useState<DocTab>('OWNER')
  const [showOwnerSecrets, setShowOwnerSecrets] = useState(false)
  const [userRole, setUserRole] = useState<RoleKey | null>(null)
  const { user } = useAuth()
  const role = activeRole === 'FAQ' || activeRole === 'DETAIL' ? null : ROLES.find(r => r.key === activeRole)!

  useEffect(() => {
    setUserRole(user?.userRole ?? null)
  }, [user])

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <BookOpen size={22} className="text-emerald-400" />
            Panduan Penggunaan
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Workflow per role · Detail App · FAQ perhitungan — ELYASR Ops
          </p>
        </div>
      </div>

      {/* Role Tab Selector */}
      <div className="flex gap-1.5 mb-6 bg-zinc-900/60 border border-zinc-800 rounded-xl p-1.5 w-fit flex-wrap">
        {ROLES.map(r => (
          <button
            key={r.key}
            onClick={() => setActiveRole(r.key)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeRole === r.key
                ? `${r.bg} ${r.color} border ${r.border} shadow-sm`
                : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
            }`}
          >
            {r.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setActiveRole('DETAIL')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeRole === 'DETAIL'
              ? 'bg-blue-900/30 text-blue-400 border border-blue-800/50 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
          }`}
        >
          Detail App
        </button>
        <button
          type="button"
          onClick={() => setActiveRole('FAQ')}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            activeRole === 'FAQ'
              ? 'bg-amber-900/30 text-amber-400 border border-amber-800/50 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60'
          }`}
        >
          FAQ
        </button>
      </div>

      {activeRole === 'FAQ' ? (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb size={14} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">FAQ Perhitungan &amp; Profit</h2>
          </div>
          <FaqSection />
        </div>
      ) : activeRole === 'DETAIL' ? (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Boxes size={14} className="text-blue-400" />
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Detail App — Apa saja yang bisa dilakukan</h2>
          </div>
          <DetailAppSection />
        </div>
      ) : role && (
      <>
      {/* Role Hero */}
      <div className={`${role.bg} border ${role.border} rounded-2xl p-6 mb-6`}>
        <div className="flex items-start gap-4">
          <div className={`px-3 py-1.5 rounded-lg border ${ROLE_BADGE[activeRole as RoleKey]} text-sm font-bold shrink-0`}>
            {role.label.toUpperCase()}
          </div>
          <div>
            <p className={`font-bold text-base ${role.color}`}>{role.tagline}</p>
            <p className="text-sm text-zinc-400 mt-1 leading-relaxed max-w-2xl">{role.description}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-xs text-zinc-500">Modul tersedia:</span>
          {role.modules.map(m => (
            <a
              key={m.path}
              href={m.path}
              className="text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 border border-zinc-700 px-2 py-0.5 rounded-md transition-colors"
            >
              {m.title}
            </a>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Left: Daily Workflow */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={14} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Workflow Harian</h2>
          </div>
          <div>
            {role.dailyWorkflow.map((step, i) => (
              <WorkflowCard key={i} step={step} index={i} />
            ))}
          </div>

          {/* Weekly Tasks */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-4">
              <Star size={14} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Tugas Mingguan</h2>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2.5">
              {role.weeklyTasks.map((t, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <ArrowRight size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-sm text-zinc-400 leading-relaxed">{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Important Notes */}
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-4">
              <Info size={14} className="text-zinc-500" />
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Catatan Penting</h2>
            </div>
            <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 space-y-2.5">
              {role.importantNotes.map((n, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <CircleDot size={12} className="text-amber-500 shrink-0 mt-1" />
                  <span className="text-sm text-amber-200/70 leading-relaxed">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Modules */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BadgeCheck size={14} className="text-zinc-500" />
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Modul & Fitur ({role.modules.length})
            </h2>
          </div>
          <div className="space-y-2">
            {role.modules.map(m => (
              <ModuleCard key={m.path} mod={m} />
            ))}
          </div>
        </div>
      </div>

      {/* 🔐 OWNER SECRET SECTION */}
      {userRole === 'OWNER' && (
        <div className="mt-10 pt-6 border-t border-emerald-700/30">
          {/* Header */}
          <div className="mb-6 pb-4 border-b border-emerald-700/30 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lock size={16} className="text-emerald-400" />
                <h2 className="text-lg font-bold text-emerald-300">🔐 OWNER Secret Features</h2>
              </div>
              <p className="text-sm text-emerald-200/60 max-w-2xl">
                Advanced administration tools dan fitur eksklusif Owner saja. Informasi ini tidak terlihat oleh role lain.
              </p>
            </div>
            <button
              onClick={() => setShowOwnerSecrets(!showOwnerSecrets)}
              className="px-4 py-2 rounded-lg bg-emerald-900/50 border border-emerald-700 text-emerald-400 hover:bg-emerald-900/70 text-sm font-medium transition-colors flex items-center gap-2 shrink-0"
            >
              {showOwnerSecrets ? (
                <>
                  <EyeOff size={14} />
                  Sembunyikan
                </>
              ) : (
                <>
                  <Eye size={14} />
                  Lihat Detail
                </>
              )}
            </button>
          </div>

          {/* Secret Features Grid */}
          {showOwnerSecrets && (
            <div className="grid grid-cols-1 gap-3">
              {OWNER_SECRET_FEATURES.map((feature, i) => (
                <OwnerSecretCard key={i} feature={feature} />
              ))}
              
              {/* Security Best Practices */}
              <div className="mt-6 p-4 bg-red-950/20 border border-red-900/40 rounded-xl">
                <p className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
                  <Shield size={14} />
                  🔒 Security Best Practices untuk Owner
                </p>
                <ul className="space-y-2">
                  <li className="text-xs text-red-200/70 flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span><strong>Jangan share credentials:</strong> Akun Owner adalah akses penuh ke sistem. Jangan bagikan username/password.</span>
                  </li>
                  <li className="text-xs text-red-200/70 flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span><strong>Enable 2FA:</strong> Setup 2-factor authentication untuk proteksi maksimal.</span>
                  </li>
                  <li className="text-xs text-red-200/70 flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span><strong>Monitor Audit Logs:</strong> Rutin check audit logs untuk deteksi anomali dan unauthorized access.</span>
                  </li>
                  <li className="text-xs text-red-200/70 flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span><strong>Backup Rutin:</strong> Backup data setiap hari dan test restore 1x/bulan.</span>
                  </li>
                  <li className="text-xs text-red-200/70 flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span><strong>Dokumentasi Perubahan:</strong> Log semua perubahan konfigurasi sistem untuk compliance.</span>
                  </li>
                  <li className="text-xs text-red-200/70 flex items-start gap-2">
                    <span className="shrink-0">•</span>
                    <span><strong>Training Team:</strong> Educate team tentang role dan permissions mereka, tidak over-grant akses.</span>
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* Footer */}
      <div className="mt-10 pt-6 border-t border-zinc-800 flex items-center justify-between">
        <p className="text-xs text-zinc-600">ELYASR Management System · Panduan diperbarui 02 Agu 2026 · {userRole === 'OWNER' && <span className="text-emerald-600">✓ Owner Access</span>}</p>
        <div className="flex gap-2">
          {ROLES.map(r => (
            <span key={r.key} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${ROLE_BADGE[r.key]}`}>
              {r.label}
            </span>
          ))}
        </div>
      </div>
    </AppLayout>
  )
}
