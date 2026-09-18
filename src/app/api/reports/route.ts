import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, wibDateRange } from '@/lib/utils'
import { getReturnRatioByOrderNo } from '@/lib/pnl-helpers'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const type = searchParams.get('type') || 'summary'
  let fromDate: Date | null = null
  let toDate: Date | null = null
  if (dateFrom && dateTo) {
    const r = wibDateRange(dateFrom, dateTo)
    fromDate = r.fromDate
    toDate = r.toDate
  }

  if (type === 'summary') {
    // Payout individual (bukan aggregate) — perlu detail per orderNo agar porsi
    // order yang RETUR bisa dikeluarkan dari Pencairan (proporsional, karena
    // satu orderNo bisa multi-SKU dan hanya sebagian yang di-retur).
    const payoutRows = await prisma.payout.findMany({
      where: fromDate && toDate
        ? { releasedDate: { gte: fromDate, lte: toDate } }
        : {},
      select: { orderNo: true, totalIncome: true, omzet: true, platformFee: true, amsFee: true },
    })
    const returnRatioMap = await getReturnRatioByOrderNo(payoutRows.map(p => p.orderNo))

    let payoutTotalIncome = 0
    let payoutOmzet       = 0
    let payoutPlatformFee = 0
    let payoutAmsFee      = 0
    for (const p of payoutRows) {
      const keepRatio = 1 - (returnRatioMap.get(p.orderNo) ?? 0)
      payoutTotalIncome += (p.totalIncome ?? 0) * keepRatio
      payoutOmzet       += (p.omzet ?? 0) * keepRatio
      payoutPlatformFee += p.platformFee ?? 0
      payoutAmsFee      += p.amsFee ?? 0
    }
    payoutTotalIncome = Math.round(payoutTotalIncome)
    payoutOmzet       = Math.round(payoutOmzet)

    // Join manual berdasarkan orderNo (bukan relasi payout.orderId): satu order
    // bisa multi-SKU per orderNo, sedangkan Payout.orderId hanya ke-assign ke
    // satu row saja saat import, jadi filter via relasi melewatkan sebagian row.
    const paidOrderNoFilter = fromDate && toDate
      ? { orderNo: { in: payoutRows.map(p => p.orderNo) } }
      : {}

    const [paidOrders, expenseData] = await Promise.all([
      prisma.order.findMany({
        where: {
          ...paidOrderNoFilter,
          NOT: [
            { status: { contains: 'batal' } },
            { status: { contains: 'Cancel' } },
            { status: { contains: 'Dibatalkan' } },
            { status: { contains: 'retur', mode: 'insensitive' } },
            { status: { contains: 'return', mode: 'insensitive' } },
            { status: { contains: 'dikembalikan', mode: 'insensitive' } },
          ],
        },
        select: {
          platform: true,
          sku: true,
          qty: true,
          hpp: true,
          realOmzet: true,
        },
      }),

      // Expense dari wallet ledger
      prisma.walletLedger.aggregate({
        where: {
          trxType: 'EXPENSE',
          ...(fromDate && toDate && {
            trxDate: { gte: fromDate, lte: toDate }
          }),
        },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ])

    const platformMap = new Map<string, { omzet: number; hpp: number; qty: number; orders: number }>()
    const skuMap = new Map<string, { omzet: number; qty: number }>()

    for (const order of paidOrders) {
      const platformKey = order.platform || 'Unknown'
      const qty = order.qty ?? 0
      const orderHpp = (order.hpp ?? 0) * qty

      const platformAgg = platformMap.get(platformKey) ?? { omzet: 0, hpp: 0, qty: 0, orders: 0 }
      platformAgg.omzet += order.realOmzet ?? 0
      platformAgg.hpp += orderHpp
      platformAgg.qty += qty
      platformAgg.orders += 1
      platformMap.set(platformKey, platformAgg)

      if (order.sku) {
        const skuAgg = skuMap.get(order.sku) ?? { omzet: 0, qty: 0 }
        skuAgg.omzet += order.realOmzet ?? 0
        skuAgg.qty += qty
        skuMap.set(order.sku, skuAgg)
      }
    }

    const omzetData = Array.from(platformMap.entries())
      .map(([platform, value]) => ({ platform, ...value }))
      .sort((a, b) => b.omzet - a.omzet)

    const topSkus = Array.from(skuMap.entries())
      .map(([sku, value]) => ({ sku, ...value }))
      .sort((a, b) => b.omzet - a.omzet)
      .slice(0, 10)

    const totalOmzet = omzetData.reduce((sum, item) => sum + item.omzet, 0)
    const totalHpp = omzetData.reduce((sum, item) => sum + item.hpp, 0)
    const totalExpense = Math.abs(expenseData._sum.amount ?? 0)

    return apiSuccess({
      omzet: {
        total: totalOmzet,
        byPlatform: omzetData.map(p => ({
          platform: p.platform,
          omzet: p.omzet,
          hpp: p.hpp,
          qty: p.qty,
          orders: p.orders,
          grossProfit: p.omzet - p.hpp,
          margin: p.omzet
            ? (((p.omzet - p.hpp) / p.omzet) * 100).toFixed(1)
            : '0',
        })),
      },
      grossProfit: totalOmzet - totalHpp,
      grossMargin: totalOmzet > 0
        ? (((totalOmzet - totalHpp) / totalOmzet) * 100).toFixed(1)
        : '0',
      payout: {
        count: payoutRows.length,
        totalIncome: payoutTotalIncome,
        platformFee: payoutPlatformFee,
        amsFee: payoutAmsFee,
      },
      expense: {
        total: totalExpense,
        count: expenseData._count.id,
      },
      netCashflow: payoutTotalIncome - totalExpense,
      topSkus: topSkus.map(s => ({
        sku: s.sku,
        omzet: s.omzet,
        qty: s.qty,
      })),
    })
  }

  // Monthly breakdown
  if (type === 'monthly') {
    const monthly = await prisma.$queryRaw<any[]>`
      SELECT
        TO_CHAR(trx_date, 'YYYY-MM') AS month,
        platform,
        COUNT(*) AS order_count,
        SUM(real_omzet) AS omzet,
        SUM(hpp * qty) AS hpp
      FROM orders
      WHERE trx_date IS NOT NULL
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
        ${fromDate ? prisma.$queryRaw`AND trx_date >= ${fromDate}` : prisma.$queryRaw``}
        ${toDate ? prisma.$queryRaw`AND trx_date <= ${toDate}` : prisma.$queryRaw``}
      GROUP BY month, platform
      ORDER BY month DESC, platform
    `
    return apiSuccess({ monthly: monthly.map(m => ({ ...m, orderCount: Number(m.order_count), omzet: Number(m.omzet), hpp: Number(m.hpp) })) })
  }

  return apiError('Report type tidak dikenali')
}
