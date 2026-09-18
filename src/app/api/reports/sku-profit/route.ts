import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, wibDateRange } from '@/lib/utils'
import { getReturnRatioByOrderNo } from '@/lib/pnl-helpers'

/**
 * GET /api/reports/sku-profit?dateFrom=&dateTo=&limit=20
 * Margin per SKU untuk order yang CAIR di periode (fee aktual via payout).
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  const limit = Math.min(Math.max(Number(searchParams.get('limit') || 20), 5), 100)
  if (!dateFrom || !dateTo) return apiError('dateFrom dan dateTo wajib')

  const { fromDate, toDate } = wibDateRange(dateFrom, dateTo)

  const payouts = await prisma.payout.findMany({
    where: { releasedDate: { gte: fromDate, lte: toDate }, totalIncome: { gt: 0 } },
    select: { orderNo: true, totalIncome: true, omzet: true },
  })
  if (payouts.length === 0) {
    return apiSuccess({ items: [], top: [], bottom: [], period: { dateFrom, dateTo } })
  }

  const returnMap = await getReturnRatioByOrderNo(payouts.map(p => p.orderNo))
  const payoutByOrder = new Map(payouts.map(p => [p.orderNo, p]))

  const orders = await prisma.order.findMany({
    where: {
      orderNo: { in: payouts.map(p => p.orderNo) },
      sku: { not: null },
      NOT: [
        { status: { contains: 'retur', mode: 'insensitive' } },
        { status: { contains: 'return', mode: 'insensitive' } },
        { status: { contains: 'dikembalikan', mode: 'insensitive' } },
      ],
    },
    select: { orderNo: true, sku: true, productName: true, qty: true, hpp: true, realOmzet: true },
  })

  // Alokasi net pencairan proporsional realOmzet per baris dalam orderNo
  const omzetShare = new Map<string, number>()
  for (const o of orders) {
    omzetShare.set(o.orderNo, (omzetShare.get(o.orderNo) ?? 0) + (o.realOmzet ?? 0))
  }

  type Agg = { sku: string; productName: string; qty: number; revenue: number; hpp: number }
  const bySku = new Map<string, Agg>()

  for (const o of orders) {
    const p = payoutByOrder.get(o.orderNo)
    if (!p) continue
    const keep = 1 - (returnMap.get(o.orderNo) ?? 0)
    const totalOmzet = omzetShare.get(o.orderNo) || 0
    const share = totalOmzet > 0 ? (o.realOmzet ?? 0) / totalOmzet : 0
    const revenue = (p.totalIncome ?? 0) * keep * share
    const hpp = (o.hpp ?? 0) * (o.qty ?? 1)
    const key = o.sku || '-'
    const a = bySku.get(key) ?? { sku: key, productName: o.productName || key, qty: 0, revenue: 0, hpp: 0 }
    a.qty += o.qty ?? 1
    a.revenue += revenue
    a.hpp += hpp
    if (o.productName) a.productName = o.productName
    bySku.set(key, a)
  }

  const items = [...bySku.values()]
    .map(a => ({
      ...a,
      revenue: Math.round(a.revenue),
      margin: Math.round(a.revenue - a.hpp),
      marginPct: a.revenue > 0 ? Math.round(((a.revenue - a.hpp) / a.revenue) * 1000) / 10 : 0,
    }))
    .filter(a => a.qty > 0)

  const byMargin = [...items].sort((a, b) => b.margin - a.margin)
  const top = byMargin.slice(0, limit)
  const bottom = [...byMargin].reverse().slice(0, Math.min(10, limit))

  return apiSuccess({
    period: { dateFrom, dateTo },
    basis: 'Payout released_date · revenue = alokasi totalIncome (net retur) proporsional realOmzet',
    top,
    bottom,
    itemCount: items.length,
  })
}
