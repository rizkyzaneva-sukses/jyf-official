import { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, wibDateRange } from '@/lib/utils'
import { computeProfitLoss } from '@/lib/pnl-helpers'

// GET /api/reports/pl?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')
  if (!dateFrom || !dateTo) return apiError('dateFrom dan dateTo wajib diisi')

  const { fromDate, toDate } = wibDateRange(dateFrom, dateTo)
  const data = await computeProfitLoss(fromDate, toDate)
  return apiSuccess(data)
}
