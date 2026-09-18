import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { formatInTimeZone } from 'date-fns-tz'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Timezone WIB (Asia/Jakarta) ─────────────────────────
// Aturan:
// - Instant nyata = `new Date()` / `nowWIB()` (UTC di dalamnya).
// - Kalender/tampilan = `wibYmd` / `formatWIB` / `formatDate` (kunci Asia/Jakarta).
// - Filter & simpan input YYYY-MM-DD = `wibDateRange` / `parseWibDateInput` (`+07:00`).
// JANGAN: toISOString().slice(0,10), new Date('YYYY-MM-DD'),
//         toLocaleString() lalu new Date(string), toZonedTime + formatTz.
export const WIB = 'Asia/Jakarta'

/** Instant UTC sekarang. Jangan pakai getHours/getDate — pakai wibYmd / formatWIB. */
export function nowWIB(): Date {
  return new Date()
}

/** Format Date (instant nyata) ke string di zona WIB. */
export function formatWIB(d: Date, pattern: string): string {
  return formatInTimeZone(d, WIB, pattern)
}

/** Kalender YYYY-MM-DD di zona WIB untuk suatu instant (default: sekarang). */
export function wibYmd(date: Date | string = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-CA', { timeZone: WIB })
}

/** Tanggal hari ini di WIB sebagai YYYY-MM-DD. */
export function todayWIBStr(): string {
  return wibYmd(new Date())
}

export function wibDayStart(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T00:00:00+07:00`)
}

export function wibDayEnd(ymd: string): Date {
  return new Date(`${ymd.slice(0, 10)}T23:59:59.999+07:00`)
}

/** Range tanggal filter (WIB eksplisit, hindari geser UTC). */
export function wibDateRange(dateFrom: string, dateTo: string): { fromDate: Date; toDate: Date } {
  return {
    fromDate: wibDayStart(dateFrom),
    toDate: wibDayEnd(dateTo),
  }
}

/**
 * Parse input form/API tanggal sebagai WIB.
 * `YYYY-MM-DD` → 00:00:00+07:00. Datetime tanpa offset dianggap WIB.
 */
export function parseWibDateInput(value: string | Date): Date {
  if (value instanceof Date) return value
  const s = String(value).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return wibDayStart(s)
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) && !/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const normalized = s.replace(' ', 'T')
    const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
      ? `${normalized}:00`
      : normalized
    return new Date(`${withSeconds}+07:00`)
  }
  return new Date(s)
}

/** Geser kalender YYYY-MM-DD di WIB (aman lintas TZ proses). */
export function addWibDays(ymd: string, days: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00+07:00`)
  return wibYmd(new Date(d.getTime() + days * 86400000))
}

export function wibMonthStartStr(ymd = todayWIBStr()): string {
  return `${ymd.slice(0, 7)}-01`
}

export function wibMonthEndStr(ymd = todayWIBStr()): string {
  const [y, m] = ymd.slice(0, 7).split('-').map(Number)
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

export function wibMondayOfWeek(ymd = todayWIBStr()): string {
  const noon = new Date(`${ymd.slice(0, 10)}T12:00:00+07:00`)
  const utcDay = noon.getUTCDay()
  const diff = utcDay === 0 ? -6 : 1 - utcDay
  return addWibDays(ymd, diff)
}

export type WibPreset =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'month'
  | 'lastmonth'
  | 'quarter'
  | 'this_month'
  | 'last_month'

/** Preset filter UI. `month` = MTD; `this_month` = 1 s/d akhir bulan kalender. */
export function wibPresetRange(preset: WibPreset, today = todayWIBStr()): { from: string; to: string } {
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case 'yesterday': {
      const y = addWibDays(today, -1)
      return { from: y, to: y }
    }
    case 'week':
      return { from: wibMondayOfWeek(today), to: today }
    case 'month':
      return { from: wibMonthStartStr(today), to: today }
    case 'this_month':
      return { from: wibMonthStartStr(today), to: wibMonthEndStr(today) }
    case 'lastmonth':
    case 'last_month': {
      const prevLast = addWibDays(wibMonthStartStr(today), -1)
      return { from: wibMonthStartStr(prevLast), to: prevLast }
    }
    case 'quarter': {
      const [y, m] = today.split('-').map(Number)
      const qStart = Math.floor((m - 1) / 3) * 3 + 1
      return { from: `${y}-${String(qStart).padStart(2, '0')}-01`, to: today }
    }
    default:
      return { from: today, to: today }
  }
}

