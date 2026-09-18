import { describe, it, expect } from 'vitest'
import { wibDateRange } from '@/lib/utils'

describe('wibDateRange', () => {
  it('uses explicit +07:00 bounds', () => {
    const { fromDate, toDate } = wibDateRange('2026-07-01', '2026-07-31')
    expect(fromDate.toISOString()).toBe(new Date('2026-07-01T00:00:00+07:00').toISOString())
    expect(toDate.toISOString()).toBe(new Date('2026-07-31T23:59:59.999+07:00').toISOString())
  })

  it('does not shift month boundary to previous UTC day incorrectly for from', () => {
    const { fromDate } = wibDateRange('2026-08-01', '2026-08-01')
    // 2026-08-01 00:00 WIB = 2026-07-31 17:00 UTC
    expect(fromDate.getUTCDate()).toBe(31)
    expect(fromDate.getUTCMonth()).toBe(6) // July
  })
})
