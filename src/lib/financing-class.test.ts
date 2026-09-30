import { describe, expect, it } from 'vitest'
import {
  isFinancingExpenseCategory,
  isFinancingIncomeCategory,
  signedWalletAmount,
} from './financing-class'

describe('klasifikasi pendanaan vs beban', () => {
  it('pembayaran utang pinjaman bukan beban', () => {
    expect(isFinancingExpenseCategory('Bayar Utang - Bank BCA')).toBe(true)
    expect(isFinancingExpenseCategory('Pembayaran Utang')).toBe(true)
    expect(isFinancingExpenseCategory('Gaji & Tunjangan')).toBe(false)
    expect(isFinancingExpenseCategory('Bayar Vendor - Konveksi')).toBe(false)
  })

  it('suntikan dana dan terima pinjaman bukan pendapatan', () => {
    expect(isFinancingIncomeCategory('Utang - Pak Budi')).toBe(true)
    expect(isFinancingIncomeCategory('Suntikan Modal')).toBe(true)
    expect(isFinancingIncomeCategory('Suntikan Dana - Investor')).toBe(true)
    expect(isFinancingIncomeCategory('Terima Piutang - Budi')).toBe(true)
    expect(isFinancingIncomeCategory('Refund Platform')).toBe(false)
  })

  it('kasbon dan pemberian piutang bukan beban', () => {
    expect(isFinancingExpenseCategory('Piutang - Budi (Staff)')).toBe(true)
    expect(isFinancingExpenseCategory('Piutang')).toBe(true)
  })

  it('bayar utang dan beri piutang mengurangi kas', () => {
    expect(signedWalletAmount('BAYAR_UTANG', 5000)).toBe(-5000)
    expect(signedWalletAmount('BERI_PIUTANG', 5000)).toBe(-5000)
    expect(signedWalletAmount('TERIMA_UTANG', 5000)).toBe(5000)
    expect(signedWalletAmount('MODAL_MASUK', 5000)).toBe(5000)
    expect(signedWalletAmount('VENDOR_PAYMENT', 5000)).toBe(-5000)
  })
})
