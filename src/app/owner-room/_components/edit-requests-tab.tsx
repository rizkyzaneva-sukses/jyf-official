'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useToast } from '@/components/ui/toaster'
import { formatRupiah } from '@/lib/utils'
import {
  ClipboardCheck, Loader2, Check, X, ChevronLeft, ChevronRight,
  Clock, AlertCircle
} from 'lucide-react'

export function EditRequestsTab() {
  const { toast } = useToast()
  const qc = useQueryClient()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState('PENDING')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectModal, setRejectModal] = useState<string | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['edit-requests', filter, page],
    queryFn: () => fetch(`/api/wallet/ledger/edit-requests?status=${filter}&page=${page}&limit=10`)
      .then(r => r.json()).then(d => d.data ?? { requests: [], total: 0 }),
    staleTime: 10_000,
  })

  const handleAction = async (id: string, action: 'APPROVED' | 'REJECTED') => {
    setActionLoading(id)
    try {
      const res = await fetch(`/api/wallet/ledger/edit-requests/${id}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, rejectNote: action === 'REJECTED' ? rejectNote : undefined }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: action === 'APPROVED' ? 'Edit disetujui ✅' : 'Edit ditolak', type: 'success' })
      qc.invalidateQueries({ queryKey: ['edit-requests'] })
      qc.invalidateQueries({ queryKey: ['wallet-ledger'] })
      setRejectModal(null)
      setRejectNote('')
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setActionLoading(null) }
  }

  const totalPages = Math.ceil((data?.total ?? 0) / 10)

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardCheck size={16} className="text-emerald-400" />
        <h2 className="text-sm font-semibold text-zinc-200">Edit Transaksi — Menunggu ACC</h2>
      </div>
      <p className="text-xs text-zinc-500 mb-4">
        Finance mengajukan edit transaksi, Owner menyetujui atau menolak. Edit yang disetujui langsung diterapkan.
      </p>

      {/* Filter */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-1 w-fit">
        {['PENDING', 'APPROVED', 'REJECTED'].map(s => (
          <button key={s} onClick={() => { setFilter(s); setPage(1) }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === s
                ? s === 'PENDING' ? 'bg-amber-700 text-white'
                  : s === 'APPROVED' ? 'bg-emerald-700 text-white'
                  : 'bg-red-700 text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            {s === 'PENDING' ? 'Menunggu' : s === 'APPROVED' ? 'Disetujui' : 'Ditolak'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-zinc-500 py-10 justify-center">
          <Loader2 size={14} className="animate-spin" /> Memuat...
        </div>
      ) : (data?.requests?.length ?? 0) === 0 ? (
        <div className="text-center py-10">
          <Clock size={24} className="text-zinc-700 mx-auto mb-2" />
          <p className="text-xs text-zinc-600">
            {filter === 'PENDING' ? 'Tidak ada request edit yang menunggu ACC' : `Tidak ada request ${filter.toLowerCase()}`}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.requests.map((req: any) => {
            const changes = req.changes as any[]
            return (
              <div key={req.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                      req.status === 'PENDING' ? 'bg-amber-900/40 text-amber-400' :
                      req.status === 'APPROVED' ? 'bg-emerald-900/40 text-emerald-400' :
                      'bg-red-900/40 text-red-400'
                    }`}>
                      {req.status}
                    </span>
                    <span className="text-xs text-zinc-500">{req.walletName || '—'}</span>
                  </div>
                  <span className="text-[10px] text-zinc-600">
                    oleh {req.requestedBy} · {new Date(req.createdAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Changes detail */}
                <div className="space-y-1.5 mb-3">
                  {changes.map((c: any, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-500 w-20 shrink-0">{c.field}:</span>
                      <span className="text-red-400 line-through">{String(c.oldValue)}</span>
                      <span className="text-zinc-600">→</span>
                      <span className="text-emerald-400">{String(c.newValue)}</span>
                    </div>
                  ))}
                </div>

                {/* Reason */}
                <div className="bg-zinc-800/50 rounded-lg px-3 py-2 mb-3">
                  <p className="text-[10px] text-zinc-500 mb-0.5">Alasan:</p>
                  <p className="text-xs text-zinc-300">{req.reason}</p>
                </div>

                {/* Reject note */}
                {req.rejectNote && (
                  <div className="bg-red-900/10 rounded-lg px-3 py-2 mb-3 border border-red-900/20">
                    <p className="text-[10px] text-red-400 mb-0.5">Catatan Penolakan:</p>
                    <p className="text-xs text-red-300">{req.rejectNote}</p>
                  </div>
                )}

                {/* Actions */}
                {req.status === 'PENDING' && (
                  <div className="flex gap-2">
                    <button onClick={() => handleAction(req.id, 'APPROVED')}
                      disabled={actionLoading === req.id}
                      className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg px-3 py-1.5 text-xs font-medium transition-colors">
                      {actionLoading === req.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      Setujui
                    </button>
                    <button onClick={() => { setRejectModal(req.id); setRejectNote('') }}
                      disabled={actionLoading === req.id}
                      className="flex items-center gap-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-800/50 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors">
                      <X size={12} /> Tolak
                    </button>
                  </div>
                )}

                {/* Reviewed info */}
                {req.status !== 'PENDING' && req.reviewedBy && (
                  <p className="text-[10px] text-zinc-600">
                    {req.status === 'APPROVED' ? 'Disetujui' : 'Ditolak'} oleh {req.reviewedBy}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3">
          <p className="text-[10px] text-zinc-600">{data?.total} request</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronLeft size={14} /></button>
            <span className="text-xs text-zinc-400 px-2">{page}/{totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded bg-zinc-800 text-zinc-400 disabled:opacity-30"><ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="text-red-400" />
              <h3 className="text-sm font-semibold text-white">Tolak Edit Request</h3>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Alasan Penolakan (opsional)</label>
              <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)}
                placeholder="Ketik alasan penolakan..."
                rows={3}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-red-500/50 resize-none" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setRejectModal(null); setRejectNote('') }}
                className="flex-1 py-2 text-sm text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-colors">
                Batal
              </button>
              <button onClick={() => handleAction(rejectModal, 'REJECTED')}
                disabled={actionLoading === rejectModal}
                className="flex-1 py-2 text-sm font-semibold text-white bg-red-700 hover:bg-red-600 rounded-xl transition-colors flex items-center justify-center gap-2">
                {actionLoading === rejectModal ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                Tolak
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
