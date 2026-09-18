import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'
import { parseOrderDate, sameCalendarDay } from '@/lib/order-date'

/**
 * POST /api/orders/restore-trx-date
 * Restore orders.trx_date dari order_created_at (string CSV).
 * Body: { dryRun?: boolean, limit?: number }
 * OWNER only.
 *
 * Kasus: trx_date sempat ditimpa released_date payout (bug lama).
 * Target: trx_date = tanggal order masuk untuk ops/Telegram.
 */
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden — hanya OWNER', 403)

  const body = await request.json().catch(() => ({}))
  const dryRun = body?.dryRun !== false // default dry-run aman
  const limit = Math.min(Math.max(Number(body?.limit) || 5000, 1), 50000)

  const orders = await prisma.order.findMany({
    where: { orderCreatedAt: { not: null } },
    select: { id: true, orderNo: true, orderCreatedAt: true, trxDate: true },
    take: limit,
  })

  type Row = {
    id: string
    orderNo: string
    orderCreatedAt: string
    oldTrxDate: string | null
    newTrxDate: string
  }

  const toUpdate: Row[] = []
  let unparsable = 0
  let alreadyOk = 0
  let noSource = 0

  for (const o of orders) {
    if (!o.orderCreatedAt) {
      noSource++
      continue
    }
    const parsed = parseOrderDate(o.orderCreatedAt)
    if (!parsed) {
      unparsable++
      continue
    }
    if (o.trxDate && sameCalendarDay(o.trxDate, parsed)) {
      alreadyOk++
      continue
    }
    toUpdate.push({
      id: o.id,
      orderNo: o.orderNo,
      orderCreatedAt: o.orderCreatedAt,
      oldTrxDate: o.trxDate?.toISOString() ?? null,
      newTrxDate: parsed.toISOString(),
    })
  }

  if (dryRun) {
    return apiSuccess({
      dryRun: true,
      scanned: orders.length,
      willUpdate: toUpdate.length,
      alreadyOk,
      unparsable,
      noSource,
      sample: toUpdate.slice(0, 15),
      message: `${toUpdate.length} baris akan di-restore. Kirim { dryRun: false } untuk eksekusi.`,
    })
  }

  let updated = 0
  const CHUNK = 50
  for (let i = 0; i < toUpdate.length; i += CHUNK) {
    const chunk = toUpdate.slice(i, i + CHUNK)
    await Promise.all(
      chunk.map(r =>
        prisma.order.update({
          where: { id: r.id },
          data: { trxDate: new Date(r.newTrxDate) },
        }),
      ),
    )
    updated += chunk.length
  }

  return apiSuccess({
    dryRun: false,
    scanned: orders.length,
    updated,
    alreadyOk,
    unparsable,
    noSource,
    message: `${updated} baris order trx_date di-restore dari order_created_at`,
  })
}

export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden — hanya OWNER', 403)

  const [total, withCreated, withTrx, sampleMismatch] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({ where: { orderCreatedAt: { not: null } } }),
    prisma.order.count({ where: { trxDate: { not: null } } }),
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM orders o
      LEFT JOIN payouts p ON p.order_no = o.order_no
      WHERE o.trx_date IS NOT NULL
        AND p.released_date IS NOT NULL
        AND DATE(o.trx_date AT TIME ZONE 'Asia/Jakarta')
          = DATE(p.released_date AT TIME ZONE 'Asia/Jakarta')
        AND o.order_created_at IS NOT NULL
        AND o.order_created_at NOT LIKE TO_CHAR(p.released_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') || '%'
    `.catch(() => [{ cnt: BigInt(0) }]),
  ])

  return apiSuccess({
    totalOrders: total,
    withOrderCreatedAt: withCreated,
    withTrxDate: withTrx,
    possibleOverwriteHint: Number(sampleMismatch[0]?.cnt ?? 0),
    note: 'POST dengan dryRun:true untuk audit detail. possibleOverwriteHint = trx_date cocok released_date tapi beda dari prefix order_created_at.',
  })
}
