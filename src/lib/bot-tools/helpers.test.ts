import { describe, it, expect } from 'vitest'
import {
  getDateRange,
  getCustomDateRange,
  resolveRange,
  formatRp,
  fmtWIBDate,
} from '@/lib/bot-tools/helpers'
import { todayWIBStr } from '@/lib/utils'

// ── formatRp ────────────────────────────────────────────

describe('formatRp', () => {
  it('formats a positive number with Rp prefix', () => {
    const result = formatRp(150000)
    expect(result).toContain('Rp')
    expect(result).toContain('150.000')
  })

  it('formats zero', () => {
    const result = formatRp(0)
    expect(result).toBe('Rp 0')
  })

  it('rounds decimal numbers', () => {
    const result = formatRp(150000.7)
    expect(result).toContain('150.001')
  })

  it('rounds down', () => {
    const result = formatRp(150000.3)
    expect(result).toContain('150.000')
  })

  it('formats large numbers with grouping', () => {
    const result = formatRp(1000000)
    expect(result).toContain('1.000.000')
  })

  it('formats negative numbers', () => {
    const result = formatRp(-5000)
    expect(result).toContain('Rp')
    expect(result).toContain('5.000')
  })
})

// ── fmtWIBDate ──────────────────────────────────────────

describe('fmtWIBDate', () => {
  it('formats a date in d MMM yyyy format', () => {
    const d = new Date('2026-06-15T10:00:00+07:00')
    const result = fmtWIBDate(d)
    expect(result).toBe('15 Jun 2026')
  })

  it('formats January date correctly', () => {
    const d = new Date('2026-01-02T00:00:00+07:00')
    const result = fmtWIBDate(d)
    expect(result).toBe('2 Jan 2026')
  })

  it('formats a date in December', () => {
    const d = new Date('2025-12-25T12:00:00+07:00')
    const result = fmtWIBDate(d)
    expect(result).toBe('25 Dec 2025')
  })

  it('formats single-digit day without leading zero', () => {
    const d = new Date('2026-03-05T08:00:00+07:00')
    const result = fmtWIBDate(d)
    expect(result).toBe('5 Mar 2026')
  })
})

// ── getDateRange ────────────────────────────────────────

describe('getDateRange', () => {
  it('returns today range with correct label', () => {
    const result = getDateRange('today')
    expect(result.label).toBe('Hari Ini')
    expect(result.gte).toBeInstanceOf(Date)
    expect(result.lte).toBeInstanceOf(Date)
  })

  it('today gte is start of today WIB (T00:00:00+07:00)', () => {
    const result = getDateRange('today')
    expect(result.gte.toISOString()).toBe(new Date(todayWIBStr() + 'T00:00:00+07:00').toISOString())
  })

  it('today gte is before or equal to lte', () => {
    const result = getDateRange('today')
    expect(result.gte.getTime()).toBeLessThanOrEqual(result.lte.getTime())
  })

  it('yesterday range has "Kemarin" label', () => {
    const result = getDateRange('yesterday')
    expect(result.label).toBe('Kemarin')
    expect(result.gte).toBeInstanceOf(Date)
    expect(result.lte).toBeInstanceOf(Date)
  })

  it('yesterday gte is before today gte', () => {
    const today = getDateRange('today')
    const yesterday = getDateRange('yesterday')
    expect(yesterday.gte.getTime()).toBeLessThan(today.gte.getTime())
  })

  it('week range has "7 Hari Terakhir" label', () => {
    const result = getDateRange('week')
    expect(result.label).toBe('7 Hari Terakhir')
  })

  it('week range spans approximately 7 days', () => {
    const result = getDateRange('week')
    const diffDays = (result.lte.getTime() - result.gte.getTime()) / (1000 * 60 * 60 * 24)
    expect(diffDays).toBeGreaterThanOrEqual(6)
    expect(diffDays).toBeLessThanOrEqual(7)
  })

  it('month range has "Bulan Ini" label', () => {
    const result = getDateRange('month')
    expect(result.label).toBe('Bulan Ini')
  })

  it('month gte is before or equal to week gte', () => {
    const monthResult = getDateRange('month')
    const weekResult = getDateRange('week')
    // month start should be on or before week start
    expect(monthResult.gte.getTime()).toBeLessThanOrEqual(weekResult.gte.getTime())
  })

  it('all ranges have gte before or equal to lte', () => {
    const periods = ['today', 'yesterday', 'week', 'month'] as const
    for (const period of periods) {
      const result = getDateRange(period)
      expect(result.gte.getTime()).toBeLessThanOrEqual(result.lte.getTime())
    }
  })
})

