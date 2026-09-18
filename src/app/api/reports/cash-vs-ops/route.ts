import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, wibDateRange } from '@/lib/utils'
import { computeProfitLoss } from '@/lib/pnl-helpers'

/**
 * GET /api/reports/cash-vs-ops?dateFrom=&dateTo=
 * Side-by-side: omzet ops (order masuk) vs Laba Rugi kas (pencairan).
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

  const [ops, pl, ads] = await Promise.all([
    prisma.$queryRaw<{
      cnt: bigint
      qty: bigint
      omzet: bigint
      hpp: bigint
    }[]>`
      SELECT
        COUNT(DISTINCT order_no)::bigint AS cnt,
        COALESCE(SUM(qty), 0)::bigint AS qty,
        COALESCE(SUM(real_omzet), 0)::bigint AS omzet,
        COALESCE(SUM(hpp * qty), 0)::bigint AS hpp
      FROM orders
      WHERE trx_date >= ${fromDate} AND trx_date <= ${toDate}
        AND status NOT ILIKE '%batal%'
        AND status NOT ILIKE '%cancel%'
        AND status NOT ILIKE '%dibatalkan%'
    `,
    computeProfitLoss(fromDate, toDate),
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE w.is_ads_budget = true
        AND l.trx_type = 'EXPENSE'
        AND l.trx_date >= ${fromDate}
        AND l.trx_date <= ${toDate}
    `,
  ])

  const omzetOps = Number(ops[0]?.omzet ?? 0)
  const hppOps = Number(ops[0]?.hpp ?? 0)
  const gpOps = omzetOps - hppOps
  const iklan = Number(ads[0]?.total ?? 0)
  const iklanPctOps = omzetOps > 0 ? Math.round((iklan / omzetOps) * 1000) / 10 : 0

  return apiSuccess({
    period: { dateFrom, dateTo },
    ops: {
      label: 'Order masuk (trx_date · real_omzet estimasi)',
      paket: Number(ops[0]?.cnt ?? 0),
      qty: Number(ops[0]?.qty ?? 0),
      omzet: omzetOps,
      hpp: hppOps,
      grossProfit: gpOps,
      marginPct: omzetOps > 0 ? Math.round((gpOps / omzetOps) * 1000) / 10 : 0,
      iklan,
      iklanPctOmzet: iklanPctOps,
    },
    cash: {
      label: 'Laba Rugi kas (released_date · totalIncome)',
      pencairanBersih: pl.pencairanBersih,
      hpp: pl.hpp,
      labaKotor: pl.labaKotor,
      bebanOperasional: pl.bebanOperasional,
      iklan: pl.iklanTotal,
      iklanPctPencairan: pl.iklanPctPencairan,
      labaBersih: pl.labaBersih,
      totalOrdersPaid: pl.totalOrdersPaid,
    },
    gap: {
      omzetOpsMinusPencairan: omzetOps - pl.pencairanBersih,
      note: 'Gap normal: order belum cair, cair dari order bulan lalu, fee aktual vs estimasi, retur.',
    },
  })
}
