import { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { apiError, wibDateRange } from '@/lib/utils'
import { computeProfitLoss } from '@/lib/pnl-helpers'

/**
 * GET /api/reports/pl/export?dateFrom=&dateTo=
 * Export Laba Rugi (CSV) — formula sama computeProfitLoss.
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
  const pl = await computeProfitLoss(fromDate, toDate)

  const rows: string[][] = [
    ['Laporan Laba Rugi — basis pencairan (cash)'],
    ['Periode', `${dateFrom} s/d ${dateTo}`],
    ['Zona waktu', 'Asia/Jakarta (WIB)'],
    [],
    ['Pos', 'Jumlah (Rp)'],
    ['Pencairan Bersih', String(pl.pencairanBersih)],
    ['Omzet Kotor (info)', String(pl.omzetKotor)],
    ['Total Fee Platform (info, sudah net)', String(pl.totalFee)],
    ['  Fee Shopee', String(pl.feePlatformDetail.feeShopee)],
    ['  Fee TikTok', String(pl.feePlatformDetail.feeTikTok)],
    ['  Fee AMS', String(pl.feePlatformDetail.feeAms)],
    ['  Fee Lainnya', String(pl.feePlatformDetail.feeLainnya)],
    ['HPP (order cair, non-retur)', String(pl.hpp)],
    ['Laba Kotor', String(pl.labaKotor)],
    ['Beban Operasional', String(pl.bebanOperasional)],
    ['  Iklan (bagian OPEX)', String(pl.iklanTotal)],
    ['  Iklan % thd pencairan', String(pl.iklanPctPencairan)],
    ...pl.expenseGroups.map(g => [`  - ${g.group}`, String(g.amount)]),
    ['Laba Bersih Operasional', String(pl.labaBersihOperasional)],
    ['Pendapatan Lain', String(pl.otherIncome)],
    ['LABA BERSIH', String(pl.labaBersih)],
    [],
    ['Info: Bayar Vendor (bukan OPEX)', String(pl.totalBayarVendor)],
    ['Info: Order cair (omzet>0)', String(pl.totalOrdersPaid)],
    ['Info: Baris order HPP', String(pl.ordersFound)],
    [],
    ['Catatan'],
    ['PENJUALAN = order dicairkan di periode (payouts.released_date)'],
    ['HPP exclude status retur/return/dikembalikan'],
    ['Fee platform & AMS sudah ter-net di pencairan — jangan double-count'],
    ['Iklan = EXPENSE wallet is_ads_budget (bukan top-up TRANSFER)'],
  ]

  const csv = rows
    .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const filename = `laba-rugi_${dateFrom}_${dateTo}.csv`
  return new Response('\uFEFF' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
