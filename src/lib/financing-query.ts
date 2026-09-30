import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { isFinancingExpenseCategory, isFinancingIncomeCategory } from './financing-class'

type LedgerWhere = Prisma.WalletLedgerWhereInput

const EXPENSE_PREFIXES = ['Bayar Utang', 'Pembayaran Utang', 'Piutang - '] as const
const INCOME_PREFIXES = ['Utang - ', 'Terima Piutang', 'Suntikan'] as const

export function financingExpenseWhere(): LedgerWhere {
  return {
    OR: [
      ...EXPENSE_PREFIXES.map((prefix) => ({
        category: { startsWith: prefix, mode: 'insensitive' as const },
      })),
      { category: { equals: 'Piutang', mode: 'insensitive' as const } },
    ],
  }
}

export function financingIncomeWhere(): LedgerWhere {
  return {
    OR: INCOME_PREFIXES.map((prefix) => ({
      category: { startsWith: prefix, mode: 'insensitive' as const },
    })),
  }
}

/** Sisipkan di query SQL beban: `AND NOT (kategori pendanaan)`. */
export function sqlExcludeFinancingExpense(column = 'category'): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_.]*$/i.test(column)) {
    throw new Error('kolom kategori tidak valid')
  }
  const checks = [
    ...EXPENSE_PREFIXES.map((prefix) => Prisma.sql`${Prisma.raw(column)} ILIKE ${prefix + '%'}`),
    Prisma.sql`lower(COALESCE(${Prisma.raw(column)}, '')) = 'piutang'`,
  ]
  return Prisma.sql`AND NOT (${Prisma.join(checks, ' OR ')})`
}

let reclassifyOnce: Promise<void> | null = null

/**
 * Jurnal lama yang salah dicatat sebagai beban / pendapatan lain
 * dipindah ke tipe pendanaan. Aman dijalankan berulang.
 */
export function ensureFinancingLedgersReclassified(): Promise<void> {
  if (!reclassifyOnce) {
    reclassifyOnce = reclassifyFinancingLedgers().catch((err) => {
      reclassifyOnce = null
      console.error('[financing] reklasifikasi jurnal gagal:', err)
    })
  }
  return reclassifyOnce
}

async function reclassifyFinancingLedgers() {
  const expenses = await prisma.walletLedger.findMany({
    where: { trxType: 'EXPENSE', ...financingExpenseWhere() },
    select: { id: true, category: true },
  })
  const bayarUtangIds = expenses
    .filter((row) => row.category && !isPiutangCategory(row.category))
    .map((row) => row.id)
  const beriPiutangIds = expenses
    .filter((row) => isPiutangCategory(row.category))
    .map((row) => row.id)

  if (bayarUtangIds.length > 0) {
    await prisma.walletLedger.updateMany({
      where: { id: { in: bayarUtangIds } },
      data: { trxType: 'BAYAR_UTANG' },
    })
  }
  if (beriPiutangIds.length > 0) {
    await prisma.walletLedger.updateMany({
      where: { id: { in: beriPiutangIds } },
      data: { trxType: 'BERI_PIUTANG' },
    })
  }

  const incomes = await prisma.walletLedger.findMany({
    where: { trxType: 'OTHER_INCOME', ...financingIncomeWhere() },
    select: { id: true, category: true },
  })
  const terimaUtangIds: string[] = []
  const suntikanIds: string[] = []
  const terimaPiutangIds: string[] = []
  for (const row of incomes) {
    if (!isFinancingIncomeCategory(row.category)) continue
    const c = (row.category ?? '').trim().toLowerCase()
    if (c.startsWith('suntikan')) suntikanIds.push(row.id)
    else if (c.startsWith('terima piutang')) terimaPiutangIds.push(row.id)
    else terimaUtangIds.push(row.id)
  }

  if (terimaUtangIds.length > 0) {
    await prisma.walletLedger.updateMany({
      where: { id: { in: terimaUtangIds } },
      data: { trxType: 'TERIMA_UTANG' },
    })
  }
  if (suntikanIds.length > 0) {
    await prisma.walletLedger.updateMany({
      where: { id: { in: suntikanIds } },
      data: { trxType: 'MODAL_MASUK' },
    })
  }
  if (terimaPiutangIds.length > 0) {
    await prisma.walletLedger.updateMany({
      where: { id: { in: terimaPiutangIds } },
      data: { trxType: 'TERIMA_PIUTANG_ND' },
    })
  }
}

function isPiutangCategory(category: string | null): boolean {
  if (!isFinancingExpenseCategory(category)) return false
  const c = (category ?? '').trim().toLowerCase()
  return c === 'piutang' || c.startsWith('piutang - ')
}
