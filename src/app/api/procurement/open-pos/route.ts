import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// GET /api/procurement/open-pos?vendorId=xxx — fetch OPEN/PARTIAL POs for a vendor
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = new URL(request.url)
  const vendorId = searchParams.get('vendorId')

  if (!vendorId) return apiError('vendorId wajib diisi')

  const pos = await prisma.purchaseOrder.findMany({
    where: {
      vendorId,
      status: { in: ['OPEN', 'PARTIAL'] },
    },
    include: {
      items: {
        where: { status: { not: 'COMPLETED' } },
        orderBy: { productName: 'asc' },
      },
    },
    orderBy: { poDate: 'desc' },
  })

  // Filter out POs that have no remaining items
  const posWithItems = pos.filter(po => po.items.length > 0)

  return apiSuccess(posWithItems)
}
