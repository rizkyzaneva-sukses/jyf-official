import { wibYmd } from '@/lib/utils'

/**
 * Parse string tanggal order (dari CSV marketplace) ke Date WIB.
 *
 * Shopee "Waktu Dana Dilepaskan" : "2026-04-09 06:19"
 * TikTok "Order settled time"    : "2026-04-09 00:17:22"
 * TikTok "Created Time" fallback : "09/04/2026 00:17:22"
 */
export function parseOrderDate(raw: string | null | undefined): Date | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (!s) return null

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const normalized = s.replace(' ', 'T')
    const withSeconds = normalized.length === 16 ? normalized + ':00' : normalized
    const d = new Date(withSeconds.includes('+') || withSeconds.endsWith('Z') ? withSeconds : withSeconds + '+07:00')
    return isNaN(d.getTime()) ? null : d
  }

  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    const [datePart, timePart] = s.split(' ')
    const [day, m, y] = datePart.split('/')
    const d = new Date(`${y}-${m}-${day}T${timePart || '00:00:00'}+07:00`)
    return isNaN(d.getTime()) ? null : d
  }

  return null
}

/** Bandingkan dua tanggal per-hari kalender WIB (abaikan jam). */
export function sameCalendarDay(a: Date, b: Date): boolean {
  return wibYmd(a) === wibYmd(b)
}
