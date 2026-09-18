import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { getReportSchedule } from '@/lib/report-schedule'

/**
 * GET /api/report/scheduler-status
 * Cek status scheduler & kapan terakhir kirim laporan.
 * Hanya bisa diakses Owner.
 */
export async function GET() {
    const session = await getSession()
    if (!session.isLoggedIn || session.userRole !== 'OWNER') {
        return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    try {
        const keys = [
            'last_auto_report_sent',
            'last_weekly_report_sent',
            'last_monthly_report_sent',
            'auto_report_enabled',
            'scheduler_heartbeat',
            'scheduler_last_wib',
            'scheduler_schedule',
        ]

        const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } })
        const data: Record<string, string | null> = Object.fromEntries(keys.map(k => [k, null]))
        for (const r of rows) data[r.key] = r.value

        // Cek apakah laporan harian sudah terkirim hari ini
        const todayWIB = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
        const lastSentDay = data.last_auto_report_sent
            ? new Date(data.last_auto_report_sent).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
            : null
        const sentToday = lastSentDay === todayWIB
        const heartbeatAt = data.scheduler_heartbeat ? new Date(data.scheduler_heartbeat) : null
        const heartbeatAgeMs = heartbeatAt ? Date.now() - heartbeatAt.getTime() : null
        const schedulerAlive = heartbeatAgeMs !== null && heartbeatAgeMs >= 0 && heartbeatAgeMs < 10 * 60 * 1000

        let dailySchedule = null
        let weeklySchedule = null
        try {
            dailySchedule = await getReportSchedule('daily')
        } catch { /* ignore */ }
        try {
            weeklySchedule = await getReportSchedule('weekly')
        } catch { /* ignore */ }

        return NextResponse.json({
            success: true,
            scheduler: {
                alive: schedulerAlive,
                heartbeatAt: data.scheduler_heartbeat,
                heartbeatAgeSeconds: heartbeatAgeMs === null ? null : Math.round(heartbeatAgeMs / 1000),
                lastWib: data.scheduler_last_wib,
                schedule: dailySchedule
                    ? `${String(dailySchedule.hour).padStart(2,'0')}:${String(dailySchedule.minute).padStart(2,'0')} WIB`
                    : (data.scheduler_schedule ?? '17:30 WIB'),
                isActive: dailySchedule?.isActive ?? true,
            },
            autoReport: {
                enabled: data.auto_report_enabled !== 'false',
                lastSentAt: data.last_auto_report_sent,
                sentToday,
            },
            reports: {
                daily:   {
                    lastSentAt: data.last_auto_report_sent,
                    schedule: dailySchedule,
                },
                weekly:  {
                    lastSentAt: data.last_weekly_report_sent,
                    schedule: weeklySchedule,
                },
                monthly: { lastSentAt: data.last_monthly_report_sent },
            },
        })
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }
}
