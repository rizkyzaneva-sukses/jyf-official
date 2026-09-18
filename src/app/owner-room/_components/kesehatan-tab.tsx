'use client'

import { useState, useEffect } from 'react'
import {
  Activity,
  Database,
  Clock,
  Bell,
  Server,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Boxes,
  Package,
  Truck,
  Cpu,
  Heart,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Health = {
  status: 'healthy' | 'degraded' | 'unhealthy'
  database: { status: 'connected' | 'error'; latencyMs: number }
  uptime: number
  timestamp: string
  version: string
}

type Scheduler = {
  scheduler: {
    alive: boolean
    heartbeatAt: string | null
    heartbeatAgeSeconds: number | null
    schedule: string
    isActive: boolean
  }
  autoReport: { enabled: boolean; lastSentAt: string | null; sentToday: boolean }
  reports: {
    daily: { lastSentAt: string | null }
    weekly: { lastSentAt: string | null }
    monthly: { lastSentAt: string | null }
  }
}

type Alerts = {
  stockEmpty: unknown[]
  stockLow: unknown[]
  orderOverdue: unknown[]
  summary: { emptyCount: number; lowCount: number; overdue24h: number; overdue48h: number }
}

type Recipient = { id: string; name: string; chatId: string; isActive: boolean }

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}d`
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}h ${h}j ${m}m`
  if (h > 0) return `${h}j ${m}m`
  return `${m}m`
}

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

type Status = 'ok' | 'warn' | 'bad' | 'unknown'

function StatusDot({ status, pulse = true }: { status: Status; pulse?: boolean }) {
  const colorMap: Record<Status, string> = {
    ok: 'bg-emerald-500',
    warn: 'bg-amber-500',
    bad: 'bg-red-500',
    unknown: 'bg-zinc-600',
  }
  return (
    <span className="relative inline-flex items-center">
      <span className={`w-2 h-2 rounded-full ${colorMap[status]}`} />
      {pulse && status === 'ok' && (
        <span className={`absolute w-2 h-2 rounded-full ${colorMap[status]} opacity-60 animate-ping`} />
      )}
    </span>
  )
}

function StatusBadge({ status }: { status: Status }) {
  const map: Record<Status, { label: string; cls: string }> = {
    ok: { label: 'Sehat', cls: 'bg-emerald-900/40 border-emerald-700/50 text-emerald-300' },
    warn: { label: 'Waspada', cls: 'bg-amber-900/40 border-amber-700/50 text-amber-300' },
    bad: { label: 'Bermasalah', cls: 'bg-red-900/40 border-red-700/50 text-red-300' },
    unknown: { label: 'Tidak diketahui', cls: 'bg-zinc-800 border-zinc-700 text-zinc-400' },
  }
  const s = map[status]
  return (
    <span className={`text-[10px] rounded px-2 py-0.5 border font-medium ${s.cls}`}>{s.label}</span>
  )
}

