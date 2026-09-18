import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getReportSchedule, updateReportSchedule, type ReportScheduleType } from '@/lib/report-schedule'

async function requireOwner() {
  const session = await getSession()
  if (!session.isLoggedIn || session.userRole !== 'OWNER') return null
  return session
}

function getScheduleType(request: NextRequest): ReportScheduleType {
  return request.nextUrl.searchParams.get('type') === 'weekly' ? 'weekly' : 'daily'
}

/**
 * GET /api/settings/report-schedule
 * Ambil jadwal auto-report. Default: daily.
 * Query: ?type=daily|weekly
 */
export async function GET(request: NextRequest) {
  if (!await requireOwner()) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const type = getScheduleType(request)
    const sched = await getReportSchedule(type)

    return NextResponse.json({
      success: true,
      data: sched,
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

/**
 * PUT /api/settings/report-schedule
 * Query: ?type=daily|weekly
 * Body: { hour?: number, minute?: number, isActive?: boolean }
 * Perubahan langsung aktif di scheduler tanpa restart.
 */
export async function PUT(request: NextRequest) {
  const session = await requireOwner()
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const type = getScheduleType(request)
    const body = await request.json()
    const hour = body.hour !== undefined ? Number(body.hour) : undefined
    const minute = body.minute !== undefined ? Number(body.minute) : undefined
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : undefined

    const updated = await updateReportSchedule(type, { hour, minute, isActive }, session.username)

    return NextResponse.json({
      success: true,
      message: `Jadwal ${type} diupdate: ${String(updated.hour).padStart(2, '0')}:${String(updated.minute).padStart(2, '0')} WIB`,
      data: updated,
    })
  } catch (err: any) {
    if (err.message === 'Jam/menit tidak valid') {
      return NextResponse.json({ success: false, error: err.message }, { status: 400 })
    }

    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
