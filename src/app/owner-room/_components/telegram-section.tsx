'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/components/ui/toaster'
import { Loader2, Settings, CheckCircle2, Send, Bell, Eye, EyeOff, Activity, RefreshCw, AlertTriangle } from 'lucide-react'

export function TelegramSection() {
  type Recipient = { id: string; name: string; chatId: string; threadId?: string | null; reportTypes?: string | null; isActive: boolean }

  // Tipe laporan yang bisa dirutekan ke topic berbeda
  const REPORT_TYPES: { key: 'daily' | 'weekly' | 'monthly'; label: string }[] = [
    { key: 'daily', label: 'Harian' },
    { key: 'weekly', label: 'Mingguan' },
    { key: 'monthly', label: 'Bulanan' },
  ]
  const parseTypes = (rt?: string | null): string[] =>
    rt ? rt.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : []
  type ScheduleData = { hour: number; minute: number; isActive: boolean } | null
  type HealthData = {
    scheduler: {
      alive: boolean
      heartbeatAt: string | null
      heartbeatAgeSeconds: number | null
      lastWib: string | null
      schedule: string
      isActive: boolean
    }
    reports: {
      daily: { lastSentAt: string | null; schedule?: ScheduleData }
      weekly: { lastSentAt: string | null; schedule?: ScheduleData }
      monthly: { lastSentAt: string | null }
    }
  }

  const { toast } = useToast()
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [sending, setSending] = useState(false)
  const [autoEnabled, setAutoEnabled] = useState(true)
  const [lastSent, setLastSent] = useState<string | null>(null)
  const [togglingAuto, setTogglingAuto] = useState(false)
  const [schedHour, setSchedHour] = useState(17)
  const [schedMinute, setSchedMinute] = useState(30)
  const [savingSched, setSavingSched] = useState(false)
  const [weeklyAutoEnabled, setWeeklyAutoEnabled] = useState(true)
  const [lastWeeklySent, setLastWeeklySent] = useState<string | null>(null)
  const [togglingWeeklyAuto, setTogglingWeeklyAuto] = useState(false)
  const [weeklySchedHour, setWeeklySchedHour] = useState(8)
  const [weeklySchedMinute, setWeeklySchedMinute] = useState(0)
  const [savingWeeklySched, setSavingWeeklySched] = useState(false)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loadingRecipients, setLoadingRecipients] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newChatId, setNewChatId] = useState('')
  const [newThreadId, setNewThreadId] = useState('')
  const [newReportTypes, setNewReportTypes] = useState<string[]>([])
  const [addingRecipient, setAddingRecipient] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthData | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(true)
  const [refreshingHealth, setRefreshingHealth] = useState(false)

  useEffect(() => {
    // Load token + chat ID
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setBotToken(d.data?.telegram_bot_token ?? '')
          setChatId(d.data?.telegram_chat_id ?? '')
          setAutoEnabled(d.data?.auto_report_enabled !== 'false')
          setLastSent(d.data?.last_auto_report_sent ?? null)
          setLastWeeklySent(d.data?.last_weekly_report_sent ?? null)
        }
      })
      .finally(() => setFetching(false))
    fetch('/api/settings/report-schedule?type=daily')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setSchedHour(d.data.hour)
          setSchedMinute(d.data.minute)
          setAutoEnabled(d.data.isActive)
        }
      })
      .catch(() => {})
    fetch('/api/settings/report-schedule?type=weekly')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setWeeklySchedHour(d.data.hour)
          setWeeklySchedMinute(d.data.minute)
          setWeeklyAutoEnabled(d.data.isActive)
        }
      })
      .catch(() => {})
    // Load recipients
    fetch('/api/settings/telegram-recipients')
      .then(r => r.json())
      .then(d => { if (d.success) setRecipients(d.data) })
      .finally(() => setLoadingRecipients(false))

    loadHealth()
    const healthTimer = window.setInterval(() => {
      loadHealth(true)
    }, 30000)

    return () => window.clearInterval(healthTimer)
  }, [])

  const loadRecipients = () => {
    fetch('/api/settings/telegram-recipients')
      .then(r => r.json())
      .then(d => { if (d.success) setRecipients(d.data) })
  }

  const loadHealth = async (silent = false) => {
    if (silent) setRefreshingHealth(true)
    else setLoadingHealth(true)

    try {
      const res = await fetch('/api/report/scheduler-status', { cache: 'no-store' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Gagal memuat status sistem')
      setHealth(json)
      setHealthError(null)
    } catch (err: any) {
      setHealthError(err.message || 'Gagal memuat status sistem')
    } finally {
      if (silent) setRefreshingHealth(false)
      else setLoadingHealth(false)
    }
  }

  const handleAddRecipient = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddingRecipient(true)
    try {
      const res = await fetch('/api/settings/telegram-recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          chatId: newChatId,
          threadId: newThreadId || null,
          reportTypes: newReportTypes,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setNewName(''); setNewChatId(''); setNewThreadId(''); setNewReportTypes([]); setShowAddForm(false)
      loadRecipients()
      toast({ title: `✅ ${newName} ditambahkan sebagai penerima laporan`, type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal menambah recipient', type: 'error' })
    } finally { setAddingRecipient(false) }
  }

  // ── Edit recipient (ubah topic ID / tipe laporan dengan mudah) ──
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editChatId, setEditChatId] = useState('')
  const [editThreadId, setEditThreadId] = useState('')
  const [editReportTypes, setEditReportTypes] = useState<string[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  const startEdit = (r: Recipient) => {
    setEditingId(r.id)
    setEditName(r.name)
    setEditChatId(r.chatId)
    setEditThreadId(r.threadId ?? '')
    setEditReportTypes(parseTypes(r.reportTypes))
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName(''); setEditChatId(''); setEditThreadId(''); setEditReportTypes([])
  }

  const toggleReportType = (list: string[], key: string, set: (v: string[]) => void) => {
    set(list.includes(key) ? list.filter(t => t !== key) : [...list, key])
  }

  const handleSaveEdit = async (id: string) => {
    setSavingEdit(true)
    try {
      const res = await fetch(`/api/settings/telegram-recipients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          chatId: editChatId,
          threadId: editThreadId || null,
          reportTypes: editReportTypes,
        }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      cancelEdit()
      loadRecipients()
      toast({ title: '✅ Penerima diperbarui', type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal memperbarui', type: 'error' })
    } finally { setSavingEdit(false) }
  }

  const handleToggleRecipient = async (id: string, current: boolean) => {
    const res = await fetch(`/api/settings/telegram-recipients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !current }),
    })
    const json = await res.json()
    if (json.success) loadRecipients()
  }

  const handleDeleteRecipient = async (id: string, name: string) => {
    if (!confirm(`Hapus "${name}" dari daftar penerima?`)) return
    await fetch(`/api/settings/telegram-recipients/${id}`, { method: 'DELETE' })
    loadRecipients()
    toast({ title: `🗑️ ${name} dihapus`, type: 'success' })
  }

  const handleTestRecipient = async (id: string, name: string) => {
    setTestingId(id)
    try {
      const res = await fetch(`/api/settings/telegram-recipients/${id}?action=test`, { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast({ title: `✅ Test terkirim ke ${name}! Cek apakah pesan masuk di topic yang benar.`, type: 'success' })
    } catch (err: any) {
      toast({ title: `❌ ${err.message}`, type: 'error' })
    } finally { setTestingId(null) }
  }

  const handleToggleAuto = async () => {
    setTogglingAuto(true)
    const newValue = !autoEnabled
    try {
      // Update AppSetting
      const r1 = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'auto_report_enabled', value: String(newValue) }),
      })
      const j1 = await r1.json()
      if (!j1.success) throw new Error(j1.error)
      // Update ReportSchedule.isActive
      const r2 = await fetch('/api/settings/report-schedule?type=daily', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newValue }),
      })
      const j2 = await r2.json()
      if (!j2.success) throw new Error(j2.error)
      setAutoEnabled(newValue)
      const timeLabel = `${String(schedHour).padStart(2,'0')}:${String(schedMinute).padStart(2,'0')}`
      toast({ title: newValue ? `⏰ Auto report ${timeLabel} WIB diaktifkan!` : '⏸️ Auto report dinonaktifkan', type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal mengubah setting', type: 'error' })
    } finally { setTogglingAuto(false) }
  }

  const handleSaveSchedule = async () => {
    setSavingSched(true)
    try {
      const res = await fetch('/api/settings/report-schedule?type=daily', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hour: schedHour, minute: schedMinute }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast({ title: `✅ Jadwal disimpan: ${String(schedHour).padStart(2,'0')}:${String(schedMinute).padStart(2,'0')} WIB — langsung aktif!`, type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal simpan jadwal', type: 'error' })
    } finally { setSavingSched(false) }
  }

  const handleToggleWeeklyAuto = async () => {
    setTogglingWeeklyAuto(true)
    const newValue = !weeklyAutoEnabled
    try {
      const res = await fetch('/api/settings/report-schedule?type=weekly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newValue }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setWeeklyAutoEnabled(newValue)
      const timeLabel = `${String(weeklySchedHour).padStart(2,'0')}:${String(weeklySchedMinute).padStart(2,'0')}`
      toast({ title: newValue ? `Auto weekly report ${timeLabel} WIB diaktifkan!` : 'Auto weekly report dinonaktifkan', type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal mengubah weekly report', type: 'error' })
    } finally { setTogglingWeeklyAuto(false) }
  }

  const handleSaveWeeklySchedule = async () => {
    setSavingWeeklySched(true)
    try {
      const res = await fetch('/api/settings/report-schedule?type=weekly', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hour: weeklySchedHour, minute: weeklySchedMinute }),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast({ title: `Jadwal mingguan disimpan: Senin ${String(weeklySchedHour).padStart(2,'0')}:${String(weeklySchedMinute).padStart(2,'0')} WIB`, type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal simpan jadwal mingguan', type: 'error' })
    } finally { setSavingWeeklySched(false) }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const results = await Promise.all([
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'telegram_bot_token', value: botToken.trim() }),
        }),
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'telegram_chat_id', value: chatId.trim() }),
        }),
      ])
      const jsons = await Promise.all(results.map(r => r.json()))
      const failed = jsons.find(j => !j.success)
      if (failed) throw new Error(failed.error)
      toast({ title: '✅ Konfigurasi Telegram disimpan!', type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal menyimpan', type: 'error' })
    } finally { setSaving(false) }
  }

  const handleTest = async () => {
    if (!botToken || !chatId) {
      toast({ title: 'Simpan Bot Token dan Chat ID dulu!', type: 'error' })
      return
    }
    setTesting(true)
    try {
      const res = await fetch('/api/report/test-telegram', { method: 'POST' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      toast({ title: '✅ Pesan test berhasil dikirim ke Telegram!', type: 'success' })
    } catch (err: any) {
      toast({ title: `❌ ${err.message || 'Gagal kirim test'}`, type: 'error' })
    } finally { setTesting(false) }
  }

  const handleSendNow = async () => {
    const activeRecipientCount = recipients.filter(r => r.isActive).length
    if (!botToken || (!chatId && activeRecipientCount === 0)) {
      toast({ title: 'Simpan Bot Token dan minimal satu penerima Telegram dulu!', type: 'error' })
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/report/cron-telegram')
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setLastSent(json.sentAt ?? new Date().toISOString())
      toast({ title: '📊 Laporan harian berhasil dikirim ke Telegram!', type: 'success' })
    } catch (err: any) {
      toast({ title: `❌ ${err.message || 'Gagal kirim laporan'}`, type: 'error' })
    } finally { setSending(false) }
  }

  if (fetching) return (
    <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
      <Loader2 size={14} className="animate-spin" /> Memuat konfigurasi...
    </div>
  )

  const activeRecipientCount = recipients.filter(r => r.isActive).length
  const hasTelegramTarget = Boolean(botToken && (chatId || activeRecipientCount > 0))
  const formatDateTime = (value?: string | null) => {
    if (!value) return 'Belum ada'
    return new Date(value).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  }
  const healthStale = !!health && !health.scheduler.alive
  const dailyScheduleLabel = health?.reports.daily.schedule
    ? `${String(health.reports.daily.schedule.hour).padStart(2, '0')}:${String(health.reports.daily.schedule.minute).padStart(2, '0')} WIB`
    : `${String(schedHour).padStart(2, '0')}:${String(schedMinute).padStart(2, '0')} WIB`
  const weeklyScheduleLabel = health?.reports.weekly.schedule
    ? `Senin ${String(health.reports.weekly.schedule.hour).padStart(2, '0')}:${String(health.reports.weekly.schedule.minute).padStart(2, '0')} WIB`
    : `Senin ${String(weeklySchedHour).padStart(2, '0')}:${String(weeklySchedMinute).padStart(2, '0')} WIB`

  return (
    <div className="mt-8 pt-8 border-t border-zinc-800">
      <div className="flex items-center gap-2 mb-2">
        <Bell size={16} className="text-sky-400" />
        <h2 className="text-sm font-semibold text-zinc-200">Notifikasi Telegram</h2>
        <span className="text-[10px] bg-sky-900/40 border border-sky-700/50 text-sky-300 rounded px-2 py-0.5">Tanpa n8n</span>
      </div>
      <p className="text-xs text-zinc-500 mb-5">
        Laporan harian otomatis langsung dari aplikasi ke Telegram kamu — tidak perlu n8n lagi.
      </p>

      <div className={`rounded-xl border p-4 mb-5 ${healthError || healthStale ? 'bg-red-950/20 border-red-800/50' : 'bg-zinc-900 border-zinc-800'}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {healthError || healthStale ? (
              <AlertTriangle size={16} className="text-red-400" />
            ) : (
              <Activity size={16} className="text-emerald-400" />
            )}
            <div>
              <p className="text-sm font-semibold text-zinc-200">System Health</p>
              <p className={`text-xs mt-0.5 ${healthError || healthStale ? 'text-red-300' : 'text-zinc-500'}`}>
                {healthError
                  ? 'Status sistem gagal dibaca dari server.'
                  : healthStale
                    ? 'Scheduler terdeteksi stale atau tidak mengirim heartbeat.'
                    : 'Scheduler dan auto-report sedang berjalan normal.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadHealth(true)}
            disabled={refreshingHealth || loadingHealth}
            className="flex items-center gap-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 text-zinc-200 rounded-lg px-3 py-2 transition-colors"
          >
            <RefreshCw size={12} className={refreshingHealth || loadingHealth ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {loadingHealth ? (
          <div className="flex items-center gap-2 text-zinc-500 text-sm py-1">
            <Loader2 size={14} className="animate-spin" /> Memuat status sistem...
          </div>
        ) : healthError ? (
          <p className="text-xs text-red-300">{healthError}</p>
        ) : health ? (
          <div className="grid gap-2 text-xs text-zinc-300">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
                <p className="text-zinc-500 mb-1">Scheduler</p>
                <p className={health.scheduler.alive ? 'text-emerald-300 font-medium' : 'text-red-300 font-medium'}>
                  {health.scheduler.alive ? 'Alive' : 'Stale'}
                </p>
              </div>
              <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
                <p className="text-zinc-500 mb-1">Heartbeat Terakhir</p>
                <p className="font-medium text-zinc-200">{formatDateTime(health.scheduler.heartbeatAt)}</p>
              </div>
            </div>

            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
              <p className="text-zinc-500 mb-1">Jadwal Aktif</p>
              <p className="font-medium text-zinc-200">Daily: {dailyScheduleLabel}</p>
              <p className="font-medium text-zinc-200">Weekly: {weeklyScheduleLabel}</p>
            </div>

            <div className="rounded-lg bg-zinc-950/60 border border-zinc-800 px-3 py-2">
              <p className="text-zinc-500 mb-1">Laporan Terakhir</p>
              <p className="text-zinc-200">Daily: {formatDateTime(health.reports.daily.lastSentAt)}</p>
              <p className="text-zinc-200">Weekly: {formatDateTime(health.reports.weekly.lastSentAt)}</p>
              <p className="text-zinc-200">Monthly: {formatDateTime(health.reports.monthly.lastSentAt)}</p>
            </div>
          </div>
        ) : null}
      </div>

      {/* 2-column grid: Config (kiri) + Auto Report (kanan) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* ── Kiri: Konfigurasi Bot + Penerima ── */}
        <div className="space-y-5">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-400 space-y-1.5">
            <p className="text-zinc-300 font-medium mb-2">Cara dapat Chat ID &amp; Bot Token:</p>
            <p>1. Buat bot: chat <span className="text-sky-400 font-mono">@BotFather</span> → /newbot → copy <strong className="text-zinc-200">Bot Token</strong></p>
            <p>2. Chat ke bot, buka <span className="font-mono text-sky-400">https://api.telegram.org/bot[TOKEN]/getUpdates</span></p>
            <p>3. Lihat <span className="font-mono text-zinc-300">"chat":{'{'}"id": 12345678{'}'}</span> → itu <strong className="text-zinc-200">Chat ID</strong> kamu</p>
            <p className="text-zinc-500 italic">Atau pakai <span className="text-sky-400">@userinfobot</span> — forward pesan ke sana.</p>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Bot Token</label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={botToken}
                  onChange={e => setBotToken(e.target.value)}
                  placeholder="1234567890:ABCdef..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 pr-9 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                >
                  {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Chat ID (nomor negatif untuk grup)</label>
              <input
                type="text"
                value={chatId}
                onChange={e => setChatId(e.target.value)}
                placeholder="123456789 atau -100123456789"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600 font-mono"
              />
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Settings size={14} />}
                {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
              </button>

              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !botToken || !chatId}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 disabled:opacity-40 text-zinc-200 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                {testing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} className="text-emerald-400" />}
                {testing ? 'Mengirim...' : 'Test Koneksi'}
              </button>

              <button
                type="button"
                onClick={handleSendNow}
                disabled={sending || !hasTelegramTarget}
                className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? 'Mengirim Laporan...' : 'Kirim Laporan Sekarang'}
              </button>
            </div>
          </form>

        </div>

        {/* ── Kanan: Auto Report Schedule ── */}
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-200">Auto Report Harian</span>
                <span className={`text-[10px] rounded px-2 py-0.5 ${autoEnabled ? 'bg-emerald-900/40 border border-emerald-700/50 text-emerald-300' : 'bg-zinc-800 border border-zinc-700 text-zinc-500'}`}>
                  {autoEnabled ? 'AKTIF' : 'NONAKTIF'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleAuto}
                disabled={togglingAuto || !hasTelegramTarget}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${autoEnabled ? 'bg-emerald-600' : 'bg-zinc-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {lastSent && (
              <p className="text-[10px] text-zinc-600 mb-3">
                Terakhir dikirim: {new Date(lastSent).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
            <p className="text-xs text-zinc-400 font-medium mb-2">Jam Kirim (WIB)</p>
            <div className="flex items-center gap-3">
              <select
                value={schedHour}
                onChange={e => setSchedHour(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                ))}
              </select>
              <span className="text-zinc-400 font-bold">:</span>
              <select
                value={schedMinute}
                onChange={e => setSchedMinute(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                ))}
              </select>
              <span className="text-xs text-zinc-500">WIB</span>
              <button
                type="button"
                onClick={handleSaveSchedule}
                disabled={savingSched}
                className="flex items-center gap-1.5 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-xs font-medium transition-colors"
              >
                {savingSched ? <Loader2 size={12} className="animate-spin" /> : null}
                {savingSched ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">Langsung aktif tanpa restart server.</p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-200">Auto Report Mingguan</span>
                <span className={`text-[10px] rounded px-2 py-0.5 ${weeklyAutoEnabled ? 'bg-emerald-900/40 border border-emerald-700/50 text-emerald-300' : 'bg-zinc-800 border border-zinc-700 text-zinc-500'}`}>
                  {weeklyAutoEnabled ? 'AKTIF' : 'NONAKTIF'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleWeeklyAuto}
                disabled={togglingWeeklyAuto || !hasTelegramTarget}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${weeklyAutoEnabled ? 'bg-emerald-600' : 'bg-zinc-700'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${weeklyAutoEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {lastWeeklySent && (
              <p className="text-[10px] text-zinc-600 mb-3">
                Terakhir dikirim: {new Date(lastWeeklySent).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'short' })}
              </p>
            )}
            <p className="text-xs text-zinc-400 font-medium mb-2">Jam Kirim (Senin, WIB)</p>
            <div className="flex items-center gap-3">
              <select
                value={weeklySchedHour}
                onChange={e => setWeeklySchedHour(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>{String(i).padStart(2, '0')}</option>
                ))}
              </select>
              <span className="text-zinc-400 font-bold">:</span>
              <select
                value={weeklySchedMinute}
                onChange={e => setWeeklySchedMinute(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
              >
                {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                  <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
                ))}
              </select>
              <span className="text-xs text-zinc-500">WIB</span>
              <button
                type="button"
                onClick={handleSaveWeeklySchedule}
                disabled={savingWeeklySched}
                className="flex items-center gap-1.5 bg-sky-700 hover:bg-sky-600 disabled:opacity-50 text-white rounded-lg px-3 py-2 text-xs font-medium transition-colors"
              >
                {savingWeeklySched ? <Loader2 size={12} className="animate-spin" /> : null}
                {savingWeeklySched ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-2">Selalu dikirim hari Senin.</p>
          </div>
        </div>

      </div>{/* end 2-column grid */}

      {/* Daftar Penerima Laporan — full width di bawah grid */}
      <div className="mt-5 pt-5 border-t border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-zinc-400 font-medium">
                📬 Penerima Laporan
                {recipients.length > 0 && (
                  <span className="ml-2 text-[10px] text-zinc-600">
                    {recipients.filter(r => r.isActive).length} aktif dari {recipients.length}
                  </span>
                )}
              </p>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                1 grup bisa punya beberapa penerima dengan <strong>Topic ID</strong> berbeda. Pilih tipe laporan tiap penerima supaya Harian / Mingguan / Bulanan tidak tercampur.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(v => !v)}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 transition-colors"
            >
              {showAddForm ? '✕ Batal' : '+ Tambah'}
            </button>
          </div>

          {/* Form tambah recipient */}
          {showAddForm && (
            <form onSubmit={handleAddRecipient} className="bg-zinc-900 border border-zinc-700 rounded-xl p-3 mb-3 space-y-2">
              <input
                type="text"
                placeholder="Nama (misal: Owner, Group Laporan)"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
              />
              <input
                type="text"
                placeholder="Chat ID (misal: 565228988 atau -100123456789 untuk grup)"
                value={newChatId}
                onChange={e => setNewChatId(e.target.value)}
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-sky-600"
              />
              <div>
                <input
                  type="text"
                  placeholder="Thread/Topic ID — opsional, hanya untuk grup dengan Topics"
                  value={newThreadId}
                  onChange={e => setNewThreadId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-sky-600"
                />
                <p className="text-[10px] text-zinc-600 mt-1">
                  Cara dapat Thread ID: buka topic di grup → klik kanan → Copy Link → angka di akhir URL
                </p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-500 mb-1.5">Laporan yang dikirim ke sini:</p>
                <div className="flex flex-wrap gap-1.5">
                  {REPORT_TYPES.map(t => {
                    const active = newReportTypes.includes(t.key)
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => toggleReportType(newReportTypes, t.key, setNewReportTypes)}
                        className={`text-[10px] rounded-full px-2.5 py-1 border transition-colors ${active ? 'bg-sky-700 border-sky-600 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}
                      >
                        {t.label}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-zinc-600 mt-1">
                  Kosong = terima semua laporan. Pilih supaya laporan tidak tercampur antar topic.
                </p>
              </div>
              <button
                type="submit"
                disabled={addingRecipient}
                className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-xs font-medium"
              >
                {addingRecipient ? <Loader2 size={11} className="animate-spin" /> : null}
                {addingRecipient ? 'Menambahkan...' : 'Tambahkan'}
              </button>
            </form>
          )}

          {/* List recipients */}
          {loadingRecipients ? (
            <div className="flex items-center gap-2 text-zinc-600 text-xs py-2">
              <Loader2 size={12} className="animate-spin" /> Memuat...
            </div>
          ) : recipients.length === 0 ? (
            <div className="text-xs text-zinc-600 py-3 text-center border border-dashed border-zinc-800 rounded-lg">
              Belum ada penerima. Klik <strong>+ Tambah</strong> untuk menambahkan.<br />
              <span className="text-[10px]">Jika kosong, laporan dikirim ke Chat ID di atas (konfigurasi lama).</span>
            </div>
          ) : (
            <div className="space-y-2">
              {recipients.map(r => {
                const types = parseTypes(r.reportTypes)
                const isEditing = editingId === r.id
                return (
                <div key={r.id} className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nama"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-sky-600"
                      />
                      <input
                        type="text" value={editChatId} onChange={e => setEditChatId(e.target.value)} placeholder="Chat ID"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-sky-600"
                      />
                      <input
                        type="text" value={editThreadId} onChange={e => setEditThreadId(e.target.value)}
                        placeholder="Thread/Topic ID (angka di akhir link topic)"
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-sm text-zinc-200 font-mono focus:outline-none focus:border-sky-600"
                      />
                      <p className="text-[10px] text-zinc-600">
                        Buka topic di grup → klik ⋮ → Copy Link → angka di akhir URL.<br/>
                        Setelah simpan, klik <strong className="text-sky-400">✉ Test</strong> untuk cek pesan masuk di topic yang benar.
                      </p>
                      <div>
                        <p className="text-[10px] text-zinc-500 mb-1.5">Laporan ke sini:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {REPORT_TYPES.map(t => {
                            const active = editReportTypes.includes(t.key)
                            return (
                              <button
                                key={t.key} type="button"
                                onClick={() => toggleReportType(editReportTypes, t.key, setEditReportTypes)}
                                className={`text-[10px] rounded-full px-2.5 py-1 border transition-colors ${active ? 'bg-sky-700 border-sky-600 text-white' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}
                              >
                                {t.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button" onClick={() => handleSaveEdit(r.id)} disabled={savingEdit}
                          className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-xs font-medium"
                        >
                          {savingEdit ? <Loader2 size={11} className="animate-spin" /> : null}
                          {savingEdit ? 'Menyimpan...' : 'Simpan'}
                        </button>
                        <button
                          type="button" onClick={cancelEdit}
                          className="text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5"
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      {/* Status dot */}
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.isActive ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-zinc-200 truncate">{r.name}</p>
                        <p className="text-[10px] text-zinc-500 font-mono truncate">
                          {r.chatId}
                        </p>
                        {r.threadId ? (
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono bg-sky-900/30 border border-sky-700/40 text-sky-300 rounded px-2 py-0.5 hover:bg-sky-800/40 transition-colors cursor-pointer"
                            title="Klik untuk ubah Topic ID"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
                            Topic: {r.threadId}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(r)}
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-sky-400 border border-dashed border-zinc-700 rounded px-2 py-0.5 transition-colors cursor-pointer"
                            title="Klik untuk set Topic ID"
                          >
                            + Set Topic
                          </button>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {types.length === 0 ? (
                            <span className="text-[9px] bg-zinc-800 border border-zinc-700 text-zinc-500 rounded-full px-1.5 py-0.5">semua laporan</span>
                          ) : (
                            REPORT_TYPES.filter(t => types.includes(t.key)).map(t => (
                              <span key={t.key} className="text-[9px] bg-sky-900/40 border border-sky-700/50 text-sky-300 rounded-full px-1.5 py-0.5">{t.label}</span>
                            ))
                          )}
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleTestRecipient(r.id, r.name)}
                          disabled={testingId === r.id}
                          title="Kirim pesan test ke topic ini"
                          className="text-[10px] text-sky-400 hover:text-sky-300 bg-sky-900/30 border border-sky-700/40 px-2 py-1 rounded transition-colors disabled:opacity-40"
                        >
                          {testingId === r.id ? <Loader2 size={10} className="animate-spin inline" /> : '✉'} Test
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleRecipient(r.id, r.isActive)}
                          title={r.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${r.isActive ? 'bg-emerald-600' : 'bg-zinc-700'}`}
                        >
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${r.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRecipient(r.id, r.name)}
                          title="Hapus"
                          className="text-zinc-600 hover:text-red-400 px-1 py-1 rounded transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}
