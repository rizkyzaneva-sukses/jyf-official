import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, generateGRNumber, getPagination, parseWibDateInput } from '@/lib/utils'

// GET /api/procurement/receive — list goods receipts
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = new URL(request.url)
  const { page, limit, skip, take } = getPagination({
    page: Number(searchParams.get('page')) || 1,
    limit: Number(searchParams.get('limit')) || 20,
  })
  const vendorId = searchParams.get('vendorId') || undefined
  const search = searchParams.get('search') || undefined

  const where: any = {}
  if (vendorId) where.vendorId = vendorId
  if (search) {
    where.OR = [
      { receiptNumber: { contains: search, mode: 'insensitive' } },
      { poNumber: { contains: search, mode: 'insensitive' } },
      { vendorName: { contains: search, mode: 'insensitive' } },
      { suratJalanNumber: { contains: search, mode: 'insensitive' } },
    ]
  }

  const [rows, total] = await Promise.all([
    prisma.goodsReceipt.findMany({
      where,
      include: { items: true },
      orderBy: { receiptDate: 'desc' },
      skip,
      take,
    }),
    prisma.goodsReceipt.count({ where }),
  ])

  return apiSuccess({ rows, total, page, limit })
}

// POST /api/procurement/receive — goods receipt (document only)
// Stok masuk & PO update dilakukan via Scan Masuk Barang.
// Endpoint ini hanya membuat catatan dokumen (Goods Receipt) untuk audit trail.
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { vendorId, receiptDate, suratJalanNumber, items, note } = body

  if (!vendorId || !items?.length) return apiError('Vendor dan items wajib diisi')

  const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } })
  if (!vendor) return apiError('Vendor tidak ditemukan')

  const poIds: string[] = []
  const poIdSet = new Set<string>()
  for (const i of items) { if (i.poId) poIdSet.add(i.poId) }
  for (const id of poIdSet) poIds.push(id)

  const pos = poIds.length > 0
    ? await prisma.purchaseOrder.findMany({ where: { id: { in: poIds } } })
    : []

  for (const poId of poIds) {
    const po = pos.find(p => p.id === poId)
    if (!po) return apiError(`PO ${poId} tidak ditemukan`)
    if (po.vendorId !== vendorId) return apiError(`PO ${po.poNumber} bukan milik vendor ini`)
    if (po.status === 'CLOSED') return apiError(`PO ${po.poNumber} sudah ditutup, tidak bisa menerima kiriman baru`)
  }

  const date = receiptDate ? parseWibDateInput(receiptDate) : new Date()
  const existingGRNumbers = (await prisma.goodsReceipt.findMany({
    select: { receiptNumber: true },
  })).map(r => r.receiptNumber)
  const receiptNumber = generateGRNumber(date, existingGRNumbers)

  const receipt = await prisma.goodsReceipt.create({
    data: {
      receiptNumber,
      poId: poIds.length === 1 ? poIds[0] : null,
      poNumber: poIds.length === 1 ? pos[0]?.poNumber ?? null : null,
      vendorId,
      vendorName: vendor.namaVendor,
      receiptDate: date,
      suratJalanNumber: suratJalanNumber || null,
      itemsJson: items,
      note: note || null,
      createdBy: session.username,
    },
  })

  for (const item of items) {
    await prisma.goodsReceiptItem.create({
      data: {
        receiptId: receipt.id,
        poId: item.poId || null,
        poItemId: item.poItemId || null,
        sku: item.sku,
        productName: item.productName,
        qtyReceived: item.qtyReceived,
        unitPrice: item.unitPrice || 0,
        note: item.note || null,
      },
    })
  }

  await prisma.auditLog.create({
    data: {
      entityType: 'GoodsReceipt',
      action: 'CREATE',
      entityId: receipt.id,
      afterJson: { receiptNumber, vendorId, poIds, items: items.map((i: any) => ({ sku: i.sku, qty: i.qtyReceived })) },
      performedBy: session.username,
    },
  })

  return apiSuccess({ message: 'Surat Jalan / GR berhasil dicatat', receiptNumber }, 201)
}
