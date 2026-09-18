'use client'

import { AppLayout } from '@/components/layout/app-layout'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Shield } from 'lucide-react'
import { UsersTab } from './_components/user-management'
import { AuditTab } from './_components/audit-tab'
import { KategoriTab } from './_components/kategori-tab'
import { KesehatanTab } from './_components/kesehatan-tab'
import { BackupTab } from './_components/backup-tab'
import { PengaturanTab } from './_components/pengaturan-tab'
import { EditRequestsTab } from './_components/edit-requests-tab'
import { TABS } from './_components/constants'

function OwnerRoomContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(tabParam || 'Users')

  useEffect(() => {
    if (tabParam && TABS.includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  return (
    <AppLayout>
      <div className="page-header">
        <h1 className="page-title flex items-center gap-2"><Shield size={22} className="text-emerald-400" />Owner Room</h1>
      </div>

      <div className="flex gap-1 mb-6 bg-zinc-900 border border-zinc-800 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t ? 'bg-emerald-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'Users' && <UsersTab />}
      {activeTab === 'Edit Requests' && <EditRequestsTab />}
      {activeTab === 'Audit Log' && <AuditTab />}
      {activeTab === 'Kategori' && <KategoriTab />}
      {activeTab === 'Kesehatan' && <KesehatanTab />}
      {activeTab === 'Backup Data' && <BackupTab />}
      {activeTab === 'Pengaturan' && <PengaturanTab />}
    </AppLayout>
  )
}

export default function OwnerRoomPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-500">Memuat Owner Room...</div>}>
      <OwnerRoomContent />
    </Suspense>
  )
}
