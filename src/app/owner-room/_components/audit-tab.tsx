'use client'

import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { formatDate } from '@/lib/utils'

export function AuditTab() {
  const [entityType, setEntityType] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', entityType, page],
    queryFn: () => {
      const p = new URLSearchParams({ entityType, page: String(page), limit: '50' })
      return fetch(`/api/audit?${p}`).then(r => r.json()).then(d => d.data)
    },
  })
  const logs = data?.logs ?? []
  const total = data?.total ?? 0

  return (
    <div>
      <div className="flex gap-3 mb-4">
        <select value={entityType} onChange={e => setEntityType(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none">
          <option value="">Semua Entity</option>
          {['Order', 'InventoryScanBatch', 'StockOpnameBatch', 'PurchaseOrder', 'GoodsReceipt'].map(e => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <p className="text-xs text-zinc-500 self-center">{total} log</p>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr><th className="w-32">Waktu</th><th className="w-32">Entity</th><th className="w-20">Aksi</th><th>Detail</th><th className="w-24">Oleh</th></tr>
          </thead>
          <tbody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>)}</tr>
            )) : logs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-zinc-600">Belum ada audit log</td></tr>
            ) : logs.map((l: any) => (
              <tr key={l.id}>
                <td className="text-[10px] text-zinc-500">{formatDate(l.createdAt, 'datetime')}</td>
                <td className="text-xs text-zinc-400">{l.entityType}</td>
                <td><span className="badge-muted text-[10px]">{l.action}</span></td>
                <td className="text-[10px] text-zinc-600 max-w-xs truncate">{l.note || l.entityId}</td>
                <td className="text-xs text-zinc-400">{l.performedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
