// ─────────────────────────────────────────────
// Helper: Rentang waktu WIB (Asia/Jakarta)
// Instant nyata + kalender via @/lib/utils
// ─────────────────────────────────────────────
import { formatInTimeZone } from 'date-fns-tz'
import {
    WIB,
    todayWIBStr,
    addWibDays,
    wibMonthStartStr,
    wibDateRange,
    wibDayStart,
    wibDayEnd,
} from '@/lib/utils'

export { WIB }

export type Period = 'today' | 'yesterday' | 'week' | 'month'

export interface DateRangeResult {
    gte: Date
    lte: Date
    label: string
}

export function getDateRange(period: Period): DateRangeResult {
    const todayStr = todayWIBStr()

    if (period === 'today') {
        return {
            gte: wibDayStart(todayStr),
            lte: wibDayEnd(todayStr),
            label: 'Hari Ini',
        }
    }
    if (period === 'yesterday') {
        const prevStr = addWibDays(todayStr, -1)
        return {
            gte: wibDayStart(prevStr),
            lte: wibDayEnd(prevStr),
            label: 'Kemarin',
        }
    }
    if (period === 'week') {
        const weekAgo = addWibDays(todayStr, -6)
        const { fromDate, toDate } = wibDateRange(weekAgo, todayStr)
        return {
            gte: fromDate,
            lte: toDate,
            label: '7 Hari Terakhir',
        }
    }
    const { fromDate, toDate } = wibDateRange(wibMonthStartStr(), todayStr)
    return {
        gte: fromDate,
        lte: toDate,
        label: 'Bulan Ini',
    }
}

export function fmtWIBDate(d: Date): string {
    return formatInTimeZone(d, WIB, 'd MMM yyyy')
}

export function getCustomDateRange(startDate: string, endDate?: string): DateRangeResult {
    const gte = new Date(startDate + 'T00:00:00+07:00')
    const lteStr = endDate || startDate
    const lte = new Date(lteStr + 'T23:59:59+07:00')
    const label = endDate && endDate !== startDate
        ? `${fmtWIBDate(gte)} – ${fmtWIBDate(lte)}`
        : fmtWIBDate(gte)
    return { gte, lte, label }
}

export function resolveRange(period?: string, startDate?: string, endDate?: string): DateRangeResult {
    if (startDate) return getCustomDateRange(startDate, endDate)
    return getDateRange((period || 'today') as Period)
}

export function formatRp(n: number) {
    return 'Rp ' + Math.round(n).toLocaleString('id-ID')
}
