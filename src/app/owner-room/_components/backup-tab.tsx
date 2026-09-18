'use client'

import { useState } from 'react'
import { useToast } from '@/components/ui/toaster'
import { todayWIBStr } from '@/lib/utils'
import { Download, Loader2, Upload, CheckCircle2, AlertCircle, FileJson } from 'lucide-react'

interface ImportResult {
  inserted: number
  updated: number
  skipped: number
  total: number
  summary?: Record<string, { inserted: number; updated: number; skipped: number; total: number }>
}

function BackupEntityRow({ entityKey, label, desc, canImport }: {
  entityKey: string
  label: string
  desc: string
  canImport?: boolean
}) {
  const { toast } = useToast()
  const [exportLoading, setExportLoading] = useState(false)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [pendingData, setPendingData] = useState<any>(null)

  const handleExport = async () => {
    setExportLoading(true)
    try {
      const res = await fetch(`/api/backup?entity=${entityKey}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      const payload = entityKey === 'all' ? json.data : json.data
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `elyasr-backup-${entityKey}-${todayWIBStr()}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: `Export "${label}" berhasil`, type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal export', type: 'error' })
    } finally { setExportLoading(false) }
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportResult(null)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)

      if (entityKey === 'all') {
        // Format export semua: { exportedAt, exportedBy, data: { products: [], orders: [], ... } }
        const dataObj = (parsed?.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data))
          ? parsed.data
          : (typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.exportedAt ? parsed : null)
        if (!dataObj) throw new Error('Format tidak valid. Upload file hasil "Export Semua Data" dari sistem ini.')
        const KEYS = ['products', 'orders', 'vendors', 'wallet_ledger', 'inventory_ledger']
        const total = KEYS.reduce((s, k) => s + (Array.isArray(dataObj[k]) ? dataObj[k].length : 0), 0)
        if (total === 0) throw new Error('Tidak ada data yang bisa diimport dalam file ini.')
        setPreviewCount(total)
        setPendingData(dataObj)
        return
      }

      // Entity tunggal: array langsung atau {data: [...]}
      let rows: any[]
      if (Array.isArray(parsed)) {
        rows = parsed
      } else if (Array.isArray(parsed.data)) {
        rows = parsed.data
      } else if (parsed.data && typeof parsed.data === 'object' && Array.isArray(parsed.data[entityKey])) {
        rows = parsed.data[entityKey]
      } else {
        throw new Error('Format JSON tidak dikenali. Harap gunakan file export dari sistem ini.')
      }
      setPreviewCount(rows.length)
      setPendingData(rows)
    } catch (err: any) {
      toast({ title: err.message || 'File JSON tidak valid', type: 'error' })
      e.target.value = ''
    }
  }

  const handleImport = async () => {
    if (!pendingData) return
    setImportLoading(true)
    setImportResult(null)
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: entityKey, data: pendingData }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setImportResult(json.data)
      setPendingData(null)
      setPreviewCount(null)
      toast({ title: `Import "${label}" berhasil`, type: 'success' })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal import', type: 'error' })
    } finally { setImportLoading(false) }
  }

  const handleCancelImport = () => {
    setPendingData(null)
    setPreviewCount(null)
    setImportResult(null)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileJson size={15} className="text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-zinc-200">{label}</p>
            <p className="text-xs text-zinc-500">{desc}</p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 rounded-lg px-3 py-1.5 text-xs transition-colors shrink-0 disabled:opacity-50"
        >
          {exportLoading ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
          Export
        </button>
      </div>

      {/* Import area - only for supported entities */}
      {canImport && (
        <div className="border-t border-zinc-800 pt-3">
          {!pendingData && !importResult && (
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="flex items-center gap-2 bg-zinc-800 hover:bg-emerald-900/40 border border-zinc-700 hover:border-emerald-700 rounded-lg px-3 py-1.5 text-xs text-zinc-400 group-hover:text-emerald-300 transition-all">
                <Upload size={11} />
                <span>Import JSON</span>
              </div>
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>
          )}

          {pendingData && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 bg-amber-900/20 border border-amber-700/40 rounded-lg px-3 py-1.5 text-xs text-amber-300">
                <AlertCircle size={11} />
                {entityKey === 'all'
                  ? `${previewCount?.toLocaleString('id-ID')} total records (5 entity) siap diimport`
                  : `${previewCount?.toLocaleString('id-ID')} baris siap diimport`
                }
              </div>
              <button
                onClick={handleImport}
                disabled={importLoading}
                className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors"
              >
                {importLoading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                {importLoading ? 'Mengimport...' : 'Konfirmasi Import'}
              </button>
              <button
                onClick={handleCancelImport}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5"
              >
                Batal
              </button>
            </div>
          )}

          {importResult && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 bg-emerald-900/20 border border-emerald-700/40 rounded-lg px-3 py-1.5 text-xs text-emerald-300">
                  <CheckCircle2 size={11} />
                  +{importResult.inserted} baru · ~{importResult.updated} update · {importResult.skipped} skip
                </div>
                <button onClick={handleCancelImport} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1.5">Reset</button>
              </div>
              {importResult.summary && (
                <div className="flex flex-wrap gap-1">
                  {Object.entries(importResult.summary).map(([ent, s]) => s.total > 0 && (
                    <span key={ent} className="text-[10px] bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-zinc-400">
                      {ent}: +{s.inserted} ~{s.updated} /{s.skipped}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function BackupTab() {
  const entities: { key: string; label: string; desc: string; canImport?: boolean }[] = [
    { key: 'all', label: 'Semua Data', desc: 'Export & Import lengkap semua entity sekaligus', canImport: true },
    { key: 'products', label: 'Master Produk', desc: 'Data produk & SKU (upsert by SKU)', canImport: true },
    { key: 'orders', label: 'Orders', desc: 'Semua pesanan (upsert by orderNo)', canImport: true },
    { key: 'vendors', label: 'Vendors', desc: 'Data vendor (upsert by vendorCode)', canImport: true },
    { key: 'wallet_ledger', label: 'Wallet Ledger', desc: 'Transaksi keuangan (insert only)', canImport: true },
    { key: 'inventory_ledger', label: 'Inventory Ledger', desc: 'Riwayat stok masuk/keluar (insert only)', canImport: true },
    { key: 'purchase_orders', label: 'Purchase Orders', desc: 'Semua PO & items (export only)' },
    { key: 'payouts', label: 'Payouts', desc: 'Data payout marketplace (export only)' },
    { key: 'utangs', label: 'Utang & Piutang', desc: 'Catatan utang & piutang (export only)' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-blue-900/20 border border-blue-700/40 rounded-lg px-4 py-3">
        <AlertCircle size={14} className="text-blue-400 shrink-0" />
        <p className="text-xs text-blue-300">
          <strong>Import Semua Data</strong> — upload file hasil Export Semua Data untuk restore semua entity sekaligus.
          Bisa juga import per-entity satu per satu di bawah.
          <span className="text-blue-400"> Produk, Orders & Vendors: upsert (update jika ada). Ledger: insert only (skip duplikat).</span>
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {entities.map(e => (
          <BackupEntityRow
            key={e.key}
            entityKey={e.key}
            label={e.label}
            desc={e.desc}
            canImport={e.canImport}
          />
        ))}
      </div>
    </div>
  )
}
