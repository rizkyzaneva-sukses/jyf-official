import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/purchase-orders/[id] — detail single PO
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { id } = await params

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      items: true,
      vendor: { select: { namaVendor: true, kontak: true } },
    },
  })

  if (!po) return apiError('PO tidak ditemukan', 404)

  return apiSuccess(po)
}

// PATCH /api/purchase-orders/[id] — tutup / buka kembali PO (OWNER & FINANCE)
// Tidak untuk edit field lain — pakai PATCH /api/purchase-orders untuk itu (OWNER only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { id } = await params
  const body = await request.json()
  const { action } = body

  if (!['close', 'reopen'].includes(action)) {
    return apiError('Action tidak valid — gunakan "close" atau "reopen"')
  }

  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: { items: true },
  })
  if (!po) return apiError('PO tidak ditemukan', 404)

  let newStatus: string
  if (action === 'close') {
    if (!['OPEN', 'PARTIAL'].includes(po.status)) {
      return apiError(`PO dengan status ${po.status} tidak bisa ditutup`)
    }
    newStatus = 'CLOSED'
  } else {
    if (po.status !== 'CLOSED') {
      return apiError('PO ini tidak dalam status CLOSED')
    }
    // Hitung ulang status sesuai qty yang sudah diterima (sama seperti logika commit scan)
    const anyReceived = po.items.some(i => i.qtyReceived > 0)
    const allCompleted = po.items.length > 0 && po.items.every(i => i.status === 'COMPLETED')
    newStatus = allCompleted ? 'COMPLETED' : anyReceived ? 'PARTIAL' : 'OPEN'
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.purchaseOrder.update({
      where: { id },
      data: { status: newStatus as any },
      include: { items: true, vendor: { select: { namaVendor: true, kontak: true } } },
    })
    await tx.auditLog.create({
      data: {
        entityType: 'PurchaseOrder',
        action: 'UPDATE',
        entityId: id,
        note: `${session.userRole} ${action === 'close' ? 'menutup' : 'membuka kembali'} PO ${po.poNumber} (${po.status} → ${newStatus})`,
        performedBy: session.username,
      },
    })
    return result
  })

  return apiSuccess({
    ...updated,
    message: action === 'close'
      ? `PO ${po.poNumber} berhasil ditutup`
      : `PO ${po.poNumber} dibuka kembali (status: ${newStatus})`,
  })
}
