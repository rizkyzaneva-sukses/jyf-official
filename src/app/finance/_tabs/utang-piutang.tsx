'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatRupiah, formatDate, todayWIBStr } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { useAuth } from '@/components/providers'
import {
  CreditCard, Plus, Pencil, Trash2, X, Banknote, History,
  ChevronDown, ChevronRight, ArrowDownLeft, ArrowUpRight,
} from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  OUTSTANDING: 'badge-danger',
  PARTIAL: 'badge-warning',
  PAID: 'badge-success',
  COLLECTED: 'badge-success',
}

// ── Tambah Utang / Piutang ──────────────────────────────────────────────────
function AddModal({ type, wallets, onClose }: { type: 'utang' | 'piutang'; wallets: any[]; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [form, setForm] = useState({
    type: type === 'utang' ? 'SUNTIKAN_MODAL' : 'PINJAMAN_KARYAWAN',
    name: '',
    sourceWalletId: '',
    amount: '',
    trxDate: todayWIBStr(),
    dueDate: '',
    note: '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const typeOptions = type === 'utang'
    ? ['SUNTIKAN_MODAL', 'PINJAMAN_BANK', 'PINJAMAN_PRIBADI', 'LAINNYA']
    : ['PINJAMAN_KARYAWAN', 'PO_VENDOR_BELUM_DIKIRIM', 'LAINNYA']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/utang-piutang', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: type,
          type: form.type,
          [type === 'utang' ? 'creditorName' : 'debtorName']: form.name,
          sourceWalletId: form.sourceWalletId,
          amount: Number(form.amount),
          trxDate: form.trxDate,
          dueDate: form.dueDate || null,
          note: form.note,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: `${type === 'utang' ? 'Utang' : 'Piutang'} ditambahkan`, type: 'success' })
      qc.invalidateQueries({ queryKey: ['utang-piutang'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-white mb-4">
          Tambah {type === 'utang' ? 'Utang' : 'Piutang'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tipe</label>
            <select value={form.type} onChange={e => set('type', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              {typeOptions.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              {type === 'utang' ? 'Nama Kreditur' : 'Nama Debitur'} *
            </label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Wallet *</label>
            <select value={form.sourceWalletId} onChange={e => set('sourceWalletId', e.target.value)} required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              <option value="">Pilih wallet</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          {[
            { label: 'Jumlah (Rp) *', key: 'amount', type: 'number' },
            { label: 'Tanggal Transaksi', key: 'trxDate', type: 'date' },
            { label: 'Jatuh Tempo', key: 'dueDate', type: 'date' },
            { label: 'Catatan', key: 'note', type: 'text' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-zinc-500 mb-1">{f.label}</label>
              <input type={f.type} value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Edit nama/tipe ──────────────────────────────────────────────────────────
function EditModal({ item, entityType, onClose }: { item: any; entityType: 'utang' | 'piutang'; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const currentName = entityType === 'utang' ? item.creditorName : item.debtorName
  const [name, setName] = useState(currentName || '')
  const [type, setType] = useState(item.type || '')
  const [loading, setLoading] = useState(false)

  const typeOptions = entityType === 'utang'
    ? ['SUNTIKAN_MODAL', 'PINJAMAN_BANK', 'PINJAMAN_PRIBADI', 'LAINNYA']
    : ['PINJAMAN_KARYAWAN', 'PO_VENDOR_BELUM_DIKIRIM', 'LAINNYA']

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/utang-piutang', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, entityType, name: name.trim(), type }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: 'Berhasil diperbarui', type: 'success' })
      qc.invalidateQueries({ queryKey: ['utang-piutang'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">
            Edit {entityType === 'utang' ? 'Utang' : 'Piutang'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              {entityType === 'utang' ? 'Nama Kreditur' : 'Nama Debitur'} *
            </label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tipe</label>
            <select value={type} onChange={e => setType(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              {typeOptions.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
            <button type="submit" disabled={loading} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Bayar Utang / Terima Piutang ────────────────────────────────────────────
function PayModal({
  item,
  entityType,
  wallets,
  onClose,
}: {
  item: any
  entityType: 'utang' | 'piutang'
  wallets: any[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const isUtang = entityType === 'utang'
  const paid = isUtang ? item.amountPaid : item.amountCollected
  const sisa = item.amount - paid
  const name = isUtang ? item.creditorName : item.debtorName

  const [walletId, setWalletId] = useState(item.sourceWalletId || '')
  const [amount, setAmount] = useState(String(sisa > 0 ? sisa : ''))
  const [paymentDate, setPaymentDate] = useState(todayWIBStr())
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = Number(amount)
    if (!walletId) {
      toast({ title: 'Pilih wallet', type: 'error' })
      return
    }
    if (!amt || amt <= 0) {
      toast({ title: 'Jumlah harus lebih dari 0', type: 'error' })
      return
    }
    if (amt > sisa) {
      toast({ title: `Jumlah melebihi sisa (${formatRupiah(sisa, true)})`, type: 'error' })
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/utang-piutang/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType,
          entityId: item.id,
          walletId,
          amount: amt,
          paymentDate,
          note: note || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({
        title: isUtang ? 'Pembayaran utang berhasil' : 'Penerimaan piutang berhasil',
        type: 'success',
      })
      qc.invalidateQueries({ queryKey: ['utang-piutang'] })
      qc.invalidateQueries({ queryKey: ['wallets'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Banknote size={18} className={isUtang ? 'text-red-400' : 'text-emerald-400'} />
            {isUtang ? 'Bayar Utang' : 'Terima Piutang'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={18} /></button>
        </div>
        <p className="text-sm text-zinc-400 mb-4">
          {name}
          <span className="text-zinc-600 mx-1.5">·</span>
          Sisa <span className={isUtang ? 'text-red-400 font-medium' : 'text-yellow-400 font-medium'}>{formatRupiah(sisa, true)}</span>
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Wallet *</label>
            <select value={walletId} onChange={e => setWalletId(e.target.value)} required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              <option value="">Pilih wallet</option>
              {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Jumlah (Rp) *</label>
            <input type="number" min={1} max={sisa} value={amount} onChange={e => setAmount(e.target.value)} required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
            <div className="flex gap-2 mt-1.5">
              {[0.25, 0.5, 1].map(frac => {
                const val = Math.floor(sisa * frac)
                if (val <= 0) return null
                return (
                  <button key={frac} type="button" onClick={() => setAmount(String(val))}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700">
                    {frac === 1 ? 'Lunas' : `${frac * 100}%`}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Tanggal *</label>
            <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} required
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none [&::-webkit-calendar-picker-indicator]:invert-[0.6]" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Catatan</label>
            <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Opsional"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none placeholder:text-zinc-600" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
            <button type="submit" disabled={loading}
              className={`flex-1 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium ${
                isUtang ? 'bg-red-700 hover:bg-red-600' : 'bg-emerald-600 hover:bg-emerald-500'
              }`}>
              {loading ? 'Memproses...' : isUtang ? 'Bayar' : 'Terima'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Riwayat pembayaran (expandable row content) ─────────────────────────────
function PaymentHistory({
  item,
  entityType,
  colSpan,
}: {
  item: any
  entityType: 'utang' | 'piutang'
  colSpan: number
}) {
  const isUtang = entityType === 'utang'
  const raw = isUtang ? (item.payments ?? []) : (item.collections ?? [])
  const history = [...raw].sort((a: any, b: any) => {
    const da = new Date(isUtang ? a.paymentDate : a.collectionDate).getTime()
    const db = new Date(isUtang ? b.paymentDate : b.collectionDate).getTime()
    return db - da
  })
  const totalPaid = isUtang ? item.amountPaid : item.amountCollected
  const sisa = item.amount - totalPaid

  return (
    <tr className="bg-zinc-950/80">
      <td colSpan={colSpan} className="!p-0">
        <div className="px-4 py-3 border-t border-zinc-800/80">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
              <History size={12} />
              Riwayat {isUtang ? 'Pembayaran' : 'Penagihan'}
              <span className="text-zinc-600 font-normal normal-case">({history.length} transaksi)</span>
            </p>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="text-zinc-500">
                Total: <span className="text-zinc-300">{formatRupiah(item.amount, true)}</span>
              </span>
              <span className="text-zinc-500">
                {isUtang ? 'Terbayar' : 'Tertagih'}: <span className="text-emerald-400">{formatRupiah(totalPaid, true)}</span>
              </span>
              <span className="text-zinc-500">
                Sisa: <span className={sisa > 0 ? (isUtang ? 'text-red-400' : 'text-yellow-400') : 'text-zinc-600'}>
                  {sisa > 0 ? formatRupiah(sisa, true) : 'Lunas'}
                </span>
              </span>
            </div>
          </div>

          {history.length === 0 ? (
            <p className="text-xs text-zinc-600 py-2">
              Belum ada riwayat {isUtang ? 'pembayaran' : 'penagihan'}.
            </p>
          ) : (
            <div className="rounded-lg border border-zinc-800 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-zinc-900/80 text-[10px] text-zinc-500 uppercase tracking-wide">
                    <th className="text-left px-3 py-1.5 font-medium">Tanggal</th>
                    <th className="text-left px-3 py-1.5 font-medium">Wallet</th>
                    <th className="text-right px-3 py-1.5 font-medium">Jumlah</th>
                    <th className="text-left px-3 py-1.5 font-medium">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h: any) => {
                    const date = isUtang ? h.paymentDate : h.collectionDate
                    return (
                      <tr key={h.id} className="border-t border-zinc-800/60">
                        <td className="px-3 py-1.5 text-xs text-zinc-400 whitespace-nowrap">
                          {formatDate(date)}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-zinc-400">{h.walletName || '—'}</td>
                        <td className={`px-3 py-1.5 text-xs text-right font-medium whitespace-nowrap ${
                          isUtang ? 'text-red-400' : 'text-emerald-400'
                        }`}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            {isUtang
                              ? <ArrowUpRight size={11} className="opacity-70" />
                              : <ArrowDownLeft size={11} className="opacity-70" />}
                            {formatRupiah(h.amount, true)}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-zinc-500 truncate max-w-[200px]">
                          {h.note || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Baris item ──────────────────────────────────────────────────────────────
function ItemRow({
  item,
  entityType,
  isOwner,
  expanded,
  onToggle,
  onPay,
  onEdit,
  onDelete,
  deletingId,
}: {
  item: any
  entityType: 'utang' | 'piutang'
  isOwner: boolean
  expanded: boolean
  onToggle: () => void
  onPay: () => void
  onEdit: () => void
  onDelete: () => void
  deletingId: string | null
}) {
  const isUtang = entityType === 'utang'
  const paid = isUtang ? item.amountPaid : item.amountCollected
  const sisa = item.amount - paid
  const historyCount = isUtang ? (item.payments?.length ?? 0) : (item.collections?.length ?? 0)
  const isDone = isUtang ? item.status === 'PAID' : item.status === 'COLLECTED'
  const colSpan = isOwner ? 9 : 8

  return (
    <>
      <tr className={expanded ? 'bg-zinc-800/30' : undefined}>
        <td>
          <button onClick={onToggle} className="flex items-start gap-2 text-left group w-full">
            <span className="mt-0.5 text-zinc-600 group-hover:text-zinc-400 shrink-0">
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
            <span>
              <p className="text-sm text-zinc-200 group-hover:text-white transition-colors">
                {item.creditorName || item.debtorName}
              </p>
              <p className="text-[10px] text-zinc-600">
                {item.sourceWalletName}
                {historyCount > 0 && (
                  <span className="ml-1.5 text-zinc-500">· {historyCount}x bayar</span>
                )}
              </p>
            </span>
          </button>
        </td>
        <td><span className="text-xs text-zinc-400">{item.type?.replace(/_/g, ' ')}</span></td>
        <td className="text-right text-xs text-zinc-300">{formatRupiah(item.amount, true)}</td>
        <td className="text-right text-xs text-emerald-400">{formatRupiah(paid, true)}</td>
        <td className={`text-right text-xs font-medium ${
          sisa > 0 ? (isUtang ? 'text-red-400' : 'text-yellow-400') : 'text-zinc-600'
        }`}>
          {sisa > 0 ? formatRupiah(sisa, true) : '—'}
        </td>
        <td className="text-xs text-zinc-400">{item.dueDate ? formatDate(item.dueDate) : '—'}</td>
        <td><span className={STATUS_COLOR[item.status] || 'badge-muted'}>{item.status}</span></td>
        <td>
          <div className="flex gap-1 justify-end">
            {!isDone && (
              <button
                onClick={onPay}
                title={isUtang ? 'Bayar utang' : 'Terima piutang'}
                className={`p-1.5 rounded text-xs font-medium flex items-center gap-1 transition-colors ${
                  isUtang
                    ? 'bg-red-900/40 hover:bg-red-800/60 text-red-300'
                    : 'bg-emerald-900/40 hover:bg-emerald-800/60 text-emerald-300'
                }`}
              >
                <Banknote size={12} />
                <span className="hidden sm:inline">{isUtang ? 'Bayar' : 'Terima'}</span>
              </button>
            )}
            <button
              onClick={onToggle}
              title="Riwayat pembayaran"
              className={`p-1.5 rounded transition-colors ${
                expanded
                  ? 'bg-zinc-700 text-zinc-200'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <History size={12} />
            </button>
          </div>
        </td>
        {isOwner && (
          <td>
            <div className="flex gap-1">
              <button onClick={onEdit}
                className="p-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 transition-colors">
                <Pencil size={12} />
              </button>
              <button onClick={onDelete} disabled={deletingId === item.id}
                className="p-1.5 rounded bg-zinc-800 hover:bg-red-900/50 text-zinc-500 hover:text-red-400 disabled:opacity-40 transition-colors">
                <Trash2 size={12} />
              </button>
            </div>
          </td>
        )}
      </tr>
      {expanded && (
        <PaymentHistory item={item} entityType={entityType} colSpan={colSpan} />
      )}
    </>
  )
}

// ── Main Tab ────────────────────────────────────────────────────────────────
export function UtangTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const { user } = useAuth()
  const isOwner = user?.userRole === 'OWNER'

  const [tab, setTab] = useState<'utang' | 'piutang'>('utang')
  const [modal, setModal] = useState<'utang' | 'piutang' | null>(null)
  const [editItem, setEditItem] = useState<any>(null)
  const [payItem, setPayItem] = useState<any>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: wallets } = useQuery({
    queryKey: ['wallets'],
    queryFn: () => fetch('/api/wallet').then(r => r.json()).then(d => d.data ?? []),
  })
  const { data, isLoading } = useQuery({
    queryKey: ['utang-piutang', tab],
    queryFn: () => fetch(`/api/utang-piutang?type=${tab}`).then(r => r.json()).then(d => d.data),
  })
  const { data: outstandingOrders } = useQuery({
    queryKey: ['outstanding-orders'],
    queryFn: () => fetch('/api/utang-piutang/outstanding-orders').then(r => r.json()).then(d => d.data),
    enabled: tab === 'piutang',
  })

  const handleDelete = async (item: any) => {
    const label = tab === 'utang' ? item.creditorName : item.debtorName
    if (!confirm(`Hapus ${tab} "${label}"? Tindakan ini tidak dapat dibatalkan.`)) return
    setDeletingId(item.id)
    try {
      const res = await fetch('/api/utang-piutang', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, entityType: tab }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: 'Berhasil dihapus', type: 'success' })
      qc.invalidateQueries({ queryKey: ['utang-piutang'] })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal menghapus', type: 'error' })
    } finally {
      setDeletingId(null)
    }
  }

  const items = tab === 'utang' ? (data?.utangs ?? []) : (data?.piutangs ?? [])
  const totalOutstanding = data?.totalOutstanding ?? 0
  const colCount = isOwner ? 9 : 8

  const renderItem = (item: any) => (
    <ItemRow
      key={item.id}
      item={item}
      entityType={tab}
      isOwner={isOwner}
      expanded={expandedId === item.id}
      onToggle={() => setExpandedId(prev => (prev === item.id ? null : item.id))}
      onPay={() => setPayItem(item)}
      onEdit={() => setEditItem(item)}
      onDelete={() => handleDelete(item)}
      deletingId={deletingId}
    />
  )

  return (
    <>
      {modal && wallets && (
        <AddModal type={modal} wallets={wallets} onClose={() => setModal(null)} />
      )}
      {editItem && (
        <EditModal item={editItem} entityType={tab} onClose={() => setEditItem(null)} />
      )}
      {payItem && wallets && (
        <PayModal
          item={payItem}
          entityType={tab}
          wallets={wallets}
          onClose={() => setPayItem(null)}
        />
      )}

      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {(['utang', 'piutang'] as const).map(t => (
            <button key={t} onClick={() => { setTab(t); setExpandedId(null) }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t ? 'bg-emerald-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('utang')}
            className="flex items-center gap-2 bg-red-800 hover:bg-red-700 text-white rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={14} />Utang
          </button>
          <button onClick={() => setModal('piutang')}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium">
            <Plus size={14} />Piutang
          </button>
        </div>
      </div>

      <div className="stat-card mb-4 flex items-center justify-between">
        <div>
          <p className="text-zinc-500 text-xs mb-1">
            {tab === 'piutang' ? 'Total Piutang' : 'Total Utang Outstanding'}
          </p>
          <p className={`text-2xl font-bold ${tab === 'utang' ? 'text-red-400' : 'text-emerald-400'}`}>
            {formatRupiah(totalOutstanding, true)}
          </p>
        </div>
        <CreditCard size={32} className={tab === 'utang' ? 'text-red-900' : 'text-emerald-900'} />
      </div>

      {tab === 'piutang' && (
        <div className="mb-6">
          <p className="text-xs text-zinc-500 font-medium mb-2">Piutang Marketplace (Belum Cair)</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-500 text-xs mb-1">Piutang Shopee (Status Terkirim)</p>
              <p className="text-xl font-bold text-orange-400">
                {formatRupiah(outstandingOrders?.shopee ?? 0, true)}
              </p>
              <p className="text-zinc-600 text-[10px] mt-0.5">
                {outstandingOrders?.shopeeCount ?? 0} order belum cair
              </p>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <p className="text-zinc-500 text-xs mb-1">Piutang TikTok (Status Terkirim)</p>
              <p className="text-xl font-bold text-cyan-400">
                {formatRupiah(outstandingOrders?.tiktok ?? 0, true)}
              </p>
              <p className="text-zinc-600 text-[10px] mt-0.5">
                {outstandingOrders?.tiktokCount ?? 0} order belum cair
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Nama</th>
              <th className="w-28">Tipe</th>
              <th className="w-28 text-right">Jumlah</th>
              <th className="w-28 text-right">Terbayar</th>
              <th className="w-28 text-right">Sisa</th>
              <th className="w-24">Jatuh Tempo</th>
              <th className="w-24">Status</th>
              <th className="w-28 text-right">Aksi</th>
              {isOwner && <th className="w-16">Edit</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: colCount }).map((_, j) => (
                    <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="text-center py-10 text-zinc-600">
                  Tidak ada data {tab}
                </td>
              </tr>
            ) : tab === 'utang' ? (
              items.map(renderItem)
            ) : (
              (() => {
                const PIUTANG_GROUPS: { key: string; label: string }[] = [
                  { key: 'PO_VENDOR_BELUM_DIKIRIM', label: 'Piutang Vendor' },
                  { key: 'PINJAMAN_KARYAWAN', label: 'Piutang Karyawan' },
                  { key: 'LAINNYA', label: 'Piutang Lainnya' },
                ]
                return PIUTANG_GROUPS.flatMap(({ key, label }) => {
                  const groupItems = items.filter((i: any) => i.type === key)
                  if (groupItems.length === 0) return []
                  const groupSisa = groupItems.reduce((acc: number, i: any) => {
                    return acc + (i.amount - i.amountCollected)
                  }, 0)
                  return [
                    <tr key={`group-${key}`}>
                      <td colSpan={colCount} className="bg-zinc-800/50 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-zinc-300">{label}</span>
                          <span className="text-xs text-yellow-400 font-medium">
                            {formatRupiah(groupSisa, true)}
                          </span>
                        </div>
                      </td>
                    </tr>,
                    ...groupItems.map(renderItem),
                  ]
                })
              })()
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-zinc-600 mt-3">
        Klik nama baris atau ikon riwayat untuk melihat detail cicilan / penagihan. Gunakan tombol{' '}
        <span className="text-zinc-400">Bayar</span> / <span className="text-zinc-400">Terima</span> untuk mencatat transaksi.
      </p>
    </>
  )
}
