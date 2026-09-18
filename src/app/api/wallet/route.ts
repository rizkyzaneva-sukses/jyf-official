import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError } from '@/lib/utils'
import { withFinance } from '@/lib/api-helpers'

// GET /api/wallet — all wallets with balance
export const GET = withFinance(async (session) => {
  const wallets = await prisma.wallet.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })

  // Calculate balance per wallet from ledger
  const ledgerSums = await prisma.walletLedger.groupBy({
    by: ['walletId'],
    _sum: { amount: true },
  })

  const balanceMap = new Map(ledgerSums.map(l => [l.walletId, l._sum.amount ?? 0]))

  const result = wallets.map(w => ({
    ...w,
    balance: balanceMap.get(w.id) ?? 0,
  }))

  return apiSuccess(result)
})

// POST /api/wallet — create wallet
export const POST = withFinance(async (session, request) => {
  const body = await request.json()
  const { name, isAdsBudget, linkedPlatform } = body
  if (!name) return apiError('Nama wallet wajib diisi')

  const wallet = await prisma.wallet.create({
    data: {
      name,
      ...(isAdsBudget !== undefined && { isAdsBudget }),
      ...(linkedPlatform !== undefined && { linkedPlatform }),
    },
  })
  return apiSuccess(wallet, 201)
})
