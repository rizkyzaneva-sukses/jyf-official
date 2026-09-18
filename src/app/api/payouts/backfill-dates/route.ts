import { NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

/**
 * POST /api/payouts/backfill-dates
 *
 * DINONAKTIFKAN (2026-08).
 * orders.trx_date = tanggal order masuk (ops).
 * Tanggal cair hanya di payouts.released_date (Laba Rugi).
 * Endpoint dibiarkan agar UI lama tidak 404; selalu menolak.
 */
export async function POST(_request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Forbidden — hanya OWNER', 403)

  return apiError(
    'Dinonaktifkan: trx_date order tidak boleh diganti tanggal cair. ' +
    'Pakai payouts.released_date untuk Laba Rugi; trx_date untuk omset ops / Telegram harian.',
    410,
  )
}
