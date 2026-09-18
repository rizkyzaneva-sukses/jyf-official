import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError, getPagination, parseWibDateInput } from '@/lib/utils'

// GET /api/wallet/ledger/edit-requests — List edit requests
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const { searchParams } = request.nextUrl
  const status = searchParams.get('status') || ''
  const { skip, take } = getPagination({
    page: Number(searchParams.get('page') || 1),
    limit: Number(searchParams.get('limit') || 20),
  })

  const where: any = {}
  if (status) where.status = status

  const [requests, total] = await Promise.all([
    prisma.ledgerEditRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.ledgerEditRequest.count({ where }),
  ])

  return apiSuccess({ requests, total })
}

// POST /api/wallet/ledger/edit-requests — Create edit request (FINANCE) or direct edit (OWNER)
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE'].includes(session.userRole)) return apiError('Forbidden', 403)

  const body = await request.json()
  const { ledgerId, changes, reason } = body

  if (!ledgerId || !Array.isArray(changes) || changes.length === 0) {
    return apiError('Data tidak lengkap')
  }

  // Get current ledger entry
  const ledger = await prisma.walletLedger.findUnique({ where: { id: ledgerId } })
  if (!ledger) return apiError('Transaksi tidak ditemukan')

  const wallet = await prisma.wallet.findUnique({ where: { id: ledger.walletId } })

  // OWNER — langsung edit
  if (session.userRole === 'OWNER') {
    const updateData: any = {}
    const auditChanges: string[] = []

    for (const c of changes) {
      if (c.field === 'amount') {
        const newAmt = Number(c.newValue)
        updateData.amount = ledger.trxType === 'EXPENSE' || ledger.trxType === 'PRIVE' || ledger.trxType === 'INVESTASI' || ledger.trxType === 'BAYAR_UTANG' || ledger.trxType === 'PENGEMBALIAN_MODAL' || ledger.trxType === 'TRANSFER'
          ? -Math.abs(newAmt) : Math.abs(newAmt)
        auditChanges.push(`amount: ${ledger.amount} → ${newAmt}`)
      }
      if (c.field === 'trxDate') {
        updateData.trxDate = parseWibDateInput(c.newValue)
        auditChanges.push(`trxDate: ${ledger.trxDate} → ${c.newValue}`)
      }
      if (c.field === 'category') {
        updateData.category = c.newValue
        auditChanges.push(`category: ${ledger.category} → ${c.newValue}`)
      }
      if (c.field === 'note') {
        updateData.note = c.newValue
        auditChanges.push(`note: ${ledger.note} → ${c.newValue}`)
      }
    }

    await prisma.walletLedger.update({ where: { id: ledgerId }, data: updateData })

    await prisma.auditLog.create({
      data: {
        entityType: 'WALLET_LEDGER',
        entityId: ledgerId,
        action: 'UPDATE',
        performedBy: session.username,
        note: `Edit langsung (Owner): ${auditChanges.join(', ')}`,
      },
    })

    return apiSuccess({ message: 'Transaksi berhasil diupdate', direct: true })
  }

  // FINANCE — buat request
  const currentSnapshot = {
    id: ledger.id,
    walletName: wallet?.name || '',
    trxDate: ledger.trxDate,
    trxType: ledger.trxType,
    category: ledger.category,
    amount: Number(ledger.amount),
    note: ledger.note,
    createdBy: ledger.createdBy,
  }

  const request_ = await prisma.ledgerEditRequest.create({
    data: {
      ledgerId,
      walletName: wallet?.name || '',
      requestedBy: session.username,
      currentSnapshot,
      changes,
      reason: reason || 'Tidak ada alasan',
    },
  })

  return apiSuccess({ message: 'Request edit dikirim, menunggu ACC Owner', request: request_ }, 201)
}