// ── getCustomDateRange ──────────────────────────────────

describe('getCustomDateRange', () => {
  it('returns range for a single date', () => {
    const result = getCustomDateRange('2026-06-15')
    expect(result.gte).toBeInstanceOf(Date)
    expect(result.lte).toBeInstanceOf(Date)
    expect(result.gte.getTime()).toBeLessThanOrEqual(result.lte.getTime())
  })

  it('sets gte to start of day in WIB (00:00:00+07:00)', () => {
    const result = getCustomDateRange('2026-06-15')
    // gte should be 2026-06-15T00:00:00+07:00 = 2026-06-14T17:00:00Z
    expect(result.gte.toISOString()).toBe('2026-06-14T17:00:00.000Z')
  })

  it('sets lte to end of day in WIB (23:59:59+07:00)', () => {
    const result = getCustomDateRange('2026-06-15')
    // lte should be 2026-06-15T23:59:59+07:00 = 2026-06-15T16:59:59Z
    expect(result.lte.toISOString()).toBe('2026-06-15T16:59:59.000Z')
  })

  it('uses startDate as endDate when endDate is omitted', () => {
    const result = getCustomDateRange('2026-06-15')
    // label should be a single date, not a range
    expect(result.label).not.toContain('–')
  })

  it('returns range between two dates', () => {
    const result = getCustomDateRange('2026-06-01', '2026-06-15')
    expect(result.gte.getTime()).toBeLessThan(result.lte.getTime())
  })

  it('shows range label when startDate !== endDate', () => {
    const result = getCustomDateRange('2026-06-01', '2026-06-15')
    expect(result.label).toContain('–')
  })

  it('shows single date label when startDate === endDate', () => {
    const result = getCustomDateRange('2026-06-15', '2026-06-15')
    expect(result.label).not.toContain('–')
  })
})

// ── resolveRange ────────────────────────────────────────

describe('resolveRange', () => {
  it('defaults to today when no arguments provided', () => {
    const result = resolveRange()
    expect(result.label).toBe('Hari Ini')
  })

  it('uses period when provided', () => {
    const result = resolveRange('week')
    expect(result.label).toBe('7 Hari Terakhir')
  })

  it('prefers startDate over period', () => {
    const result = resolveRange('week', '2026-06-01')
    // Should use custom range, not week
    expect(result.label).not.toBe('7 Hari Terakhir')
  })

  it('returns custom range when startDate provided', () => {
    const result = resolveRange(undefined, '2026-06-01', '2026-06-15')
    expect(result.gte).toBeInstanceOf(Date)
    expect(result.lte).toBeInstanceOf(Date)
    expect(result.gte.getTime()).toBeLessThan(result.lte.getTime())
  })

  it('handles empty period string by defaulting to today', () => {
    const result = resolveRange('')
    expect(result.label).toBe('Hari Ini')
  })

  it('resolves all preset periods', () => {
    expect(resolveRange('today').label).toBe('Hari Ini')
    expect(resolveRange('yesterday').label).toBe('Kemarin')
    expect(resolveRange('week').label).toBe('7 Hari Terakhir')
    expect(resolveRange('month').label).toBe('Bulan Ini')
  })
})
