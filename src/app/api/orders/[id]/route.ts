import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { id } = await params
  const body = await request.json()
  const { status, airwaybill, qty, realOmzet, totalProductPrice, hpp } = body
  const isOwner = session.userRole === 'OWNER'

  const order = await prisma.order.findUnique({ where: { id } })
  if (!order) return apiError('Order not found', 404)

  // FINANCE hanya boleh ubah HPP; field lain khusus OWNER
  const updated = await prisma.order.update({
    where: { id },
    data: {
      ...(isOwner && status !== undefined && { status }),
      ...(isOwner && airwaybill !== undefined && { airwaybill }),
      ...(isOwner && qty !== undefined && { qty: Number(qty) }),
      ...(isOwner && realOmzet !== undefined && { realOmzet: Number(realOmzet) }),
      ...(isOwner && totalProductPrice !== undefined && { totalProductPrice: Number(totalProductPrice) }),
      ...(hpp !== undefined && { hpp: Number(hpp) }),
    },
  })

  await prisma.auditLog.create({
    data: {
      entityType: 'Order',
      entityId: id,
      action: 'UPDATE',
      note: `${session.userRole} edited order ${order.orderNo}`,
      performedBy: session.username,
    }
  })

  return apiSuccess({ message: 'Pesanan berhasil diperbarui', order: updated })
}
