import { wibYmd } from '@/lib/utils'

/**
 * Parse string tanggal order (dari CSV marketplace) ke Date WIB.
 *
 * Shopee "Waktu Dana Dilepaskan" : "2026-04-09 06:19"
 * TikTok "Order settled time"    : "2026-04-09 00:17:22"
 * TikTok "Created Time" fallback : "09/04/2026 00:17:22"
 * Lazada "createTime"             : "31 Aug 2026 09:24"
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

  // Lazada export: "31 Aug 2026 09:24" (English month abbreviation).
  const lazadaMatch = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})(?:\s+(\d{1,2}:\d{2}(?::\d{2})?))?$/)
  if (lazadaMatch) {
    const [, day, monthName, year, time = '00:00:00'] = lazadaMatch
    const months: Record<string, string> = {
      jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
      apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
      aug: '08', august: '08', sep: '09', sept: '09', september: '09', oct: '10',
      october: '10', nov: '11', november: '11', dec: '12', december: '12',
    }
    const month = months[monthName.toLowerCase()]
    if (!month) return null
    const normalizedTime = time.length === 5 ? `${time}:00` : time
    const d = new Date(`${year}-${month}-${day.padStart(2, '0')}T${normalizedTime}+07:00`)
    return isNaN(d.getTime()) ? null : d
  }

  return null
}

/** Bandingkan dua tanggal per-hari kalender WIB (abaikan jam). */
export function sameCalendarDay(a: Date, b: Date): boolean {
  return wibYmd(a) === wibYmd(b)
}
