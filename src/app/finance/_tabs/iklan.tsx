'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah, todayWIBStr, wibMonthStartStr } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import {
  ArrowDownToLine, TrendingUp, Megaphone, RefreshCw, Clock,
  ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, History
} from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-white' }: {
  label: string; value: string; sub?: string; color?: string
}) {
  return (
    <div className="stat-card">
      <p className="text-zinc-500 text-xs mb-1">{label}</p>
      <p className={`font-bold text-lg ${color}`}>{value}</p>
      {sub && <p className="text-zinc-600 text-xs mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export function IklanTab() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const [mode, setMode]         = useState<'deposit' | 'spending'>('spending')
  const [adsWalletId, setAdsWalletId] = useState('')
  const [srcWalletId, setSrcWalletId] = useState('')
  const [date, setDate]         = useState(todayWIBStr())
  const [amount, setAmount]     = useState('')
  const [note, setNote]         = useState('')
  const [loading, setLoading]   = useState(false)

  // Semua wallet
  const { data: allWallets = [] } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallet').then(r => r.json()).then(d => d.data ?? []),
  })

  // Wallet yang ditandai ads budget
  const adsWallets: any[] = allWallets.filter((w: any) => w.isAdsBudget && w.isActive)
  // Wallet sumber (bukan ads wallet)
  const srcWallets: any[] = allWallets.filter((w: any) => !w.isAdsBudget && w.isActive)

  // Data ROAS bulan ini per ads wallet — dari dashboard stats (bulan ini)
  const monthStart = wibMonthStartStr()
  const { data: dashData } = useQuery({
    queryKey: ['dashboard-stats-iklan', monthStart],
    queryFn: () => fetch(`/api/dashboard/stats?dateFrom=${monthStart}&dateTo=${todayWIBStr()}`).then(r => r.json()).then(d => d.data),
  })

  // Riwayat ledger untuk wallet iklan yang dipilih
  const [historyPage, setHistoryPage] = useState(1)
  const [histDateFrom, setHistDateFrom] = useState('')
  const [histDateTo, setHistDateTo] = useState('')
  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['wallet-ledger', adsWalletId, historyPage, histDateFrom, histDateTo],
    queryFn: () => {
      if (!adsWalletId) return { entries: [], total: 0 }
      const p = new URLSearchParams({ walletId: adsWalletId, page: String(historyPage), limit: '15' })
      if (histDateFrom) p.set('dateFrom', histDateFrom)
      if (histDateTo) p.set('dateTo', histDateTo)
      return fetch(`/api/wallet/ledger?${p}`).then(r => r.json()).then(d => d.data ?? { entries: [], total: 0 })
    },
    enabled: !!adsWalletId,
    staleTime: 15_000,
  })

  // Map platform → adSpend + roas dari dashboard
  const platformMap = new Map<string, { adSpend: number; roas: string; omzet: number }>(
    (dashData?.omzet?.byPlatform ?? []).map((p: any) => [
      (p.platform || '').toLowerCase(),
      { adSpend: p.adSpend, roas: p.roas, omzet: p.realOmzet },
    ])
  )

  // Submit deposit (TRANSFER dari src → ads wallet)
  const handleDeposit = async () => {
    if (!adsWalletId || !srcWalletId || !amount) {
      toast({ title: 'Lengkapi semua field', type: 'error' }); return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/wallet/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: srcWalletId,
          trxDate: date,
          trxType: 'TRANSFER',
          category: 'Top-up Iklan',
          amount: parseInt(amount, 10),
          note: note || `Top-up ke ${adsWallets.find(w => w.id === adsWalletId)?.name}`,
          destWalletId: adsWalletId,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ title: 'Deposit berhasil dicatat ✅', type: 'success' })
      setAmount(''); setNote('')
      qc.invalidateQueries({ queryKey: ['wallets'] })
      qc.invalidateQueries({ queryKey: ['wallet-ledger'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats-iklan'] })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(false) }
  }

  // Submit spending (EXPENSE dari ads wallet)
  const handleSpending = async () => {
    if (!adsWalletId || !amount) {
      toast({ title: 'Pilih platform dan masukkan jumlah', type: 'error' }); return
    }
    setLoading(true)
    try {
      const platform = adsWallets.find(w => w.id === adsWalletId)?.linkedPlatform ?? ''
      const res = await fetch('/api/wallet/ledger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: adsWalletId,
          trxDate: date,
          trxType: 'EXPENSE',
          category: `Iklan ${platform}`,
          amount: parseInt(amount, 10),
          note: note || `Spending iklan ${date}`,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ title: 'Spending iklan berhasil dicatat ✅', type: 'success' })
      setAmount(''); setNote('')
      qc.invalidateQueries({ queryKey: ['wallets'] })
      qc.invalidateQueries({ queryKey: ['wallet-ledger'] })
      qc.invalidateQueries({ queryKey: ['dashboard-stats-iklan'] })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(false) }
  }

  const selectedAds = adsWallets.find(w => w.id === adsWalletId)
  const platformKey = (selectedAds?.linkedPlatform ?? '').toLowerCase()
  const roasData    = platformMap.get(platformKey)

  return (
    <div className="space-y-6">

      {/* ── Kartu per Ads Wallet ─────────────────────────────────────────── */}
      {adsWallets.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <Megaphone size={32} className="text-zinc-700 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Belum ada wallet iklan yang dikonfigurasi.</p>
          <p className="text-zinc-600 text-xs mt-1">
            Buka tab <b>Wallet & Ledger</b> → <b>Kelola Wallet</b> → centang "Wallet Iklan (Ads)" pada wallet yang digunakan untuk iklan.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {adsWallets.map((w: any) => {
            const pk   = (w.linkedPlatform ?? '').toLowerCase()
            const rd   = platformMap.get(pk)
            const saldo = w.balance ?? 0
            return (
              <div key={w.id} className={`bg-zinc-900 border rounded-xl p-4 space-y-3 cursor-pointer transition-all
                ${adsWalletId === w.id ? 'border-emerald-600 ring-1 ring-emerald-600/30' : 'border-zinc-800 hover:border-zinc-700'}`}
                onClick={() => setAdsWalletId(w.id)}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-white">{w.name}</p>
                  <span className="text-[10px] bg-emerald-900/50 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded">
                    {w.linkedPlatform}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-0.5">Saldo Ads</p>
                    <p className={`text-sm font-bold ${saldo >= 0 ? 'text-white' : 'text-red-400'}`}>
                      {formatRupiah(saldo, true)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-0.5">ROAS (bulan ini)</p>
                    <p className={`text-sm font-bold ${rd && rd.roas !== '0' ? 'text-emerald-400' : 'text-zinc-600'}`}>
                      {rd && rd.roas !== '0' ? `${rd.roas}x` : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-0.5">Ad Spend</p>
                    <p className="text-xs text-zinc-400">{rd ? formatRupiah(rd.adSpend, true) : '—'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-0.5">Omzet</p>
                    <p className="text-xs text-zinc-400">{rd ? formatRupiah(rd.omzet, true) : '—'}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Form Catat ───────────────────────────────────────────────────── */}
      {adsWallets.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">

          {/* Mode toggle */}
          <div className="flex gap-1 bg-zinc-800 rounded-lg p-1 mb-5 w-fit">
            <button onClick={() => setMode('spending')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all
                ${mode === 'spending' ? 'bg-red-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <TrendingUp size={13} /> Catat Spending
            </button>
            <button onClick={() => setMode('deposit')}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all
                ${mode === 'deposit' ? 'bg-emerald-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <ArrowDownToLine size={13} /> Deposit / Top-up
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Platform / Wallet Ads */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                {mode === 'spending' ? 'Platform Iklan' : 'Wallet Iklan (tujuan)'}
              </label>
              <select value={adsWalletId} onChange={e => setAdsWalletId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50">
                <option value="">Pilih platform...</option>
                {adsWallets.map((w: any) => (
                  <option key={w.id} value={w.id}>{w.linkedPlatform} ({w.name})</option>
                ))}
              </select>
            </div>

            {/* Sumber wallet — hanya untuk deposit */}
            {mode === 'deposit' && (
              <div>
                <label className="block text-xs text-zinc-500 mb-1">Sumber Dana</label>
                <select value={srcWalletId} onChange={e => setSrcWalletId(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50">
                  <option value="">Dari wallet mana?</option>
                  {srcWallets.map((w: any) => (
                    <option key={w.id} value={w.id}>{w.name} ({formatRupiah(w.balance, true)})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Tanggal */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Tanggal</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
            </div>

            {/* Jumlah */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Jumlah {mode === 'spending' ? 'Spending (Rp)' : 'Deposit (Rp)'}
              </label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0" min="1"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" />
              {amount && (
                <p className="text-[10px] text-zinc-600 mt-1">
                  {mode === 'spending' ? '← Keluar dari' : '→ Masuk ke'} saldo ads · {formatRupiah(parseInt(amount) || 0, true)}
                </p>
              )}
            </div>

            {/* Catatan */}
            <div className={mode === 'deposit' ? 'sm:col-span-2' : ''}>
              <label className="block text-xs text-zinc-500 mb-1">Catatan (opsional)</label>
              <input type="text" value={note} onChange={e => setNote(e.target.value)}
                placeholder={mode === 'spending' ? 'cth: Iklan produk baru' : 'cth: Top-up bulan Mei'}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500/50" />
            </div>
          </div>

          {/* Preview saldo */}
          {selectedAds && amount && (
            <div className="mt-4 bg-zinc-800/60 border border-zinc-700/50 rounded-lg px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-zinc-500">Saldo {selectedAds.linkedPlatform} setelah ini</p>
                <p className="text-sm font-bold text-white">
                  {formatRupiah(
                    (selectedAds.balance ?? 0) + (mode === 'deposit' ? 1 : -1) * (parseInt(amount) || 0),
                    true
                  )}
                </p>
              </div>
              <p className="text-xs text-zinc-600">
                Sekarang: {formatRupiah(selectedAds.balance ?? 0, true)}
              </p>
            </div>
          )}

          <button
            onClick={mode === 'deposit' ? handleDeposit : handleSpending}
            disabled={loading || !adsWalletId || !amount || (mode === 'deposit' && !srcWalletId)}
            className={`w-full mt-4 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-40 transition-all flex items-center justify-center gap-2
              ${mode === 'spending'
                ? 'bg-red-700 hover:bg-red-600 text-white'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white'}`}>
            {loading
              ? <><RefreshCw size={14} className="animate-spin" /> Menyimpan...</>
              : mode === 'spending'
                ? <><TrendingUp size={14} /> Simpan Spending Iklan</>
                : <><ArrowDownToLine size={14} /> Simpan Deposit</>
            }
          </button>
        </div>
      )}

      {/* ── Riwayat Transaksi ────────────────────────────────────────────── */}
      {adsWalletId && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <History size={15} className="text-zinc-400" />
              Riwayat Transaksi
              {selectedAds && <span className="text-zinc-600 font-normal">· {selectedAds.linkedPlatform}</span>}
            </h3>
          </div>

          {/* Filter tanggal */}
          <div className="flex items-center gap-2 mb-4">
            <input type="date" value={histDateFrom} onChange={e => { setHistDateFrom(e.target.value); setHistoryPage(1) }}
              placeholder="Dari tanggal"
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
            <span className="text-zinc-600 text-xs">s/d</span>
            <input type="date" value={histDateTo} onChange={e => { setHistDateTo(e.target.value); setHistoryPage(1) }}
              placeholder="Sampai tanggal"
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
            {(histDateFrom || histDateTo) && (
              <button onClick={() => { setHistDateFrom(''); setHistDateTo(''); setHistoryPage(1) }}
                className="text-[10px] text-zinc-600 hover:text-zinc-300 transition-colors">
                Reset
              </button>
            )}
          </div>

          {ledgerLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-zinc-600">
              <RefreshCw size={14} className="animate-spin" />
              <span className="text-xs">Memuat riwayat...</span>
            </div>
          ) : (ledgerData?.entries?.length ?? 0) === 0 ? (
            <div className="text-center py-8">
              <Clock size={24} className="text-zinc-700 mx-auto mb-2" />
              <p className="text-xs text-zinc-600">Belum ada transaksi</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-2 text-zinc-500 font-medium">Tanggal</th>
                      <th className="text-left py-2 px-2 text-zinc-500 font-medium">Tipe</th>
                      <th className="text-left py-2 px-2 text-zinc-500 font-medium">Kategori</th>
                      <th className="text-right py-2 px-2 text-zinc-500 font-medium">Jumlah</th>
                      <th className="text-left py-2 px-2 text-zinc-500 font-medium hidden sm:table-cell">Catatan</th>
                      <th className="text-left py-2 px-2 text-zinc-500 font-medium hidden md:table-cell">Oleh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ledgerData?.entries ?? []).map((e: any) => {
                      const amt = Number(e.amount) || 0
                      const isPositive = amt >= 0
                      return (
                        <tr key={e.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                          <td className="py-2 px-2 text-zinc-400 whitespace-nowrap">
                            {new Date(e.trxDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })}
                          </td>
                          <td className="py-2 px-2">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              e.trxType === 'TRANSFER'
                                ? 'bg-blue-900/30 text-blue-400'
                                : e.trxType === 'EXPENSE'
                                  ? 'bg-red-900/30 text-red-400'
                                  : 'bg-emerald-900/30 text-emerald-400'
                            }`}>
                              {e.trxType === 'EXPENSE' ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                              {e.trxType}
                            </span>
                          </td>
                          <td className="py-2 px-2 text-zinc-400 truncate max-w-[160px]">
                            {e.category || '—'}
                          </td>
                          <td className={`py-2 px-2 text-right font-medium whitespace-nowrap ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                            {isPositive ? '+' : ''}{formatRupiah(amt, true)}
                          </td>
                          <td className="py-2 px-2 text-zinc-600 truncate max-w-[200px] hidden sm:table-cell">
                            {e.note || '—'}
                          </td>
                          <td className="py-2 px-2 text-zinc-600 hidden md:table-cell">
                            {e.createdBy || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {ledgerData && ledgerData.total > 15 && (
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-zinc-800">
                  <p className="text-[10px] text-zinc-600">
                    {ledgerData.total} transaksi · Hal {historyPage} / {Math.ceil(ledgerData.total / 15)}
                  </p>
                  <div className="flex gap-1">
                    <button onClick={() => setHistoryPage(p => Math.max(1, p - 1))} disabled={historyPage === 1}
                      className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors">
                      <ChevronLeft size={14} />
                    </button>
                    <button onClick={() => setHistoryPage(p => p + 1)} disabled={historyPage >= Math.ceil(ledgerData.total / 15)}
                      className="p-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white disabled:opacity-30 transition-colors">
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

    </div>
  )
}
