import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiError, apiSuccess, parseWibDateInput } from '@/lib/utils'
import { type ExpenseImportInputRow, validateExpenseImportRows } from '@/lib/expense-import'

const MAX_ROWS = 5_000
const CHUNK_SIZE = 500

// POST /api/wallet/ledger/import-expenses — preview dan simpan impor massal pengeluaran.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const rows = body.rows as ExpenseImportInputRow[] | undefined
  const mode = body.mode === 'import' ? 'import' : 'preview'

  if (!Array.isArray(rows) || rows.length === 0) return apiError('Tidak ada data pengeluaran untuk diproses')
  if (rows.length > MAX_ROWS) return apiError(`Maksimal ${MAX_ROWS.toLocaleString('id-ID')} baris per impor`)

  const [wallets, categories] = await Promise.all([
    prisma.wallet.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    }),
    prisma.masterExpenseCategory.findMany({
      where: { isActive: true },
      select: { name: true },
    }),
  ])

  const result = validateExpenseImportRows(rows, { wallets, categories })
  const summary = {
    totalRows: rows.length,
    validRows: result.validRows.length,
    invalidRows: result.errors.length,
    totalAmount: result.totalAmount,
    errors: result.errors,
  }

  if (mode === 'preview') return apiSuccess(summary)

  if (result.errors.length > 0) {
    return Response.json({
      success: false,
      error: 'Impor dibatalkan. Perbaiki semua baris yang tidak valid terlebih dahulu.',
      data: summary,
    }, { status: 422 })
  }

  await prisma.$transaction(async (tx) => {
    for (let index = 0; index < result.validRows.length; index += CHUNK_SIZE) {
      const chunk = result.validRows.slice(index, index + CHUNK_SIZE)
      await tx.walletLedger.createMany({
        data: chunk.map(row => ({
          walletId: row.walletId,
          trxDate: parseWibDateInput(row.trxDate),
          trxType: 'EXPENSE' as const,
          category: row.category,
          amount: -row.amount,
          note: row.note,
          createdBy: session.username,
        })),
      })
    }
  })

  return apiSuccess({
    ...summary,
    inserted: result.validRows.length,
    message: `${result.validRows.length.toLocaleString('id-ID')} pengeluaran berhasil diimpor`,
  }, 201)
}
