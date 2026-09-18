'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useToast } from '@/components/ui/toaster'
import { Plus, ToggleLeft, ToggleRight, Pencil, X } from 'lucide-react'

// ── Kategori Transaksi Tab ────────────────────────────────────────────────────
const DEFAULT_GROUPS = ['Beban Pokok Penjualan', 'Beban Operasional', 'Beban Lain-lain', 'Non-Beban / Aset']

function KategoriModal({ cat, onClose }: { cat?: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const isEdit = !!cat
  const [form, setForm] = useState({
    name: cat?.name ?? '',
    group: cat?.group ?? 'Beban Operasional',
    customGroup: '',
    isBeban: cat?.isBeban ?? true,
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))
  const useCustomGroup = form.group === '__custom__'
  const finalGroup = useCustomGroup ? form.customGroup : form.group

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !finalGroup.trim()) return
    setLoading(true)
    try {
      const res = await fetch('/api/finance/categories', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit
          ? { id: cat.id, name: form.name, group: finalGroup, isBeban: form.isBeban }
          : { name: form.name, group: finalGroup, isBeban: form.isBeban }
        ),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: isEdit ? 'Kategori diperbarui' : 'Kategori ditambahkan', type: 'success' })
      qc.invalidateQueries({ queryKey: ['owner-categories'] })
      qc.invalidateQueries({ queryKey: ['expense-categories'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white">{isEdit ? 'Edit Kategori' : 'Tambah Kategori'}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nama Kategori *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required
              disabled={isEdit && cat?.isSystem}
              placeholder="cth: Beban Sewa Gudang"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none disabled:opacity-50" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Group</label>
            <select value={form.group} onChange={e => set('group', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              {DEFAULT_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              <option value="__custom__">+ Group Baru...</option>
            </select>
            {useCustomGroup && (
              <input value={form.customGroup} onChange={e => set('customGroup', e.target.value)} required
                placeholder="Nama group baru" autoFocus
                className="w-full mt-2 bg-zinc-800 border border-emerald-600 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
            )}
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-2">Pengaruh ke Laporan L/R</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => set('isBeban', true)}
                className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-medium border transition-all ${form.isBeban ? 'bg-red-900/40 border-red-600 text-red-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                📊 Masuk L/R (Beban)
              </button>
              <button type="button" onClick={() => set('isBeban', false)}
                className={`flex-1 rounded-lg px-3 py-2.5 text-xs font-medium border transition-all ${!form.isBeban ? 'bg-blue-900/40 border-blue-600 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-600'}`}>
                📦 Tidak masuk L/R
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-1.5">
              {form.isBeban ? 'Transaksi ini akan muncul sebagai beban di laporan Laba/Rugi.' : 'Transaksi ini tidak mempengaruhi L/R (misal: beli perlengkapan, aset kecil).'}
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg py-2 text-sm">Batal</button>
            <button type="submit" disabled={loading || (!isEdit && !form.name)} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">
              {loading ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function KategoriTab() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const [modal, setModal] = useState<any>(null) // false | true (add) | object (edit)
  const [filterGroup, setFilterGroup] = useState('')
  const [filterBeban, setFilterBeban] = useState<'all' | 'beban' | 'non'>('all')

  const { data, isLoading } = useQuery({
    queryKey: ['owner-categories'],
    queryFn: () => fetch('/api/finance/categories?all=true').then(r => r.json()).then(d => d.data?.categories ?? []),
  })
  const categories: any[] = data ?? []
  const groups = [...new Set(categories.map((c: any) => c.group))].sort()

  const filtered = categories.filter((c: any) => {
    if (filterGroup && c.group !== filterGroup) return false
    if (filterBeban === 'beban' && !c.isBeban) return false
    if (filterBeban === 'non' && c.isBeban) return false
    return true
  })

  const toggleActive = async (cat: any) => {
    try {
      const res = await fetch('/api/finance/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cat.id, isActive: !cat.isActive }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast({ title: `Kategori ${cat.isActive ? 'dinonaktifkan' : 'diaktifkan'}`, type: 'success' })
      qc.invalidateQueries({ queryKey: ['owner-categories'] })
      qc.invalidateQueries({ queryKey: ['expense-categories'] })
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    }
  }

  return (
    <div>
      {modal && <KategoriModal cat={typeof modal === 'object' ? modal : undefined} onClose={() => setModal(null)} />}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex gap-2 flex-wrap">
          <select value={filterGroup} onChange={e => setFilterGroup(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none">
            <option value="">Semua Group</option>
            {groups.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
          <select value={filterBeban} onChange={e => setFilterBeban(e.target.value as any)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-400 focus:outline-none">
            <option value="all">Semua Tipe</option>
            <option value="beban">Masuk L/R (Beban)</option>
            <option value="non">Tidak masuk L/R</option>
          </select>
        </div>
        <button onClick={() => setModal(true)}
          className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
          <Plus size={14} /> Tambah Kategori
        </button>
      </div>

      <div className="bg-amber-900/20 border border-amber-700/40 rounded-lg px-4 py-3 mb-4">
        <p className="text-xs text-amber-300">
          <strong>Masuk L/R</strong> = beban yang tampil di laporan Laba/Rugi (cth: Beban Sewa, Gaji, Listrik).
          <strong className="ml-2">Tidak masuk L/R</strong> = pengeluaran yang tidak mempengaruhi L/R (cth: Beli Perlengkapan, Inventaris Kecil).
        </p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr>
              <th>Nama Kategori</th>
              <th className="w-40">Group</th>
              <th className="w-32">Pengaruh L/R</th>
              <th className="w-20">Status</th>
              <th className="w-24">Tipe</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>)}</tr>
            )) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-zinc-600">Tidak ada kategori</td></tr>
            ) : filtered.map((c: any) => (
              <tr key={c.id}>
                <td className="text-sm text-zinc-200 font-medium">{c.name}</td>
                <td className="text-xs text-zinc-400">{c.group}</td>
                <td>
                  {c.isBeban
                    ? <span className="badge-danger">📊 Masuk L/R</span>
                    : <span className="badge-info">📦 Non-Beban</span>}
                </td>
                <td>
                  {c.isActive
                    ? <span className="badge-success">Aktif</span>
                    : <span className="badge-muted">Nonaktif</span>}
                </td>
                <td>
                  {c.isSystem
                    ? <span className="text-[10px] text-zinc-600 italic">System</span>
                    : <span className="text-[10px] text-zinc-500">Custom</span>}
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    {!c.isSystem && (
                      <button onClick={() => setModal(c)}
                        className="p-1.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300" title="Edit">
                        <Pencil size={11} />
                      </button>
                    )}
                    <button onClick={() => toggleActive(c)}
                      className={`p-1.5 rounded text-xs transition-colors ${c.isActive ? 'hover:bg-red-900/30 text-zinc-600 hover:text-red-400' : 'hover:bg-emerald-900/30 text-zinc-600 hover:text-emerald-400'
                        }`} title={c.isActive ? 'Nonaktifkan' : 'Aktifkan'}>
                      {c.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-600 mt-2">{filtered.length} kategori ditampilkan dari {categories.length} total</p>
    </div>
  )
}
