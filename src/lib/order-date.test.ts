import { describe, it, expect } from 'vitest'
import { parseOrderDate, sameCalendarDay } from '@/lib/order-date'

describe('parseOrderDate', () => {
  it('parses Shopee YYYY-MM-DD HH:mm as WIB', () => {
    const d = parseOrderDate('2026-04-09 06:19')
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe(new Date('2026-04-09T06:19:00+07:00').toISOString())
  })

  it('parses TikTok YYYY-MM-DD HH:mm:ss', () => {
    const d = parseOrderDate('2026-04-09 00:17:22')
    expect(d).not.toBeNull()
    expect(d!.getUTCFullYear()).toBe(2026)
  })

  it('parses DD/MM/YYYY fallback', () => {
    const d = parseOrderDate('09/04/2026 00:17:22')
    expect(d).not.toBeNull()
    expect(d!.toISOString()).toBe(new Date('2026-04-09T00:17:22+07:00').toISOString())
  })

  it('returns null for empty', () => {
    expect(parseOrderDate(null)).toBeNull()
    expect(parseOrderDate('')).toBeNull()
    expect(parseOrderDate('invalid')).toBeNull()
  })
})

describe('sameCalendarDay', () => {
  it('matches same local calendar day', () => {
    const a = new Date('2026-07-15T10:00:00+07:00')
    const b = new Date('2026-07-15T23:00:00+07:00')
    expect(sameCalendarDay(a, b)).toBe(true)
  })

  it('rejects different days', () => {
    const a = new Date('2026-07-15T10:00:00+07:00')
    const b = new Date('2026-07-16T01:00:00+07:00')
    expect(sameCalendarDay(a, b)).toBe(false)
  })

  it('rejects 23:00 WIB 15 Jul vs 01:00 WIB 16 Jul even in UTC process TZ', () => {
    // 15 Jul 23:00 WIB = 15 Jul 16:00 UTC; 16 Jul 01:00 WIB = 15 Jul 18:00 UTC
    const a = new Date('2026-07-15T23:00:00+07:00')
    const b = new Date('2026-07-16T01:00:00+07:00')
    expect(sameCalendarDay(a, b)).toBe(false)
  })
})
