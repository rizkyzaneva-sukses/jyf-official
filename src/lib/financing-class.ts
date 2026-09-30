/**
 * Arus kas pendanaan (pinjaman, suntikan dana, piutang non-dagang).
 * Bukan beban dan bukan pendapatan — tidak masuk laba rugi.
 * Posisinya di neraca (kas, utang, piutang, modal) dan di arus kas.
 */

const FINANCING_EXPENSE_PREFIXES = ['bayar utang', 'pembayaran utang', 'piutang - '] as const
const FINANCING_INCOME_PREFIXES = ['utang - ', 'terima piutang', 'suntikan'] as const

export function isFinancingExpenseCategory(category: string | null | undefined): boolean {
  if (!category) return false
  const c = category.trim().toLowerCase()
  if (c === 'piutang') return true
  return FINANCING_EXPENSE_PREFIXES.some((prefix) => c.startsWith(prefix))
}

export function isFinancingIncomeCategory(category: string | null | undefined): boolean {
  if (!category) return false
  const c = category.trim().toLowerCase()
  return FINANCING_INCOME_PREFIXES.some((prefix) => c.startsWith(prefix))
}

/** Keluar kas. TRANSFER ikut supaya edit nominal transfer tetap bertanda seperti sebelumnya. */
export const WALLET_OUTFLOW_TYPES = [
  'EXPENSE',
  'PRIVE',
  'INVESTASI',
  'BAYAR_UTANG',
  'PENGEMBALIAN_MODAL',
  'VENDOR_PAYMENT',
  'BERI_PIUTANG',
  'TRANSFER',
] as const

export function signedWalletAmount(trxType: string, amount: number): number {
  return (WALLET_OUTFLOW_TYPES as readonly string[]).includes(trxType)
    ? -Math.abs(amount)
    : Math.abs(amount)
}
