import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, parseWibDateInput } from '@/lib/utils'

// POST /api/wallet/ledger/edit-requests/[id]/action — Approve or Reject (OWNER only)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Hanya Owner yang dapat ACC edit', 403)

  const { id } = await params
  const body = await request.json()
  const { action, rejectNote } = body

  if (!['APPROVED', 'REJECTED'].includes(action)) {
    return apiError('Action tidak valid')
  }

  const editRequest = await prisma.ledgerEditRequest.findUnique({ where: { id } })
  if (!editRequest) return apiError('Request tidak ditemukan')
  if (editRequest.status !== 'PENDING') return apiError('Request sudah diproses')

  if (action === 'REJECTED') {
    await prisma.ledgerEditRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedBy: session.username,
        reviewedAt: new Date(),
        rejectNote: rejectNote || null,
      },
    })

    await prisma.auditLog.create({
      data: {
        entityType: 'WALLET_LEDGER',
        entityId: editRequest.ledgerId,
        action: 'UPDATE',
        performedBy: session.username,
        note: `Reject edit request dari ${editRequest.requestedBy}: ${rejectNote || 'Tidak ada catatan'}`,
      },
    })

    return apiSuccess({ message: 'Request ditolak' })
  }

  // APPROVED — apply changes
  const changes = editRequest.changes as any[]
  const updateData: any = {}
  const auditChanges: string[] = []

  for (const c of changes) {
    if (c.field === 'amount') {
      const current = await prisma.walletLedger.findUnique({ where: { id: editRequest.ledgerId } })
      if (!current) return apiError('Transaksi asli tidak ditemukan')
      const newAmt = Number(c.newValue)
      updateData.amount = current.trxType === 'EXPENSE' || current.trxType === 'PRIVE' || current.trxType === 'INVESTASI' || current.trxType === 'BAYAR_UTANG' || current.trxType === 'PENGEMBALIAN_MODAL' || current.trxType === 'TRANSFER'
        ? -Math.abs(newAmt) : Math.abs(newAmt)
      auditChanges.push(`amount: ${c.oldValue} → ${newAmt}`)
    }
    if (c.field === 'trxDate') {
      updateData.trxDate = parseWibDateInput(c.newValue)
      auditChanges.push(`trxDate: ${c.oldValue} → ${c.newValue}`)
    }
    if (c.field === 'category') {
      updateData.category = c.newValue
      auditChanges.push(`category: ${c.oldValue} → ${c.newValue}`)
    }
    if (c.field === 'note') {
      updateData.note = c.newValue
      auditChanges.push(`note: ${c.oldValue} → ${c.newValue}`)
    }
  }

  await prisma.$transaction([
    prisma.walletLedger.update({ where: { id: editRequest.ledgerId }, data: updateData }),
    prisma.ledgerEditRequest.update({
      where: { id },
      data: { status: 'APPROVED', reviewedBy: session.username, reviewedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        entityType: 'WALLET_LEDGER',
        entityId: editRequest.ledgerId,
        action: 'UPDATE',
        performedBy: `${session.username} (ACC dari ${editRequest.requestedBy})`,
        note: `Edit disetujui: ${auditChanges.join(', ')}`,
      },
    }),
  ])

  return apiSuccess({ message: 'Edit disetujui dan diterapkan' })
}
