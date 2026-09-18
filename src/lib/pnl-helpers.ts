import { prisma } from './prisma'

const RETUR_REGEX = /retur|return|dikembalikan/i

/**
 * Porsi retur (0..1) per orderNo, proporsional terhadap realOmzet.
 * Satu orderNo bisa multi-SKU (banyak Order row), jadi retur dihitung
 * proporsional — bukan all-or-nothing — saat hanya sebagian SKU yang di-retur.
 */
export async function getReturnRatioByOrderNo(orderNos: string[]): Promise<Map<string, number>> {
  const ratios = new Map<string, number>()
  const uniqueOrderNos = [...new Set(orderNos)]
  if (uniqueOrderNos.length === 0) return ratios

  const rows = await prisma.order.findMany({
    where: { orderNo: { in: uniqueOrderNos } },
    select: { orderNo: true, realOmzet: true, status: true },
  })

  const agg = new Map<string, { total: number; returned: number }>()
  for (const o of rows) {
    const a = agg.get(o.orderNo) ?? { total: 0, returned: 0 }
    a.total += o.realOmzet ?? 0
    if (RETUR_REGEX.test(o.status ?? '')) a.returned += o.realOmzet ?? 0
    agg.set(o.orderNo, a)
  }

  for (const [orderNo, a] of agg) {
    ratios.set(orderNo, a.total > 0 ? Math.min(1, a.returned / a.total) : 0)
  }
  return ratios
}

export type ProfitLossResult = {
  pencairanBersih: number
  omzetKotor: number
  totalFee: number
  feePlatformDetail: {
    feeShopee: number
    feeTikTok: number
    feeAms: number
    feeLainnya: number
  }
  hpp: number
  labaKotor: number
  bebanOperasional: number
  expenseGroups: { group: string; amount: number }[]
  iklanTotal: number
  iklanPctPencairan: number
  labaBersihOperasional: number
  otherIncome: number
  labaBersih: number
  bebanKerugianTikTok: number
  totalOrdersPaid: number
  ordersFound: number
  totalBayarVendor: number
}

/**
 * Laba Rugi basis kas — PENJUALAN = payout dicairkan di periode (releasedDate).
 * HPP dari orderNos yang cair; baris status RETUR dikeluarkan (stok kembali).
 * Bayar Vendor bukan OPEX. Fee platform sudah net di totalIncome (info only).
 */
