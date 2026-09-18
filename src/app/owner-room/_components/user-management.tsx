'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { formatDate } from '@/lib/utils'
import { useToast } from '@/components/ui/toaster'
import { Plus, Edit2 } from 'lucide-react'
import { ROLES } from './constants'

function UserModal({ user, onClose }: { user?: any; onClose: () => void }) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const isEdit = !!user
  const [form, setForm] = useState({
    username: user?.username ?? '',
    fullName: user?.fullName ?? '',
    userRole: user?.userRole ?? 'STAFF',
    isActive: user?.isActive ?? true,
    password: '',
  })
  const [loading, setLoading] = useState(false)
  const set = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const url = isEdit ? `/api/users/${user.id}` : '/api/users'
      const body = isEdit
        ? { fullName: form.fullName, userRole: form.userRole, isActive: form.isActive, newPassword: form.password || undefined }
        : { username: form.username, password: form.password, fullName: form.fullName, userRole: form.userRole }
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: isEdit ? 'User diperbarui' : 'User ditambahkan', type: 'success' })
      qc.invalidateQueries({ queryKey: ['users'] })
      onClose()
    } catch (err: any) {
      toast({ title: err.message || 'Gagal', type: 'error' })
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-sm p-6">
        <h2 className="text-base font-semibold text-white mb-4">{isEdit ? 'Edit User' : 'Tambah User'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {!isEdit && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Username *</label>
              <input value={form.username} onChange={e => set('username', e.target.value)} required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Nama Lengkap</label>
            <input value={form.fullName} onChange={e => set('fullName', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Role *</label>
            <select value={form.userRole} onChange={e => set('userRole', e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">{isEdit ? 'Password Baru (kosongkan jika tidak diubah)' : 'Password *'}</label>
            <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required={!isEdit}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none" />
          </div>
          {isEdit && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ua" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} className="rounded" />
              <label htmlFor="ua" className="text-xs text-zinc-400">Aktif</label>
            </div>
          )}
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

export function UsersTab() {
  const [modal, setModal] = useState<any>(false)
  const { data: users, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => fetch('/api/users').then(r => r.json()).then(d => d.data ?? []),
  })

  return (
    <div>
      {modal && (
        <UserModal user={typeof modal === 'object' ? modal : undefined} onClose={() => setModal(false)} />
      )}
      <div className="flex justify-end mb-4">
        <button onClick={() => setModal(true)} className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors">
          <Plus size={14} /> Tambah User
        </button>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        <table className="data-table w-full">
          <thead>
            <tr><th>Username</th><th>Nama</th><th className="w-24">Role</th><th className="w-20">Status</th><th className="w-28">Dibuat</th><th className="w-12"></th></tr>
          </thead>
          <tbody>
            {isLoading ? Array.from({ length: 3 }).map((_, i) => (
              <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j}><div className="h-4 bg-zinc-800 rounded animate-pulse" /></td>)}</tr>
            )) : (users ?? []).map((u: any) => (
              <tr key={u.id}>
                <td><span className="font-mono text-sm text-zinc-200">{u.username}</span></td>
                <td className="text-sm text-zinc-400">{u.fullName || '—'}</td>
                <td><span className="badge-info">{u.userRole}</span></td>
                <td>{u.isActive ? <span className="badge-success">Aktif</span> : <span className="badge-danger">Nonaktif</span>}</td>
                <td className="text-xs text-zinc-500">{formatDate(u.createdAt)}</td>
                <td>
                  <button onClick={() => setModal(u)} className="p-1.5 rounded hover:bg-zinc-800 text-zinc-600 hover:text-zinc-300">
                    <Edit2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
