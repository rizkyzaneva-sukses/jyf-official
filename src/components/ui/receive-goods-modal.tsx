'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useToast } from '@/components/ui/toaster'
import { X, Package, ChevronDown, Plus, Trash2 } from 'lucide-react'
import { formatRupiah, todayWIBStr } from '@/lib/utils'

interface ReceiveItem {
  poId: string | null
  poItemId: string | null
  sku: string
  productName: string
  qtyReceived: number
  unitPrice: number
  note: string
}

export function ReceiveGoodsModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [vendorId, setVendorId] = useState('')
  const [receiptDate, setReceiptDate] = useState(todayWIBStr())
  const [suratJalanNumber, setSuratJalanNumber] = useState('')
  const [note, setNote] = useState('')
  const [selectedPOIds, setSelectedPOIds] = useState<Set<string>>(new Set())
  const [items, setItems] = useState<ReceiveItem[]>([])
  const [poSearch, setPoSearch] = useState('')

  const { data: vendors } = useQuery({
    queryKey: ['vendors-all'],
    queryFn: () => fetch('/api/vendors?all=true').then(r => r.json()).then(d => d.data ?? []),
  })

  const { data: openPOs, isLoading: loadingPOs } = useQuery({
    queryKey: ['open-pos', vendorId],
    queryFn: () => fetch(`/api/procurement/open-pos?vendorId=${vendorId}`).then(r => r.json()).then(d => d.data ?? []),
    enabled: !!vendorId,
  })

  const filteredPOs = (openPOs || []).filter((po: any) =>
    !poSearch || po.poNumber.toLowerCase().includes(poSearch.toLowerCase())
  )

  // Sync items when selected POs change
  useEffect(() => {
    if (!openPOs) return
    const selectedPOs = openPOs.filter((po: any) => selectedPOIds.has(po.id))
    const newItems: ReceiveItem[] = []
    for (const po of selectedPOs) {
      for (const item of po.items) {
        // Check if this item is already in the list (user might have edited qty)
        const existing = items.find(i => i.poItemId === item.id)
        newItems.push({
          poId: po.id,
          poItemId: item.id,
          sku: item.sku,
          productName: item.productName,
          qtyReceived: existing?.qtyReceived ?? Math.min(item.qtyOrder - (item.qtyReceived || 0), item.qtyOrder),
          unitPrice: item.unitPrice,
          note: existing?.note ?? '',
        })
      }
    }
    // Keep non-PO items (oversupply)
    const nonPOItems = items.filter(i => !i.poId)
    setItems([...newItems, ...nonPOItems])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPOIds, openPOs])

  const togglePO = (poId: string) => {
    setSelectedPOIds(prev => {
      const next = new Set(prev)
      if (next.has(poId)) next.delete(poId)
      else next.add(poId)
      return next
    })
  }

  const selectAllPOs = () => {
    if (selectedPOIds.size === filteredPOs.length) {
      setSelectedPOIds(new Set())
    } else {
      setSelectedPOIds(new Set(filteredPOs.map((po: any) => po.id)))
    }
  }

  const updateItemQty = (index: number, qty: number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, qtyReceived: qty } : item))
  }

  const updateItemNote = (index: number, note: string) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, note } : item))
  }

  const removeItem = (index: number) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const addNonPOItem = () => {
    setItems(prev => [...prev, {
      poId: null,
      poItemId: null,
      sku: '',
      productName: '',
      qtyReceived: 1,
      unitPrice: 0,
      note: 'Tanpa PO',
    }])
  }

  const updateNonPOItem = (index: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  const totalItems = items.filter(i => i.qtyReceived > 0)
  const hasNonPOItems = items.some(i => !i.poId)
  const poCount = selectedPOIds.size

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vendorId) { toast({ title: 'Pilih vendor', type: 'error' }); return }
    if (totalItems.length === 0) { toast({ title: 'Tambah minimal 1 item dengan qty > 0', type: 'error' }); return }

    // Validate non-PO items have sku
    for (const item of totalItems) {
      if (!item.sku) { toast({ title: 'SKU wajib diisi untuk semua item', type: 'error' }); return }
    }

    setLoading(true)
    try {
      const res = await fetch('/api/procurement/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorId,
          receiptDate,
          suratJalanNumber: suratJalanNumber || null,
          note: note || null,
          items: totalItems.map(i => ({
            poId: i.poId,
            poItemId: i.poItemId,
            sku: i.sku,
            productName: i.productName,
            qtyReceived: i.qtyReceived,
            unitPrice: i.unitPrice,
            note: i.note || null,
          })),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: `Penerimaan ${json.data.receiptNumber} berhasil dicatat`, type: 'success' })
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      qc.invalidateQueries({ queryKey: ['goods-receipts'] })
      onSuccess()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal menyimpan', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-900 z-10">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Terima Barang</h2>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Vendor + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Vendor *</label>
              <select value={vendorId} onChange={e => { setVendorId(e.target.value); setSelectedPOIds(new Set()); setItems([]) }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
                <option value="">Pilih vendor</option>
                {(vendors || []).map((v: any) => <option key={v.id} value={v.id}>{v.namaVendor}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Tanggal Terima *</label>
              <input type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">No. Surat Jalan</label>
              <input value={suratJalanNumber} onChange={e => setSuratJalanNumber(e.target.value)} placeholder="Opsional"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Catatan</label>
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Opsional"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none" />
            </div>
          </div>

          {/* PO Selection */}
          {vendorId && (
            <div className="border border-zinc-700 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400 font-medium">Pilih PO (bisa lebih dari 1)</label>
                {filteredPOs.length > 0 && (
                  <button type="button" onClick={selectAllPOs} className="text-xs text-emerald-400 hover:text-emerald-300">
                    {selectedPOIds.size === filteredPOs.length ? 'Batal Pilih Semua' : 'Pilih Semua'}
                  </button>
                )}
              </div>
              {loadingPOs && <p className="text-xs text-zinc-500 animate-pulse">Memuat PO...</p>}
              {!loadingPOs && filteredPOs.length === 0 && (
                <p className="text-xs text-zinc-500">Tidak ada PO OPEN/PARTIAL untuk vendor ini</p>
              )}
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {filteredPOs.map((po: any) => {
                  const remaining = po.items.reduce((sum: number, item: any) => sum + (item.qtyOrder - (item.qtyReceived || 0)), 0)
                  return (
                    <label key={po.id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        selectedPOIds.has(po.id)
                          ? 'border-emerald-600 bg-emerald-900/20'
                          : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                      }`}>
                      <input type="checkbox" checked={selectedPOIds.has(po.id)} onChange={() => togglePO(po.id)}
                        className="w-3.5 h-3.5 accent-emerald-500" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-emerald-400">{po.poNumber}</span>
                          <span className="text-[10px] text-zinc-500">{po.items.length} item</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5">Sisa: {remaining} unit</p>
                      </div>
                      <span className="text-xs text-zinc-400">{formatRupiah(po.totalAmount, true)}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {/* Items to receive */}
          {items.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-400 font-medium">Item Diterima ({totalItems.length} item)</label>
                <button type="button" onClick={addNonPOItem} className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1">
                  <Plus size={12} />Tambah Item Tanpa PO
                </button>
              </div>
              <div className="border border-zinc-700 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-zinc-800/80">
                      <th className="text-left px-3 py-2 text-zinc-400 font-medium w-8">No</th>
                      <th className="text-left px-3 py-2 text-zinc-400 font-medium">SKU</th>
                      <th className="text-left px-3 py-2 text-zinc-400 font-medium">Produk</th>
                      <th className="text-center px-3 py-2 text-zinc-400 font-medium w-20">Qty</th>
                      <th className="text-left px-3 py-2 text-zinc-400 font-medium w-24">Catatan</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {items.map((item, i) => (
                      <tr key={i} className="hover:bg-zinc-800/30">
                        <td className="px-3 py-1.5 text-zinc-500">{i + 1}</td>
                        <td className="px-3 py-1.5">
                          {item.poId ? (
                            <span className="font-mono text-emerald-400/80">{item.sku}</span>
                          ) : (
                            <input value={item.sku} onChange={e => updateNonPOItem(i, 'sku', e.target.value)}
                              placeholder="SKU"
                              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none" />
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-300">
                          {item.poId ? (
                            <span className="truncate block max-w-[200px]">{item.productName}</span>
                          ) : (
                            <input value={item.productName} onChange={e => updateNonPOItem(i, 'productName', e.target.value)}
                              placeholder="Nama produk"
                              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none" />
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <input type="number" min={0} value={item.qtyReceived} onChange={e => updateItemQty(i, Number(e.target.value))}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 text-center focus:outline-none" />
                        </td>
                        <td className="px-3 py-1.5">
                          <input value={item.note} onChange={e => item.poId ? updateItemNote(i, e.target.value) : updateNonPOItem(i, 'note', e.target.value)}
                            placeholder="-"
                            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none" />
                        </td>
                        <td className="px-1 py-1.5">
                          <button type="button" onClick={() => removeItem(i)} className="text-zinc-600 hover:text-red-400 p-1">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
            <button type="submit" disabled={loading || totalItems.length === 0}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">
              {loading ? 'Menyimpan...' : `Simpan (${poCount} PO, ${totalItems.length} item)`}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
