import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, wibDateRange, todayWIBStr, wibMonthEndStr } from '@/lib/utils'
import { computeProfitLoss } from '@/lib/pnl-helpers'

/**
 * GET /api/closing/checklist?month=YYYY-MM
 * Checklist closing bulanan (default: bulan lalu WIB).
 */
export async function GET(request: Request) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const url = new URL(request.url)
  let month = url.searchParams.get('month')
  if (!month) {
    const now = todayWIBStr()
    const [y, m] = now.split('-').map(Number)
    const lm = m === 1 ? 12 : m - 1
    const ly = m === 1 ? y - 1 : y
    month = `${ly}-${String(lm).padStart(2, '0')}`
  }

  const dateFrom = `${month}-01`
  const dateTo = wibMonthEndStr(dateFrom)
  const { fromDate, toDate } = wibDateRange(dateFrom, dateTo)

  const [orderCnt, payoutCnt, hppZero, unpaid, orphan, pl, lastAds, adsWallets] = await Promise.all([
    prisma.order.count({
      where: {
        trxDate: { gte: fromDate, lte: toDate },
      },
    }),
    prisma.payout.count({
      where: { releasedDate: { gte: fromDate, lte: toDate } },
    }),
    prisma.order.count({
      where: {
        trxDate: { gte: fromDate, lte: toDate },
        hpp: 0,
        sku: { not: null },
        NOT: [
          { status: { contains: 'batal', mode: 'insensitive' } },
          { status: { contains: 'cancel', mode: 'insensitive' } },
        ],
      },
    }),
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt FROM (
        SELECT o.order_no FROM orders o
        LEFT JOIN payouts p ON p.order_no = o.order_no
        WHERE o.trx_date >= ${fromDate} AND o.trx_date <= ${toDate}
          AND p.id IS NULL
        GROUP BY o.order_no
      ) t
    `,
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM payouts p
      LEFT JOIN orders o ON o.order_no = p.order_no
      WHERE p.released_date >= ${fromDate} AND p.released_date <= ${toDate}
        AND o.id IS NULL
    `,
    computeProfitLoss(fromDate, toDate),
    prisma.$queryRaw<{ cnt: bigint }[]>`
      SELECT COUNT(*)::bigint AS cnt
      FROM wallet_ledger l
      JOIN wallets w ON w.id = l.wallet_id
      WHERE w.is_ads_budget = true AND l.trx_type = 'EXPENSE'
        AND l.trx_date >= ${fromDate} AND l.trx_date <= ${toDate}
    `,
    prisma.wallet.count({ where: { isAdsBudget: true, isActive: true } }),
  ])

  const items = [
    {
      id: 'orders',
      title: 'CSV order diupload untuk periode',
      ok: orderCnt > 0,
      detail: `${orderCnt} baris order (trx_date di bulan)`,
    },
    {
      id: 'payouts',
      title: 'File settlement/payout diimport',
      ok: payoutCnt > 0,
      detail: `${payoutCnt} payout (released_date di bulan)`,
    },
    {
      id: 'hpp',
      title: 'HPP terisi (jalankan Isi HPP Kosong jika perlu)',
      ok: hppZero === 0 || (orderCnt > 0 && hppZero / orderCnt < 0.05),
      detail: `${hppZero} baris order hpp=0`,
      warn: hppZero > 0,
    },
    {
      id: 'orphan',
      title: 'Tidak ada payout yatim (order belum ada)',
      ok: Number(orphan[0]?.cnt ?? 0) === 0,
      detail: `${Number(orphan[0]?.cnt ?? 0)} payout tanpa order`,
    },
    {
      id: 'unpaid_info',
      title: 'Order belum cair (info — normal jika masih proses)',
      ok: true,
      detail: `${Number(unpaid[0]?.cnt ?? 0)} orderNo belum punya payout`,
      info: true,
    },
    {
      id: 'ads_wallet',
      title: 'Wallet iklan dikonfigurasi',
      ok: adsWallets > 0,
      detail: `${adsWallets} wallet Ads aktif`,
    },
    {
      id: 'ads_spend',
      title: 'Spending iklan tercatat di bulan',
      ok: Number(lastAds[0]?.cnt ?? 0) > 0 || adsWallets === 0,
      detail: `${Number(lastAds[0]?.cnt ?? 0)} entry EXPENSE ads`,
      warn: adsWallets > 0 && Number(lastAds[0]?.cnt ?? 0) === 0,
    },
    {
      id: 'pl_preview',
      title: 'Preview Laba Rugi tersedia',
      ok: true,
      detail: `Pencairan ${pl.pencairanBersih.toLocaleString('id-ID')} · Laba bersih ${pl.labaBersih.toLocaleString('id-ID')}`,
    },
  ]

  const blocking = items.filter(i => !i.ok && !i.info).length

  return apiSuccess({
    month,
    dateFrom,
    dateTo,
    items,
    blocking,
    ready: blocking === 0,
    plSummary: {
      pencairanBersih: pl.pencairanBersih,
      labaBersih: pl.labaBersih,
      iklanTotal: pl.iklanTotal,
      iklanPctPencairan: pl.iklanPctPencairan,
    },
  })
}
