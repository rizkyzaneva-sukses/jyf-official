import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * GET /api/health/freshness
 * Kapan data terakhir diimport / dicatat — untuk closing & monitoring.
 */
export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const [
    lastOrder,
    lastPayout,
    lastAds,
    lastExpense,
    lastScan,
    orderCount7d,
    payoutCount7d,
  ] = await Promise.all([
    prisma.order.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, orderNo: true, platform: true } }),
    prisma.payout.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, orderNo: true, releasedDate: true } }),
    prisma.$queryRaw<{ created_at: Date; amount: number }[]>`
      SELECT l.created_at, l.amount
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE w.is_ads_budget = true AND l.trx_type = 'EXPENSE'
      ORDER BY l.created_at DESC
      LIMIT 1
    `,
    prisma.walletLedger.findFirst({
      where: { trxType: 'EXPENSE' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, category: true, amount: true },
    }),
    prisma.orderScanLog.findFirst({ orderBy: { scannedAt: 'desc' }, select: { scannedAt: true, orderNo: true } }),
    prisma.order.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 864e5) } } }),
    prisma.payout.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 864e5) } } }),
  ])

  const hoursAgo = (d: Date | null | undefined) =>
    d ? Math.round((Date.now() - d.getTime()) / 36e5) : null

  return apiSuccess({
    lastOrderImport: lastOrder
      ? { at: lastOrder.createdAt, orderNo: lastOrder.orderNo, platform: lastOrder.platform, hoursAgo: hoursAgo(lastOrder.createdAt) }
      : null,
    lastPayoutImport: lastPayout
      ? { at: lastPayout.createdAt, orderNo: lastPayout.orderNo, releasedDate: lastPayout.releasedDate, hoursAgo: hoursAgo(lastPayout.createdAt) }
      : null,
    lastAdsSpend: lastAds[0]
      ? { at: lastAds[0].created_at, amount: lastAds[0].amount, hoursAgo: hoursAgo(lastAds[0].created_at) }
      : null,
    lastExpense: lastExpense
      ? { at: lastExpense.createdAt, category: lastExpense.category, amount: lastExpense.amount, hoursAgo: hoursAgo(lastExpense.createdAt) }
      : null,
    lastResiScan: lastScan
      ? { at: lastScan.scannedAt, orderNo: lastScan.orderNo, hoursAgo: hoursAgo(lastScan.scannedAt) }
      : null,
    activity7d: { ordersInserted: orderCount7d, payoutsInserted: payoutCount7d },
  })
}