export async function computeProfitLoss(fromDate: Date, toDate: Date): Promise<ProfitLossResult> {
  const payoutsInPeriod = await prisma.payout.findMany({
    where: { releasedDate: { gte: fromDate, lte: toDate } },
    select: {
      orderNo: true,
      source: true,
      totalIncome: true,
      omzet: true,
      platformFee: true,
      amsFee: true,
      platformFeeOther: true,
      bebanOngkir: true,
    },
  })
  const returnRatioMap = await getReturnRatioByOrderNo(payoutsInPeriod.map(p => p.orderNo))

  let pencairanBersih = 0
  let omzetKotor = 0
  let feeShopee = 0
  let feeTikTok = 0
  let feeAms = 0
  let feeLainnya = 0
  let bebanKerugianTikTok = 0

  for (const p of payoutsInPeriod) {
    const keepRatio = 1 - (returnRatioMap.get(p.orderNo) ?? 0)
    pencairanBersih += (p.totalIncome ?? 0) * keepRatio
    omzetKotor += (p.omzet ?? 0) * keepRatio
    feeAms += (p.amsFee ?? 0) * keepRatio
    feeLainnya += (p.platformFeeOther ?? 0) * keepRatio
    if (p.source === 'shopee_income') {
      feeShopee += (p.platformFee ?? 0) * keepRatio
    } else {
      feeTikTok += (p.platformFee ?? 0) * keepRatio
      bebanKerugianTikTok += (p.bebanOngkir ?? 0) * keepRatio
    }
  }
  pencairanBersih = Math.round(pencairanBersih)
  omzetKotor = Math.round(omzetKotor)
  feeShopee = Math.round(feeShopee)
  feeTikTok = Math.round(feeTikTok)
  feeAms = Math.round(feeAms)
  feeLainnya = Math.round(feeLainnya)
  bebanKerugianTikTok = Math.round(bebanKerugianTikTok)
  const totalFee = feeShopee + feeTikTok + feeAms + feeLainnya

  const paidOrderNos = payoutsInPeriod.map(p => p.orderNo)

  const paidOrders = await prisma.order.findMany({
    where: {
      sku: { not: null },
      orderNo: { in: paidOrderNos },
      NOT: [
        { status: { contains: 'retur', mode: 'insensitive' } },
        { status: { contains: 'return', mode: 'insensitive' } },
        { status: { contains: 'dikembalikan', mode: 'insensitive' } },
      ],
    },
    select: { sku: true, qty: true, hpp: true },
  })

  const payoutCount = await prisma.payout.count({
    where: { releasedDate: { gte: fromDate, lte: toDate }, omzet: { gt: 0 } },
  })

  let hpp = 0
  const ordersFound = paidOrders.length
  for (const order of paidOrders) {
    hpp += (order.hpp ?? 0) * (order.qty ?? 1)
  }

  const labaKotor = pencairanBersih - hpp

  const expenses = await prisma.walletLedger.groupBy({
    by: ['category'],
    where: {
      trxType: 'EXPENSE',
      trxDate: { gte: fromDate, lte: toDate },
      NOT: { category: { startsWith: 'Bayar Vendor' } },
    },
    _sum: { amount: true },
  })

  let bebanOperasional = 0
  const expenseGroups: { group: string; amount: number }[] = expenses.map(e => {
    const amt = Math.abs(e._sum.amount || 0)
    bebanOperasional += amt
    return { group: e.category || 'Lain-lain', amount: amt }
  })

  // Iklan = EXPENSE dari wallet is_ads_budget (sama sumber dashboard ROAS)
  // Top-up TRANSFER ke wallet iklan BUKAN beban — hanya spending EXPENSE yang dihitung
  const adsSpendAgg = await prisma.$queryRaw<{ total: bigint }[]>`
    SELECT COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
    FROM wallet_ledger l
    JOIN wallets w ON w.id = l.wallet_id
    WHERE w.is_ads_budget = true
      AND l.trx_type = 'EXPENSE'
      AND l.trx_date >= ${fromDate}
      AND l.trx_date <= ${toDate}
  `
  const iklanTotal = Number(adsSpendAgg[0]?.total ?? 0)

  const vendorPayAgg = await prisma.walletLedger.aggregate({
    where: {
      trxDate: { gte: fromDate, lte: toDate },
      OR: [
        { trxType: 'VENDOR_PAYMENT' },
        { trxType: 'EXPENSE', category: { startsWith: 'Bayar Vendor' } },
      ],
    },
    _sum: { amount: true },
  })
  const totalBayarVendor = Math.abs(vendorPayAgg._sum.amount ?? 0)

  const asets = await prisma.asetTetap.findMany({ where: { isActive: true } })
  const msPerMonth = 1000 * 60 * 60 * 24 * 30.4375
  let totalBebanPenyusutan = 0

  for (const aset of asets) {
    const penyusutanPerBulan = aset.nilaiPerolehan / (aset.umurEkonomisThn * 12)
    const asetStart = aset.tanggalBeli > fromDate ? aset.tanggalBeli : fromDate
    if (asetStart > toDate) continue
    const bulanSampaiFullyDep = aset.umurEkonomisThn * 12
    const bulanSejakBeli = (fromDate.getTime() - aset.tanggalBeli.getTime()) / msPerMonth
    if (bulanSejakBeli >= bulanSampaiFullyDep) continue
    const bulanDalamRange = Math.max(0, (toDate.getTime() - asetStart.getTime()) / msPerMonth)
    const bulanEfektif = Math.min(bulanDalamRange, bulanSampaiFullyDep - Math.max(0, bulanSejakBeli))
    totalBebanPenyusutan += Math.round(penyusutanPerBulan * bulanEfektif)
  }

  if (totalBebanPenyusutan > 0) {
    bebanOperasional += totalBebanPenyusutan
    expenseGroups.push({ group: 'Penyusutan Aset Tetap', amount: totalBebanPenyusutan })
  }

  const otherIncomes = await prisma.walletLedger.aggregate({
    where: { trxType: 'OTHER_INCOME', trxDate: { gte: fromDate, lte: toDate } },
    _sum: { amount: true },
  })
  const otherIncome = otherIncomes._sum.amount || 0

  const labaBersihOperasional = labaKotor - bebanOperasional
  const labaBersih = labaBersihOperasional + otherIncome
  const iklanPctPencairan = pencairanBersih > 0
    ? Math.round((iklanTotal / pencairanBersih) * 1000) / 10
    : 0

  return {
    pencairanBersih,
    omzetKotor,
    totalFee,
    feePlatformDetail: { feeShopee, feeTikTok, feeAms, feeLainnya },
    hpp,
    labaKotor,
    bebanOperasional,
    expenseGroups,
    iklanTotal,
    iklanPctPencairan,
    labaBersihOperasional,
    otherIncome,
    labaBersih,
    bebanKerugianTikTok,
    totalOrdersPaid: payoutCount,
    ordersFound,
    totalBayarVendor,
  }
}
