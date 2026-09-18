/**
 * Next.js Instrumentation — jalan sekali saat server Node.js start.
 *
 * Schedules:
 * 1. Daily report — jadwal dari DB (default 17:30 WIB)
 * 2. Weekly report — Senin 08:00 WIB (recap minggu lalu)
 * 3. Monthly report — Tanggal 2 jam 09:00 WIB (recap Laba Rugi bulan lalu)
 *
 * Fix:
 * - Guard double-send pakai DB (bukan hanya in-memory) → tahan restart container
 * - Catch-up window 30 menit → kalau container restart setelah jadwal, masih bisa kirim
 */
export async function register() {
    // Hanya jalan di Node.js runtime, skip Edge
    if (process.env.NEXT_RUNTIME === 'edge') return

    try {
        const { todayWIBStr } = await import('@/lib/utils')
        function wibClock(): { today: string; hour: number; minute: number; weekday: string } {
            const today = todayWIBStr()
            const [hour, minute] = new Date()
                .toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour12: false })
                .split(':')
                .map(Number)
            const weekday = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Jakarta', weekday: 'short' })
            return { today, hour, minute, weekday }
        }

        const nodeCron                            = await import('node-cron')
        const { buildDailyReport }                = await import('@/lib/daily-report')
        const { buildWeeklyReport }               = await import('@/lib/weekly-report')
        const { buildMonthlyReport }              = await import('@/lib/monthly-report')
        const { broadcastTelegramReport }         = await import('@/lib/telegram')
        const { getReportSchedule }               = await import('@/lib/report-schedule')
        const { prisma }                          = await import('@/lib/prisma')

        // Cek apakah laporan sudah terkirim hari ini (dari DB — tahan restart)
        async function isAlreadySent(settingKey: string, todayStr: string): Promise<boolean> {
            try {
                const rec = await prisma.appSetting.findUnique({ where: { key: settingKey } })
                if (!rec?.value) return false
                const lastSentDay = new Date(rec.value).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
                return lastSentDay === todayStr
            } catch {
                return false
            }
        }

        async function markSent(settingKey: string) {
            await prisma.appSetting.upsert({
                where:  { key: settingKey },
                update: { value: new Date().toISOString(), updatedBy: 'system-cron' },
                create: { key: settingKey, value: new Date().toISOString(), updatedBy: 'system-cron' },
            })
        }

        async function markSetting(settingKey: string, value: string) {
            await prisma.appSetting.upsert({
                where:  { key: settingKey },
                update: { value, updatedBy: 'system-cron' },
                create: { key: settingKey, value, updatedBy: 'system-cron' },
            })
        }

        // ─── Daily Report Scheduler ───────────────────────────────────────
        let lastDailySent: string | null = null
        let dailySending = false
        let lastHeartbeatBucket: string | null = null

        nodeCron.schedule('* * * * *', async () => {
            try {
                const { hour, minute, isActive } = await getReportSchedule('daily')

                const { today, hour: hourNow, minute: minuteNow } = wibClock()
                const currentTotalMin   = hourNow * 60 + minuteNow

                const heartbeatBucket = `${today}:${Math.floor(currentTotalMin / 5)}`
                if (lastHeartbeatBucket !== heartbeatBucket) {
                    lastHeartbeatBucket = heartbeatBucket
                    await markSetting('scheduler_heartbeat', new Date().toISOString())
                    await markSetting('scheduler_last_wib', `${today} ${String(hourNow).padStart(2,'0')}:${String(minuteNow).padStart(2,'0')}`)
                    await markSetting('scheduler_schedule', `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} WIB`)
                }

                if (!isActive) return

                if (lastDailySent === today) return
                if (dailySending) return

                const scheduledTotalMin = hour * 60 + minute
                const inWindow = currentTotalMin >= scheduledTotalMin && currentTotalMin < scheduledTotalMin + 30
                if (!inWindow) return

                if (await isAlreadySent('last_auto_report_sent', today)) {
                    lastDailySent = today
                    return
                }

                dailySending = true
                console.log(`[daily-report] 🚀 ${hourNow}:${String(minuteNow).padStart(2,'0')} WIB — kirim laporan harian (jadwal: ${hour}:${String(minute).padStart(2,'0')})...`)

                const report           = await buildDailyReport()
                const { sent, failed } = await broadcastTelegramReport(report, 'daily')

                console.log(`[daily-report] ✅ Selesai — terkirim: ${sent}, gagal: ${failed}`)

                if (sent > 0) {
                    lastDailySent = today
                    await markSent('last_auto_report_sent')
                } else if (failed > 0) {
                    console.error('[daily-report] ❌ Semua pengiriman gagal. Cek bot token & chat ID.')
                }
            } catch (err) {
                console.error('[daily-report] ❌ Error saat kirim laporan:', err)
            } finally {
                dailySending = false
            }
        }, { timezone: 'Asia/Jakarta' })

        console.log('[daily-report] 🟢 Scheduler aktif — jadwal dari DB, catch-up window 30 menit (default: 17:30 WIB)')

        // ─── Weekly Report Scheduler — Senin 08:00 WIB ───────────────────
        let lastWeeklySent: string | null = null
        let weeklySending = false

        nodeCron.schedule('* * * * *', async () => {
            try {
                const { hour, minute, isActive } = await getReportSchedule('weekly')
                const { today, hour: hourNow, minute: minuteNow, weekday } = wibClock()

                if (!isActive) return
                if (weekday !== 'Mon') return
                if (lastWeeklySent === today) return
                if (weeklySending) return

                // Window: jadwal weekly s/d +29 menit
                const scheduledMin = hour * 60 + minute
                const currentMin   = hourNow * 60 + minuteNow
                const inWindow = currentMin >= scheduledMin && currentMin < scheduledMin + 30
                if (!inWindow) return

                if (await isAlreadySent('last_weekly_report_sent', today)) {
                    lastWeeklySent = today
                    return
                }

                weeklySending = true
                console.log(`[weekly-report] 🚀 ${hourNow}:${String(minuteNow).padStart(2,'0')} WIB — kirim laporan mingguan (jadwal: ${hour}:${String(minute).padStart(2,'0')})...`)

                const report = await buildWeeklyReport()
                const { sent, failed } = await broadcastTelegramReport(report, 'weekly')
                console.log(`[weekly-report] ✅ Selesai — terkirim: ${sent}, gagal: ${failed}`)
                if (sent > 0) {
                    lastWeeklySent = today
                    await markSent('last_weekly_report_sent')
                }
            } catch (err) {
                console.error('[weekly-report] ❌ Error:', err)
            } finally {
                weeklySending = false
            }
        }, { timezone: 'Asia/Jakarta' })

        console.log('[weekly-report] 🟢 Scheduler aktif — jadwal dari DB/settings, hari Senin, catch-up window 30 menit')

        // ─── Monthly Report Scheduler — Tanggal 2, 09:00 WIB ─────────────
        // tgl 2 agar settlement akhir bulan sempat masuk Laba Rugi kas
        let lastMonthlySent: string | null = null
        let monthlySending = false

        nodeCron.schedule('* * * * *', async () => {
            try {
                const { today, hour: hourNow, minute: minuteNow } = wibClock()
                const dayOfMonth = Number(today.slice(8, 10))

                // Hanya tanggal 2 (Laba Rugi bulan sebelumnya)
                if (dayOfMonth !== 2) return
                if (lastMonthlySent === today) return
                if (monthlySending) return

                // Window: 09:00 – 09:29 WIB
                const scheduledMin = 9 * 60
                const currentMin   = hourNow * 60 + minuteNow
                const inWindow = currentMin >= scheduledMin && currentMin < scheduledMin + 30
                if (!inWindow) return

                if (await isAlreadySent('last_monthly_report_sent', today)) {
                    lastMonthlySent = today
                    return
                }

                monthlySending = true
                console.log(`[monthly-report] 🚀 ${hourNow}:${String(minuteNow).padStart(2,'0')} WIB — kirim Laba Rugi bulanan...`)

                const report = await buildMonthlyReport()
                const { sent, failed } = await broadcastTelegramReport(report, 'monthly')
                console.log(`[monthly-report] ✅ Selesai — terkirim: ${sent}, gagal: ${failed}`)
                if (sent > 0) {
                    lastMonthlySent = today
                    await markSent('last_monthly_report_sent')
                }
            } catch (err) {
                console.error('[monthly-report] ❌ Error:', err)
            } finally {
                monthlySending = false
            }
        }, { timezone: 'Asia/Jakarta' })

        console.log('[monthly-report] 🟢 Scheduler aktif — Tanggal 2 jam 09:00 WIB (Laba Rugi kas), catch-up 30 menit')

    } catch (err) {
        console.error('[instrumentation] ❌ Gagal start scheduler:', err)
    }
}
