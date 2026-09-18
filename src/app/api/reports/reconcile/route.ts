import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, wibDateRange } from '@/lib/utils'

/**
 * GET /api/reports/reconcile?dateFrom=&dateTo=
 * Rekonsiliasi order ↔ payout untuk periode (WIB).
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  if (!dateFrom || !dateTo) return apiError('dateFrom dan dateTo wajib')

  const { fromDate, toDate } = wibDateRange(dateFrom, dateTo)

  const [
    ordersInPeriod,
    payoutsInPeriod,
    orderNoWithPayout,
    unpaidOrders,
    orphanPayouts,
    negativePayouts,
    returWithPayout,
  ] = await Promise.all([
    prisma.$queryRaw<{ cnt: bigint; omzet: bigint }[]>`
      SELECT COUNT(DISTINCT order_no)::bigint AS cnt,
             COALESCE(SUM(real_omzet), 0)::bigint AS omzet
      FROM orders
      WHERE trx_date >= ${fromDate} AND trx_date <= ${toDate}
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
    `,
    prisma.payout.aggregate({
      where: { releasedDate: { gte: fromDate, lte: toDate } },
      _count: true,
      _sum: { totalIncome: true, omzet: true },
    }),
    prisma.$queryRaw<{ order_no: string }[]>`
      SELECT DISTINCT o.order_no
      FROM orders o
      INNER JOIN payouts p ON p.order_no = o.order_no
      WHERE o.trx_date >= ${fromDate} AND o.trx_date <= ${toDate}
        AND o.status NOT ILIKE '%batal%'
        AND o.status NOT ILIKE '%cancel%'
        AND o.status NOT ILIKE '%dibatalkan%'
    `,
    // Order masuk periode, belum ada payout (belum cair)
    prisma.$queryRaw<{
      order_no: string
      platform: string | null
      status: string
      trx_date: Date | null
      omzet: bigint
    }[]>`
      SELECT o.order_no, o.platform, MAX(o.status) AS status,
             MIN(o.trx_date) AS trx_date,
             COALESCE(SUM(o.real_omzet), 0)::bigint AS omzet
      FROM orders o
      LEFT JOIN payouts p ON p.order_no = o.order_no
      WHERE o.trx_date >= ${fromDate} AND o.trx_date <= ${toDate}
        AND o.status NOT ILIKE '%batal%'
        AND o.status NOT ILIKE '%cancel%'
        AND o.status NOT ILIKE '%dibatalkan%'
        AND p.id IS NULL
      GROUP BY o.order_no, o.platform
      ORDER BY omzet DESC
      LIMIT 50
    `,
    // Payout cair di periode, order tidak ada
    prisma.$queryRaw<{
      order_no: string
      platform: string | null
      released_date: Date
      total_income: number
    }[]>`
      SELECT p.order_no, p.platform, p.released_date, p.total_income
      FROM payouts p
      LEFT JOIN orders o ON o.order_no = p.order_no
      WHERE p.released_date >= ${fromDate} AND p.released_date <= ${toDate}
        AND o.id IS NULL
      ORDER BY p.total_income DESC
      LIMIT 50
    `,
    prisma.payout.findMany({
      where: {
        releasedDate: { gte: fromDate, lte: toDate },
        totalIncome: { lt: 0 },
      },
      select: { orderNo: true, platform: true, totalIncome: true, releasedDate: true, bebanOngkir: true },
      take: 50,
      orderBy: { totalIncome: 'asc' },
    }),
    // Payout positif tapi order status retur
    prisma.$queryRaw<{
      order_no: string
      total_income: number
      status: string
    }[]>`
      SELECT p.order_no, p.total_income, MAX(o.status) AS status
      FROM payouts p
      INNER JOIN orders o ON o.order_no = p.order_no
      WHERE p.released_date >= ${fromDate} AND p.released_date <= ${toDate}
        AND p.total_income > 0
        AND (
          o.status ILIKE '%retur%'
          OR o.status ILIKE '%return%'
          OR o.status ILIKE '%dikembalikan%'
        )
      GROUP BY p.order_no, p.total_income
      LIMIT 50
    `,
  ])

  const orderCnt = Number(ordersInPeriod[0]?.cnt ?? 0)
  const orderOmzet = Number(ordersInPeriod[0]?.omzet ?? 0)
  const paidDistinct = orderNoWithPayout.length
  const unpaidCount = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*)::bigint AS cnt FROM (
      SELECT o.order_no
      FROM orders o
      LEFT JOIN payouts p ON p.order_no = o.order_no
      WHERE o.trx_date >= ${fromDate} AND o.trx_date <= ${toDate}
        AND o.status NOT ILIKE '%batal%'
        AND o.status NOT ILIKE '%cancel%'
        AND o.status NOT ILIKE '%dibatalkan%'
        AND p.id IS NULL
      GROUP BY o.order_no
    ) t
  `

  return apiSuccess({
    period: { dateFrom, dateTo },
    summary: {
      ordersMasukPaket: orderCnt,
      omzetOps: orderOmzet,
      ordersSudahCair: paidDistinct,
      ordersBelumCair: Number(unpaidCount[0]?.cnt ?? 0),
      payoutsCair: payoutsInPeriod._count,
      pencairanTotal: payoutsInPeriod._sum.totalIncome ?? 0,
      payoutOmzet: payoutsInPeriod._sum.omzet ?? 0,
      orphanPayoutCount: orphanPayouts.length,
      negativePayoutCount: negativePayouts.length,
      returWithPositivePayout: returWithPayout.length,
    },
    unpaidOrders: unpaidOrders.map(r => ({
      orderNo: r.order_no,
      platform: r.platform,
      status: r.status,
      trxDate: r.trx_date,
      omzet: Number(r.omzet),
    })),
    orphanPayouts: orphanPayouts.map(r => ({
      orderNo: r.order_no,
      platform: r.platform,
      releasedDate: r.released_date,
      totalIncome: r.total_income,
    })),
    negativePayouts,
    returWithPositivePayout: returWithPayout.map(r => ({
      orderNo: r.order_no,
      totalIncome: r.total_income,
      status: r.status,
    })),
    notes: [
      'ordersBelumCair: order masuk di periode (trx_date) tanpa baris payout — normal jika belum settle.',
      'orphanPayouts: cair tapi CSV order belum diupload — upload order agar HPP L/R akurat.',
      'negativePayouts: settlement minus (fee retur/adjustment) — kurangi pencairan.',
      'returWithPositivePayout: cek status retur vs cash masih positif (partial retur / timing).',
      '1 orderNo = 1 payout (schema unique) — multi-batch settlement belum didukung.',
    ],
  })
}