export function KesehatanTab() {
  const [health, setHealth] = useState<Health | null>(null)
  const [scheduler, setScheduler] = useState<Scheduler | null>(null)
  const [alerts, setAlerts] = useState<Alerts | null>(null)
  const [recipients, setRecipients] = useState<Recipient[] | null>(null)
  const [telegramConfigured, setTelegramConfigured] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [freshness, setFreshness] = useState<any>(null)

  const loadAll = async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const [h, s, a, r, st, fr] = await Promise.allSettled([
        fetch('/api/health', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/report/scheduler-status', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/alerts', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/settings/telegram-recipients', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/settings', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/health/freshness', { cache: 'no-store' }).then(r => r.json()),
      ])
      if (h.status === 'fulfilled') setHealth(h.value)
      if (s.status === 'fulfilled' && s.value.success) setScheduler(s.value)
      if (a.status === 'fulfilled' && a.value.success) setAlerts(a.value.data)
      if (r.status === 'fulfilled' && r.value.success) setRecipients(r.value.data ?? [])
      if (st.status === 'fulfilled' && st.value.success) {
        const d = st.value.data ?? {}
        setTelegramConfigured(Boolean(d.telegram_bot_token))
      }
      if (fr.status === 'fulfilled' && fr.value.success) setFreshness(fr.value.data)
      setLastUpdate(new Date())
    } catch (err: any) {
      setError(err.message || 'Gagal memuat status sistem')
    } finally {
      if (silent) setRefreshing(false)
      else setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
    const timer = window.setInterval(() => loadAll(true), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const dbStatus: Status =
    !health ? 'unknown'
    : health.database.status === 'connected'
      ? health.database.latencyMs > 500 ? 'warn' : 'ok'
      : 'bad'

  const schedulerStatus: Status =
    !scheduler ? 'unknown'
    : !scheduler.scheduler.alive ? 'bad'
    : !scheduler.autoReport.enabled ? 'warn'
    : 'ok'

  const telegramStatus: Status =
    telegramConfigured === null ? 'unknown'
    : !telegramConfigured ? 'warn'
    : recipients && recipients.filter(r => r.isActive).length === 0 ? 'warn'
    : 'ok'

  const alertsStatus: Status =
    !alerts ? 'unknown'
    : alerts.summary.overdue48h > 0 ? 'bad'
    : alerts.summary.emptyCount > 5 || alerts.summary.overdue24h > 0 || alerts.summary.lowCount > 5 ? 'warn'
    : 'ok'

  const overall: Status =
    [dbStatus, schedulerStatus, telegramStatus, alertsStatus].includes('bad') ? 'bad'
    : [dbStatus, schedulerStatus, telegramStatus, alertsStatus].includes('warn') ? 'warn'
    : [dbStatus, schedulerStatus, telegramStatus, alertsStatus].includes('unknown') ? 'unknown'
    : 'ok'

  const overallCopy: Record<Status, { title: string; desc: string }> = {
    ok: { title: 'Semua sistem berjalan normal', desc: 'Tidak ada masalah terdeteksi. Pantau terus secara berkala.' },
    warn: { title: 'Sistem berjalan dengan catatan', desc: 'Ada hal yang perlu perhatian — lihat detail di bawah.' },
    bad: { title: 'Ada masalah yang perlu ditangani', desc: 'Segera periksa layanan yang ditandai merah.' },
    unknown: { title: 'Status sistem belum lengkap', desc: 'Sedang mengumpulkan data dari semua layanan...' },
  }

  if (loading && !health && !scheduler) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 text-sm py-8 justify-center">
        <Loader2 size={14} className="animate-spin" /> Memuat status sistem...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header + refresh */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Heart size={16} className={overall === 'ok' ? 'text-emerald-400' : overall === 'bad' ? 'text-red-400' : 'text-amber-400'} />
          <h2 className="text-sm font-semibold text-zinc-200">Status Sistem</h2>
          <StatusBadge status={overall} />
        </div>
        <div className="flex items-center gap-3">
          {lastUpdate && (
            <span className="text-[10px] text-zinc-600">
              Update terakhir: {lastUpdate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB
            </span>
          )}
          <button
            type="button"
            onClick={() => loadAll(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 transition-colors"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Overall banner */}
      <div
        className={`rounded-xl border p-4 ${
          overall === 'bad'
            ? 'bg-red-950/20 border-red-800/50'
            : overall === 'warn'
              ? 'bg-amber-950/20 border-amber-800/50'
              : overall === 'ok'
                ? 'bg-emerald-950/15 border-emerald-800/40'
                : 'bg-zinc-900 border-zinc-800'
        }`}
      >
        <div className="flex items-start gap-3">
          {overall === 'bad' ? (
            <XCircle size={20} className="text-red-400 shrink-0 mt-0.5" />
          ) : overall === 'warn' ? (
            <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
          ) : overall === 'ok' ? (
            <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <Loader2 size={20} className="text-zinc-500 shrink-0 mt-0.5 animate-spin" />
          )}
          <div>
            <p className={`text-sm font-semibold ${overall === 'bad' ? 'text-red-300' : overall === 'warn' ? 'text-amber-300' : overall === 'ok' ? 'text-emerald-300' : 'text-zinc-300'}`}>
              {overallCopy[overall].title}
            </p>
            <p className="text-xs text-zinc-400 mt-0.5">{overallCopy[overall].desc}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {freshness && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <p className="text-xs font-semibold text-zinc-300 mb-3 flex items-center gap-2">
            <Clock size={12} className="text-blue-400" /> Data Freshness
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
            {[
              { l: 'Order import', v: freshness.lastOrderImport },
              { l: 'Payout import', v: freshness.lastPayoutImport },
              { l: 'Ads spend', v: freshness.lastAdsSpend },
              { l: 'Expense', v: freshness.lastExpense },
              { l: 'Scan resi', v: freshness.lastResiScan },
            ].map(x => (
              <div key={x.l} className="bg-zinc-950/50 rounded-lg px-3 py-2 border border-zinc-800/80">
                <p className="text-[10px] text-zinc-500">{x.l}</p>
                <p className="text-zinc-300 mt-0.5">
                  {x.v?.at ? formatDateTime(typeof x.v.at === 'string' ? x.v.at : new Date(x.v.at).toISOString()) : '—'}
                </p>
                <p className="text-[10px] text-zinc-600">
                  {x.v?.hoursAgo != null ? `${x.v.hoursAgo} jam lalu` : ''}
                </p>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-zinc-600 mt-2">
            7 hari: {freshness.activity7d?.ordersInserted ?? 0} order insert · {freshness.activity7d?.payoutsInserted ?? 0} payout insert
          </p>
        </div>
      )}

      {/* Service cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Database */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database size={14} className="text-cyan-400" />
              <p className="text-xs font-semibold text-zinc-300">Database</p>
            </div>
            <StatusDot status={dbStatus} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Status</span>
              <span className={`text-xs font-medium ${dbStatus === 'ok' ? 'text-emerald-300' : dbStatus === 'warn' ? 'text-amber-300' : 'text-red-300'}`}>
                {dbStatus === 'ok' ? 'Terhubung' : dbStatus === 'warn' ? 'Lambat' : dbStatus === 'bad' ? 'Gagal' : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Latency</span>
              <span className="text-xs font-mono text-zinc-200">
                {health ? `${health.database.latencyMs} ms` : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Uptime App</span>
              <span className="text-xs font-mono text-zinc-200">
                {health ? formatUptime(health.uptime) : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Versi</span>
              <span className="text-xs font-mono text-zinc-200">
                {health?.version ?? '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Scheduler */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-violet-400" />
              <p className="text-xs font-semibold text-zinc-300">Scheduler / Cron</p>
            </div>
            <StatusDot status={schedulerStatus} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Status</span>
              <span className={`text-xs font-medium ${schedulerStatus === 'ok' ? 'text-emerald-300' : schedulerStatus === 'warn' ? 'text-amber-300' : schedulerStatus === 'bad' ? 'text-red-300' : 'text-zinc-400'}`}>
                {schedulerStatus === 'ok' ? 'Alive' : schedulerStatus === 'warn' ? 'Pause' : schedulerStatus === 'bad' ? 'Stale' : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Heartbeat</span>
              <span className="text-xs font-mono text-zinc-200">
                {scheduler?.scheduler.heartbeatAgeSeconds != null
                  ? `${Math.floor(scheduler.scheduler.heartbeatAgeSeconds / 60)}m ${scheduler.scheduler.heartbeatAgeSeconds % 60}d lalu`
                  : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Jadwal</span>
              <span className="text-xs font-mono text-zinc-200">
                {scheduler?.scheduler.schedule ?? '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Harian</span>
              <span className="text-xs font-mono text-zinc-200">
                {scheduler?.reports.daily.lastSentAt ? formatDate(scheduler.reports.daily.lastSentAt) : 'Belum'}
              </span>
            </div>
          </div>
        </div>

        {/* Telegram */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Bell size={14} className="text-sky-400" />
              <p className="text-xs font-semibold text-zinc-300">Telegram</p>
            </div>
            <StatusDot status={telegramStatus} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Bot Token</span>
              <span className={`text-xs font-medium ${telegramConfigured ? 'text-emerald-300' : 'text-amber-300'}`}>
                {telegramConfigured ? 'Ada' : 'Belum'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Penerima</span>
              <span className="text-xs font-mono text-zinc-200">
                {recipients
                  ? `${recipients.filter(r => r.isActive).length} / ${recipients.length}`
                  : '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Kirim Hari Ini</span>
              <span className={`text-xs font-medium ${scheduler?.autoReport.sentToday ? 'text-emerald-300' : 'text-amber-300'}`}>
                {scheduler?.autoReport.sentToday ? '✓ Terkirim' : 'Belum'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Auto Report</span>
              <span className={`text-xs font-medium ${scheduler?.autoReport.enabled ? 'text-emerald-300' : 'text-amber-300'}`}>
                {scheduler?.autoReport.enabled ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
          </div>
        </div>

        {/* Operasional */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity size={14} className="text-emerald-400" />
              <p className="text-xs font-semibold text-zinc-300">Operasional</p>
            </div>
            <StatusDot status={alertsStatus} />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Stok Kosong</span>
              <span className={`text-xs font-mono ${alerts && alerts.summary.emptyCount > 0 ? 'text-amber-300' : 'text-zinc-200'}`}>
                {alerts?.summary.emptyCount ?? '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Stok Menipis</span>
              <span className={`text-xs font-mono ${alerts && alerts.summary.lowCount > 0 ? 'text-amber-300' : 'text-zinc-200'}`}>
                {alerts?.summary.lowCount ?? '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Order {'>'} 24 jam</span>
              <span className={`text-xs font-mono ${alerts && alerts.summary.overdue24h > 0 ? 'text-amber-300' : 'text-zinc-200'}`}>
                {alerts?.summary.overdue24h ?? '—'}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-zinc-500 uppercase">Order {'>'} 48 jam</span>
              <span className={`text-xs font-mono ${alerts && alerts.summary.overdue48h > 0 ? 'text-red-300' : 'text-zinc-200'}`}>
                {alerts?.summary.overdue48h ?? '—'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Report schedule detail */}
      {scheduler && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Server size={14} className="text-zinc-400" />
            <p className="text-xs font-semibold text-zinc-300">Laporan Otomatis Terakhir</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
              <p className="text-zinc-500">Harian</p>
              <p className="text-zinc-200 font-medium mt-0.5">{formatDateTime(scheduler.reports.daily.lastSentAt)}</p>
            </div>
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
              <p className="text-zinc-500">Mingguan (Senin)</p>
              <p className="text-zinc-200 font-medium mt-0.5">{formatDateTime(scheduler.reports.weekly.lastSentAt)}</p>
            </div>
            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
              <p className="text-zinc-500">Bulanan (Tgl 1)</p>
              <p className="text-zinc-200 font-medium mt-0.5">{formatDateTime(scheduler.reports.monthly.lastSentAt)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick action */}
      <div className="text-[10px] text-zinc-600 flex items-center gap-1.5">
        <Cpu size={10} />
        <span>Auto-refresh setiap 30 detik. Data diambil langsung dari server (/api/health, /api/report/scheduler-status, /api/alerts).</span>
      </div>
    </div>
  )
}
