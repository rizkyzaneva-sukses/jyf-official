import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// Seragamkan spasi di sekitar "-" dan spasi ganda, supaya "Khalid Brown- L" == "Khalid Brown - L"
function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s*-\s*/g, ' - ')
    .replace(/\s+/g, ' ')
}

// POST /api/orders/backfill-hpp
// Update Order.hpp dari MasterProduct.hpp
// Prioritas lookup: (1) internal SKU langsung, (2) via SkuMapping, (3) via productName, (4) versi ternormalisasi dari (1)/(3)
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const [products, skuMappings] = await Promise.all([
    prisma.masterProduct.findMany({
      where: { hpp: { gt: 0 } },
      select: { sku: true, productName: true, hpp: true },
    }),
    prisma.skuMapping.findMany({
      where: { isActive: true },
      select: { fromSku: true, toSku: true },
    }),
  ])
  if (!products.length) return apiError('Tidak ada produk dengan HPP > 0 di master produk')

  // Map: internal SKU → hpp
  const byInternalSku = new Map(products.map(p => [p.sku.toLowerCase(), p.hpp]))
  // Map: productName → hpp
  const byProductName = new Map(products.map(p => [p.productName.toLowerCase(), p.hpp]))
  // Map versi ternormalisasi (toleran beda spasi/format kecil)
  const byInternalSkuNorm = new Map(products.map(p => [normalizeKey(p.sku), p.hpp]))
  const byProductNameNorm = new Map(products.map(p => [normalizeKey(p.productName), p.hpp]))
  // Map: marketplace fromSku → hpp (via SkuMapping + split multi-SKU)
  const byMarketplaceSku = new Map<string, number>()
  for (const m of skuMappings) {
    const toSkus = m.toSku.split('+').map(s => s.trim().toLowerCase())
    // Cari hpp dari SKU pertama yang valid (proxy untuk combined product)
    const hpp = toSkus.reduce((sum, s) => sum + (byInternalSku.get(s) ?? 0), 0)
    if (hpp > 0) byMarketplaceSku.set(m.fromSku.toLowerCase(), hpp)
  }

  // Ambil semua order yang hpp-nya 0
  const zeroOrders = await prisma.order.findMany({
    where: { hpp: 0, sku: { not: null } },
    select: { id: true, sku: true },
  })

  let updated = 0
  const unmatchedCounts = new Map<string, number>()
  for (const order of zeroOrders) {
    const key = (order.sku ?? '').toLowerCase()
    const normKey = normalizeKey(order.sku ?? '')
    const hpp = byInternalSku.get(key)
      ?? byMarketplaceSku.get(key)
      ?? byProductName.get(key)
      ?? byInternalSkuNorm.get(normKey)
      ?? byProductNameNorm.get(normKey)
      ?? 0
    if (hpp > 0) {
      await prisma.order.update({ where: { id: order.id }, data: { hpp } })
      updated++
    } else if (order.sku) {
      unmatchedCounts.set(order.sku, (unmatchedCounts.get(order.sku) ?? 0) + 1)
    }
  }

  // SKU yang paling sering muncul tapi tidak ketemu — paling layak dimapping duluan
  const unmatched = [...unmatchedCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([sku, count]) => ({ sku, count }))

  const message = updated > 0
    ? `${updated} order berhasil diperbarui HPP-nya`
    : unmatched.length > 0
      ? `Tidak ada yang cocok otomatis. ${unmatched.length} SKU/nama produk butuh mapping manual di Produk Gabungan.`
      : 'Semua order sudah memiliki HPP'

  return apiSuccess({ updated, unmatched, message })
}
