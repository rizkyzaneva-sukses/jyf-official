'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah, wibPresetRange } from '@/lib/utils'
import {
  GitCompare, Scale, PackageSearch, ClipboardCheck,
  RefreshCw, Download, Info, Loader2, AlertTriangle,
} from 'lucide-react'

function getDefaultRange() {
  return wibPresetRange('month')
}

function getLastMonthYm() {
  return wibPresetRange('lastmonth').from.slice(0, 7)
}

export function ToolsTab() {
  const def = getDefaultRange()
  const [dateFrom, setDateFrom] = useState(def.from)
  const [dateTo, setDateTo] = useState(def.to)
  const [sub, setSub] = useState<'cashops' | 'reconcile' | 'sku' | 'closing' | 'velocity' | 'restore'>('cashops')
  const [closingMonth, setClosingMonth] = useState(getLastMonthYm())
  const [restoreBusy, setRestoreBusy] = useState(false)
  const [restoreResult, setRestoreResult] = useState<any>(null)
  const qc = useQueryClient()

  const { data: cashOps, isLoading: loadCash } = useQuery({
    queryKey: ['cash-vs-ops', dateFrom, dateTo],
    queryFn: () => fetch(`/api/reports/cash-vs-ops?dateFrom=${dateFrom}&dateTo=${dateTo}`).then(r => r.json()).then(d => d.data),
    enabled: sub === 'cashops',
  })

  const { data: recon, isLoading: loadRecon } = useQuery({
    queryKey: ['reconcile', dateFrom, dateTo],
    queryFn: () => fetch(`/api/reports/reconcile?dateFrom=${dateFrom}&dateTo=${dateTo}`).then(r => r.json()).then(d => d.data),
    enabled: sub === 'reconcile',
  })

  const { data: sku, isLoading: loadSku } = useQuery({
    queryKey: ['sku-profit', dateFrom, dateTo],
    queryFn: () => fetch(`/api/reports/sku-profit?dateFrom=${dateFrom}&dateTo=${dateTo}&limit=15`).then(r => r.json()).then(d => d.data),
    enabled: sub === 'sku',
  })

  const { data: closing, isLoading: loadClose } = useQuery({
    queryKey: ['closing', closingMonth],
    queryFn: () => fetch(`/api/closing/checklist?month=${closingMonth}`).then(r => r.json()).then(d => d.data),
    enabled: sub === 'closing',
  })

  const { data: velocity, isLoading: loadVel } = useQuery({
    queryKey: ['velocity'],
    queryFn: () => fetch('/api/inventory/velocity?days=30').then(r => r.json()).then(d => d.data),
    enabled: sub === 'velocity',
  })

  const { data: restoreHint } = useQuery({
    queryKey: ['restore-trx-hint'],
    queryFn: () => fetch('/api/orders/restore-trx-date').then(r => r.json()).then(d => d.data),
    enabled: sub === 'restore',
  })

  const runRestore = async (dryRun: boolean) => {
    setRestoreBusy(true)
    try {
      const res = await fetch('/api/orders/restore-trx-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun, limit: 20000 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal')
      setRestoreResult(json.data)
      if (!dryRun) qc.invalidateQueries({ queryKey: ['restore-trx-hint'] })
    } catch (e: any) {
      setRestoreResult({ error: e.message })
    } finally {
      setRestoreBusy(false)
    }
  }

  const tabs = [
    { id: 'cashops', label: 'Cash vs Ops', icon: Scale },
    { id: 'reconcile', label: 'Rekonsiliasi', icon: GitCompare },
    { id: 'sku', label: 'SKU Profit Kas', icon: PackageSearch },
    { id: 'closing', label: 'Closing Bulanan', icon: ClipboardCheck },
    { id: 'velocity', label: 'Saran PO', icon: RefreshCw },
    { id: 'restore', label: 'Restore trx_date', icon: AlertTriangle },
  ] as const

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
          <span className="text-zinc-600 text-sm">—</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
        </div>
        <a
          href={`/api/reports/pl/export?dateFrom=${dateFrom}&dateTo=${dateTo}`}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-emerald-900/40 text-emerald-400 border border-emerald-800 hover:bg-emerald-900/60"
        >
          <Download size={12} /> Export Laba Rugi CSV
        </a>
        <p className="text-[11px] text-zinc-600 flex items-center gap-1">
          <Info size={10} /> Iklan = EXPENSE wallet Ads · PENJUALAN L/R = tanggal cair
        </p>
      </div>

      <div className="flex gap-1 border-b border-zinc-800 pb-2 overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} type="button" onClick={() => setSub(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${
                sub === t.id ? 'bg-emerald-900/30 text-emerald-400' : 'text-zinc-500 hover:bg-zinc-800'
              }`}>
              <Icon size={12} />{t.label}
            </button>
          )
        })}
      </div>

      {sub === 'cashops' && (
        loadCash ? <Loader /> : cashOps && (
          <div className="grid md:grid-cols-2 gap-4">
            <Panel title="OPS — Order masuk" sub={cashOps.ops.label}>
              <Row k="Paket" v={String(cashOps.ops.paket)} />
              <Row k="Omzet ops" v={formatRupiah(cashOps.ops.omzet)} />
              <Row k="HPP" v={formatRupiah(cashOps.ops.hpp)} />
              <Row k="GP ops" v={formatRupiah(cashOps.ops.grossProfit)} accent />
              <Row k="Iklan" v={`${formatRupiah(cashOps.ops.iklan)} (${cashOps.ops.iklanPctOmzet}%)`} />
            </Panel>
            <Panel title="KAS — Laba Rugi" sub={cashOps.cash.label}>
              <Row k="Pencairan bersih" v={formatRupiah(cashOps.cash.pencairanBersih)} />
              <Row k="HPP (cair, non-retur)" v={formatRupiah(cashOps.cash.hpp)} />
              <Row k="Laba kotor" v={formatRupiah(cashOps.cash.labaKotor)} accent />
              <Row k="OPEX" v={formatRupiah(cashOps.cash.bebanOperasional)} />
              <Row k="Iklan / % pencairan" v={`${formatRupiah(cashOps.cash.iklan)} (${cashOps.cash.iklanPctPencairan}%)`} />
              <Row k="Laba bersih" v={formatRupiah(cashOps.cash.labaBersih)} accent />
            </Panel>
            <div className="md:col-span-2 text-xs text-zinc-500 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
              Gap omzet ops − pencairan: <b className="text-zinc-300">{formatRupiah(cashOps.gap.omzetOpsMinusPencairan)}</b>
              {' — '}{cashOps.gap.note}
            </div>
          </div>
        )
      )}

      {sub === 'reconcile' && (
        loadRecon ? <Loader /> : recon && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="Order masuk" value={recon.summary.ordersMasukPaket} />
              <Stat label="Sudah cair" value={recon.summary.ordersSudahCair} />
              <Stat label="Belum cair" value={recon.summary.ordersBelumCair} warn />
              <Stat label="Payout yatim" value={recon.summary.orphanPayoutCount} warn={recon.summary.orphanPayoutCount > 0} />
              <Stat label="Settlement −" value={recon.summary.negativePayoutCount} />
              <Stat label="Retur + payout +" value={recon.summary.returWithPositivePayout} warn={recon.summary.returWithPositivePayout > 0} />
              <Stat label="Pencairan" value={formatRupiah(recon.summary.pencairanTotal)} />
              <Stat label="Omzet ops" value={formatRupiah(recon.summary.omzetOps)} />
            </div>
            <Table title="Order belum cair (top 50)" rows={recon.unpaidOrders} cols={[
              { k: 'orderNo', l: 'Order' }, { k: 'platform', l: 'Platform' }, { k: 'status', l: 'Status' },
              { k: 'omzet', l: 'Omzet', money: true },
            ]} />
            <Table title="Payout tanpa order" rows={recon.orphanPayouts} cols={[
              { k: 'orderNo', l: 'Order' }, { k: 'platform', l: 'Platform' },
              { k: 'totalIncome', l: 'Income', money: true },
            ]} />
            <ul className="text-[11px] text-zinc-600 space-y-1">
              {(recon.notes || []).map((n: string, i: number) => <li key={i}>• {n}</li>)}
            </ul>
          </div>
        )
      )}

      {sub === 'sku' && (
        loadSku ? <Loader /> : sku && (
          <div className="grid md:grid-cols-2 gap-4">
            <Table title="Top margin (kas)" rows={sku.top} cols={[
              { k: 'sku', l: 'SKU' }, { k: 'qty', l: 'Qty' },
              { k: 'revenue', l: 'Revenue', money: true }, { k: 'margin', l: 'Margin', money: true },
              { k: 'marginPct', l: '%' },
            ]} />
            <Table title="Bottom margin" rows={sku.bottom} cols={[
              { k: 'sku', l: 'SKU' }, { k: 'qty', l: 'Qty' },
              { k: 'revenue', l: 'Revenue', money: true }, { k: 'margin', l: 'Margin', money: true },
            ]} />
            <p className="md:col-span-2 text-[11px] text-zinc-600">{sku.basis}</p>
          </div>
        )
      )}

      {sub === 'closing' && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500">Bulan</label>
            <input type="month" value={closingMonth} onChange={e => setClosingMonth(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300" />
          </div>
          {loadClose ? <Loader /> : closing && (
            <>
              <div className={`rounded-xl border p-4 ${closing.ready ? 'border-emerald-800 bg-emerald-900/20' : 'border-amber-800 bg-amber-900/20'}`}>
                <p className="text-sm font-semibold text-zinc-200">
                  {closing.ready ? '✓ Siap closing' : `⚠ ${closing.blocking} item perlu perhatian`} — {closing.dateFrom} s/d {closing.dateTo}
                </p>
                <p className="text-xs text-zinc-500 mt-1">
                  L/R preview: pencairan {formatRupiah(closing.plSummary.pencairanBersih)} · laba bersih {formatRupiah(closing.plSummary.labaBersih)}
                </p>
              </div>
              <div className="space-y-2">
                {closing.items.map((it: any) => (
                  <div key={it.id} className="flex items-start gap-3 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
                    <span className={`text-sm font-bold ${it.ok ? 'text-emerald-400' : it.info ? 'text-zinc-500' : 'text-amber-400'}`}>
                      {it.ok ? '✓' : it.info ? 'ℹ' : '!'}
                    </span>
                    <div>
                      <p className="text-sm text-zinc-200">{it.title}</p>
                      <p className="text-xs text-zinc-500">{it.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {sub === 'velocity' && (
        loadVel ? <Loader /> : velocity && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              Velocity {velocity.days} hari · {velocity.urgentCount} urgent · saran restock top {velocity.needRestock?.length ?? 0}
            </p>
            <div className="overflow-x-auto rounded-xl border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-900 text-zinc-500">
                  <tr>
                    <th className="text-left px-3 py-2">SKU</th>
                    <th className="text-right px-3 py-2">SOH</th>
                    <th className="text-right px-3 py-2">Vel/hari</th>
                    <th className="text-right px-3 py-2">Cover hari</th>
                    <th className="text-right px-3 py-2">Saran order</th>
                  </tr>
                </thead>
                <tbody>
                  {(velocity.needRestock || []).map((r: any) => (
                    <tr key={r.sku} className="border-t border-zinc-800/80">
                      <td className="px-3 py-2 text-zinc-300">
                        {r.urgent && <span className="text-amber-400 mr-1">!</span>}
                        {r.sku} <span className="text-zinc-600">{r.productName}</span>
                      </td>
                      <td className="text-right px-3 py-2">{r.soh}</td>
                      <td className="text-right px-3 py-2">{r.velocityPerDay}</td>
                      <td className="text-right px-3 py-2">{r.coverDays}</td>
                      <td className="text-right px-3 py-2 text-emerald-400 font-semibold">{r.suggestOrderQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {sub === 'restore' && (
        <div className="space-y-4 max-w-2xl">
          <div className="rounded-xl border border-amber-800/40 bg-amber-900/10 p-4 text-sm text-amber-100/80 space-y-2">
            <p className="font-semibold text-amber-300">Restore trx_date dari order_created_at</p>
            <p>Hanya OWNER. Default dry-run. Memperbaiki order yang sempat ditimpa tanggal cair (bug lama).</p>
            <p className="text-xs text-zinc-500">
              Hint: total order {restoreHint?.totalOrders ?? '—'} · possible overwrite ~{restoreHint?.possibleOverwriteHint ?? '—'}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={restoreBusy} onClick={() => runRestore(true)}
              className="px-4 py-2 rounded-lg text-sm bg-zinc-800 border border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50">
              {restoreBusy ? '…' : 'Dry-run audit'}
            </button>
            <button type="button" disabled={restoreBusy} onClick={() => {
              if (confirm('Eksekusi restore trx_date? Pastikan sudah dry-run.')) runRestore(false)
            }}
              className="px-4 py-2 rounded-lg text-sm bg-amber-900/50 border border-amber-700 text-amber-300 hover:bg-amber-900/70 disabled:opacity-50">
              Eksekusi restore
            </button>
          </div>
          {restoreResult && (
            <pre className="text-[11px] text-zinc-400 bg-zinc-950 border border-zinc-800 rounded-xl p-4 overflow-auto max-h-80">
              {JSON.stringify(restoreResult, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function Loader() {
  return <div className="flex items-center gap-2 text-zinc-500 text-sm py-10 justify-center"><Loader2 size={16} className="animate-spin" /> Memuat…</div>
}

function Panel({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-2">
      <p className="text-sm font-semibold text-zinc-200">{title}</p>
      {sub && <p className="text-[10px] text-zinc-600">{sub}</p>}
      {children}
    </div>
  )
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-zinc-500">{k}</span>
      <span className={accent ? 'text-emerald-400 font-semibold' : 'text-zinc-300'}>{v}</span>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-3">
      <p className="text-[10px] text-zinc-500">{label}</p>
      <p className={`text-lg font-bold ${warn ? 'text-amber-400' : 'text-zinc-200'}`}>{value}</p>
    </div>
  )
}

function Table({ title, rows, cols }: {
  title: string
  rows: any[]
  cols: { k: string; l: string; money?: boolean }[]
}) {
  if (!rows?.length) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-sm font-medium text-zinc-400 mb-1">{title}</p>
        <p className="text-xs text-zinc-600">Tidak ada data</p>
      </div>
    )
  }
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <p className="text-sm font-medium text-zinc-300 px-4 py-3 border-b border-zinc-800">{title}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-zinc-500">
            <tr>{cols.map(c => <th key={c.k} className="text-left px-3 py-2 font-medium">{c.l}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-zinc-800/60">
                {cols.map(c => (
                  <td key={c.k} className="px-3 py-2 text-zinc-300">
                    {c.money ? formatRupiah(Number(r[c.k] ?? 0)) : String(r[c.k] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
