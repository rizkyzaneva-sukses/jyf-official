# AGENTS.md — Project Conventions & Owner Preferences

## Deployment workflow (IMPORTANT — owner preference)
- Setelah menyelesaikan perubahan kode, **langsung commit DAN push** ke `origin/master`
  tanpa menunggu permintaan eksplisit tiap kali. Owner langsung deploy di Easypanel,
  jadi branch harus selalu up-to-date dan siap deploy. Jangan biarkan perubahan
  menumpuk sebagai working tree dirty.
- Pesan commit: bahasa Indonesia, singkat, jelaskan fitur/perbaikan (gaya repo saat ini).
- JANGAN pernah `git push --force` ke master.

## Environment notes (server lokal ini)
- Disk drive D sering hampir penuh (~6 MB free). Sebelum `npx prisma generate` atau
  `npm run build`, bersihkan dulu cache untuk memberi ruang:
  hapus folder `.next` dan file `*.log` (mis. `.next-start.err.log`) kalau perlu.
- Prisma client wajib di-`generate` ulang setelah mengubah `prisma/schema.prisma`,
  kalau tidak tipe field baru tidak dikenali (error tsc).

## Tech stack
- Next.js 15 (App Router) + Prisma + PostgreSQL. Scheduler laporan jalan di
  `src/instrumentation.ts` (node-cron, timezone Asia/Jakarta).
- Laporan Telegram (daily/weekly/monthly) dikirim via `broadcastTelegramReport`
  yang memfilter `TelegramRecipient` berdasarkan kolom `report_types`.
