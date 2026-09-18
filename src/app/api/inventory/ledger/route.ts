import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, wibDateRange, wibDayEnd, wibDayStart } from '@/lib/utils'

export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)

  const { searchParams } = request.nextUrl
  const sku = searchParams.get('sku')
  const limit = parseInt(searchParams.get('limit') || '100')
  const page = parseInt(searchParams.get('page') || '1')
  const skip = (page - 1) * limit
  
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  const whereCondition: any = {}
  if (sku) whereCondition.sku = sku
  
  if (dateFrom || dateTo) {
    whereCondition.trxDate = {}
    if (dateFrom && dateTo) {
      const { fromDate, toDate } = wibDateRange(dateFrom, dateTo)
      whereCondition.trxDate.gte = fromDate
      whereCondition.trxDate.lte = toDate
    } else {
      if (dateFrom) whereCondition.trxDate.gte = wibDayStart(dateFrom)
      if (dateTo) whereCondition.trxDate.lte = wibDayEnd(dateTo)
    }
  }

  const [ledger, total] = await Promise.all([
    prisma.inventoryLedger.findMany({
      where: whereCondition,
      include: { product: { select: { productName: true } } },
      orderBy: { trxDate: 'desc' },
      take: limit,
      skip,
    }),
    prisma.inventoryLedger.count({ where: whereCondition })
  ])

  return apiSuccess({ ledger, total })
}
