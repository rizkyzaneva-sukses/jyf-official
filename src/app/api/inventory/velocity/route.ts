import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, calculateSOH } from '@/lib/utils'

/**
 * GET /api/inventory/velocity?days=30
 * Velocity jual (qty/hari) + saran restock/PO berdasarkan ROP & lead time.
 */
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const days = Math.min(Math.max(Number(request.nextUrl.searchParams.get('days') || 30), 7), 90)
  const since = new Date()
  since.setDate(since.getDate() - days)

  const [products, sales, ledger] = await Promise.all([
    prisma.masterProduct.findMany({
      where: { isActive: true },
      select: {
        sku: true,
        productName: true,
        hpp: true,
        rop: true,
        leadTimeDays: true,
        stokAwal: true,
        lastOpnameDate: true,
      },
    }),
    prisma.$queryRaw<{ sku: string; qty: bigint }[]>`
      SELECT sku, COALESCE(SUM(qty), 0)::bigint AS qty
      FROM orders
      WHERE trx_date >= ${since}
        AND sku IS NOT NULL
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
        AND status NOT ILIKE '%retur%'
        AND status NOT ILIKE '%return%'
      GROUP BY sku
    `,
    prisma.inventoryLedger.findMany({
      select: { sku: true, direction: true, qty: true, trxDate: true },
    }),
  ])

  const salesMap = new Map(sales.map(s => [s.sku, Number(s.qty)]))
  const ledgerBySku = new Map<string, typeof ledger>()
  for (const e of ledger) {
    const list = ledgerBySku.get(e.sku) ?? []
    list.push(e)
    ledgerBySku.set(e.sku, list)
  }

  const items = products.map(p => {
    const sold = salesMap.get(p.sku) ?? 0
    const velocity = sold / days
    const entries = ledgerBySku.get(p.sku) ?? []
    const soh = calculateSOH(
      p.stokAwal,
      p.lastOpnameDate,
      entries.map(e => ({
        sku: e.sku,
        direction: e.direction as 'IN' | 'OUT',
        qty: e.qty,
        trxDate: e.trxDate,
      })),
    )
    const lead = p.leadTimeDays || 7
    const coverDays = velocity > 0 ? soh / velocity : 999
    // Target stok = ROP + velocity * lead time (buffer sederhana)
    const targetQty = Math.ceil(p.rop + velocity * lead)
    const suggestOrderQty = Math.max(0, targetQty - soh)
    const urgent = soh <= p.rop || (velocity > 0 && coverDays < lead)

    return {
      sku: p.sku,
      productName: p.productName,
      soh,
      rop: p.rop,
      leadTimeDays: lead,
      soldDays: days,
      soldQty: sold,
      velocityPerDay: Math.round(velocity * 100) / 100,
      coverDays: Math.round(coverDays * 10) / 10,
      suggestOrderQty,
      urgent,
      hpp: p.hpp,
    }
  })

  const needRestock = items
    .filter(i => i.suggestOrderQty > 0 || i.urgent)
    .sort((a, b) => b.suggestOrderQty - a.suggestOrderQty || a.coverDays - b.coverDays)
    .slice(0, 40)

  return apiSuccess({
    days,
    needRestock,
    totalSkus: items.length,
    urgentCount: items.filter(i => i.urgent).length,
  })
}