/** Awal hari WIB, N-1 hari ke belakang (inklusif, untuk sparkline/cashflow). */
export function wibStartDaysAgo(days: number, from = new Date()): Date {
  const ymd = addWibDays(wibYmd(from), -(Math.max(1, days) - 1))
  return wibDayStart(ymd)
}

// ── Format currency (IDR) ──────────────────────────────
// Parameter `short` dipertahankan agar tidak perlu ubah semua call site,
// tapi mode singkat DINONAKTIFKAN — semua angka selalu ditampilkan penuh
// (misal: Rp172.000.000, bukan Rp172jt) sesuai permintaan tim.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function formatRupiah(amount: number, short = false): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ── Format date ────────────────────────────────────────
export function formatDate(date: Date | string | null | undefined, format: 'short' | 'long' | 'datetime' = 'short'): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return '-'

  if (format === 'datetime') {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: WIB,
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    }).format(d)
  }
  if (format === 'long') {
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: WIB,
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(d)
  }
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: WIB,
    day: '2-digit', month: 'short', year: 'numeric',
  }).format(d)
}

// ── PO Number Generator ────────────────────────────────
export function generatePONumber(poDate: Date, existingPONumbers: string[]): string {
  const dateStr = wibYmd(poDate).replace(/-/g, '')
  const prefix = `PO-${dateStr}-`
  const existing = existingPONumbers
    .filter(n => n.startsWith(prefix))
    .map(n => parseInt(n.replace(prefix, ''), 10))
    .filter(n => !isNaN(n))
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
  return `${prefix}${next.toString().padStart(2, '0')}`
}

// ── GR Number Generator ────────────────────────────────
export function generateGRNumber(receiptDate: Date, existingGRNumbers: string[]): string {
  const yearMonth = wibYmd(receiptDate).slice(0, 7).replace('-', '')
  const prefix = `GR-${yearMonth}-`
  const existing = existingGRNumbers
    .filter(n => n.startsWith(prefix))
    .map(n => parseInt(n.replace(prefix, ''), 10))
    .filter(n => !isNaN(n))
  const next = existing.length > 0 ? Math.max(...existing) + 1 : 1
  return `${prefix}${next.toString().padStart(3, '0')}`
}

// ── SOH Calculator ─────────────────────────────────────
export interface LedgerEntry {
  sku: string
  direction: 'IN' | 'OUT'
  qty: number
  trxDate: Date | string
}

export function calculateSOH(
  stokAwal: number,
  lastOpnameDate: Date | string | null | undefined,
  ledgerEntries: LedgerEntry[]
): number {
  const cutoff = lastOpnameDate ? new Date(lastOpnameDate) : null
  const relevant = cutoff
    ? ledgerEntries.filter(e => new Date(e.trxDate) >= cutoff)
    : ledgerEntries

  const inQty = relevant.filter(e => e.direction === 'IN').reduce((s, e) => s + e.qty, 0)
  const outQty = relevant.filter(e => e.direction === 'OUT').reduce((s, e) => s + e.qty, 0)
  return stokAwal + inQty - outQty
}

// ── API Response helpers ───────────────────────────────
export function apiSuccess<T>(data: T, status = 200) {
  return Response.json({ success: true, data }, { status })
}

export function apiError(message: string, status = 400) {
  return Response.json({ success: false, error: message }, { status })
}

// ── Paginate ───────────────────────────────────────────
export interface PaginationParams {
  page?: number
  limit?: number
}

export function getPagination(params: PaginationParams) {
  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 20))
  const skip = (page - 1) * limit
  return { page, limit, skip, take: limit }
}

// ── CSV Download helper ────────────────────────────────
export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map(row =>
      headers
        .map(h => {
          const val = row[h]
          const str = val === null || val === undefined ? '' : String(val)
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str
        })
        .join(',')
    ),
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// ── Number parse ───────────────────────────────────────
export function safeInt(value: unknown, fallback = 0): number {
  const n = parseInt(String(value), 10)
  return isNaN(n) ? fallback : n
}

export function safeFloat(value: unknown, fallback = 0): number {
  const n = parseFloat(String(value))
  return isNaN(n) ? fallback : n
}
