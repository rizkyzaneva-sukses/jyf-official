import { prisma } from '@/lib/prisma'

export type ReportScheduleType = 'daily' | 'weekly'

export interface ReportScheduleConfig {
  type: ReportScheduleType
  cronSchedule: string
  hour: number
  minute: number
  isActive: boolean
}

const SCHEDULE_DEFAULTS: Record<ReportScheduleType, { cron: string; hour: number; minute: number; isActive: boolean }> = {
  daily: {
    cron: '30 17 * * *',
    hour: 17,
    minute: 30,
    isActive: true,
  },
  weekly: {
    cron: '0 8 * * 1',
    hour: 8,
    minute: 0,
    isActive: true,
  },
}

function parseCronPart(value: string | undefined, fallback: number): number {
  const raw = value?.trim()
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function parseBooleanSetting(value: string | null | undefined, fallback: boolean): boolean {
  if (value == null) return fallback
  return value !== 'false'
}

function formatCron(type: ReportScheduleType, hour: number, minute: number): string {
  return type === 'weekly'
    ? `${minute} ${hour} * * 1`
    : `${minute} ${hour} * * *`
}

function parseSchedule(type: ReportScheduleType, cronSchedule: string, isActive: boolean): ReportScheduleConfig {
  const defaults = SCHEDULE_DEFAULTS[type]
  const parts = cronSchedule.split(' ')

  return {
    type,
    cronSchedule,
    hour: parseCronPart(parts[1], defaults.hour),
    minute: parseCronPart(parts[0], defaults.minute),
    isActive,
  }
}

export async function getReportSchedule(type: ReportScheduleType): Promise<ReportScheduleConfig> {
  if (type === 'daily') {
    let sched = await prisma.reportSchedule.findFirst()

    if (!sched) {
      const defaults = SCHEDULE_DEFAULTS.daily
      sched = await prisma.reportSchedule.create({
        data: { cronSchedule: defaults.cron, isActive: defaults.isActive },
      })
    }

    return parseSchedule('daily', sched.cronSchedule, sched.isActive)
  }

  const defaults = SCHEDULE_DEFAULTS.weekly
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ['weekly_report_cron_schedule', 'weekly_report_is_active'] } },
  })
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]))

  return parseSchedule(
    'weekly',
    map.weekly_report_cron_schedule || defaults.cron,
    parseBooleanSetting(map.weekly_report_is_active, defaults.isActive)
  )
}

export async function updateReportSchedule(
  type: ReportScheduleType,
  input: { hour?: number; minute?: number; isActive?: boolean },
  updatedBy?: string | null
): Promise<ReportScheduleConfig> {
  const current = await getReportSchedule(type)
  const hour = input.hour ?? current.hour
  const minute = input.minute ?? current.minute
  const isActive = input.isActive ?? current.isActive

  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) {
    throw new Error('Jam/menit tidak valid')
  }

  const cronSchedule = formatCron(type, hour, minute)
  const actor = updatedBy ?? 'system'

  if (type === 'daily') {
    const existing = await prisma.reportSchedule.findFirst()

    if (existing) {
      await prisma.reportSchedule.update({
        where: { id: existing.id },
        data: { cronSchedule, isActive },
      })
    } else {
      await prisma.reportSchedule.create({
        data: { cronSchedule, isActive },
      })
    }
  } else {
    await prisma.appSetting.upsert({
      where: { key: 'weekly_report_cron_schedule' },
      update: { value: cronSchedule, updatedBy: actor },
      create: { key: 'weekly_report_cron_schedule', value: cronSchedule, updatedBy: actor },
    })

    await prisma.appSetting.upsert({
      where: { key: 'weekly_report_is_active' },
      update: { value: String(isActive), updatedBy: actor },
      create: { key: 'weekly_report_is_active', value: String(isActive), updatedBy: actor },
    })
  }

  return {
    type,
    cronSchedule,
    hour,
    minute,
    isActive,
  }
}
