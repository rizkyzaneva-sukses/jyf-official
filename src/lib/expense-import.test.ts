import { describe, expect, it } from 'vitest'
import { normalizeExpenseImportAmount, normalizeExpenseImportDate, validateExpenseImportRows } from './expense-import'

const master = {
  wallets: [{ id: 'wallet-kas', name: 'Kas Utama' }],
  categories: [{ name: 'Listrik & Air' }],
}

describe('expense import validation', () => {
  it('normalizes dates and Rupiah amounts from a spreadsheet', () => {
    expect(normalizeExpenseImportDate('01/10/2026')).toBe('2026-10-01')
    expect(normalizeExpenseImportDate('2026-10-01')).toBe('2026-10-01')
    expect(normalizeExpenseImportAmount('Rp 1.250.000')).toBe(1250000)
    expect(normalizeExpenseImportAmount('1,250,000')).toBe(1250000)
  })

  it('uses canonical wallet and category names, ignoring casing and extra spaces', () => {
    const result = validateExpenseImportRows([
      { rowNumber: 2, tanggal: '2026-10-01', wallet: '  kas utama ', kategori: 'listrik & air', nominal: '450.000', catatan: 'Token listrik' },
    ], master)

    expect(result.errors).toEqual([])
    expect(result.totalAmount).toBe(450000)
    expect(result.validRows[0]).toMatchObject({ walletId: 'wallet-kas', walletName: 'Kas Utama', category: 'Listrik & Air', amount: 450000 })
  })

  it('reports all invalid fields without producing a partial valid row', () => {
    const result = validateExpenseImportRows([
      { rowNumber: 9, tanggal: '2026-02-31', wallet: 'Wallet Tidak Ada', kategori: 'Tidak Ada', nominal: '-1000' },
    ], master)

    expect(result.validRows).toEqual([])
    expect(result.errors).toEqual([{
      rowNumber: 9,
      message: 'Tanggal tidak valid (gunakan YYYY-MM-DD). Wallet tidak ditemukan atau tidak aktif. Kategori tidak ditemukan atau tidak aktif. Nominal harus berupa Rupiah positif tanpa desimal',
    }])
  })
})
