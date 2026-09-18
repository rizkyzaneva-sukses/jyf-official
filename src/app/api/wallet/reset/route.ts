import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

// POST /api/wallet/reset — Reset semua keuangan ke saldo awal (modal_awal)
// DESTRUKTIF: Menghapus SEMUA transaksi wallet_ledger, lalu recreate dari modal_awal
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Hanya Owner yang dapat reset keuangan', 403)

  const body = await request.json()
  if (body.confirm !== 'RESET') {
    return apiError('Ketik RESET untuk konfirmasi')
  }

  // 1. Ambil semua modal_awal
  const modals = await prisma.modalAwal.findMany({
    where: { wallet: { isActive: true } },
    include: { wallet: { select: { id: true, name: true } } },
  })

  if (modals.length === 0) {
    return apiError('Tidak ada modal awal yang di-set. Setup modal awal terlebih dahulu di Modal Awal.')
  }

  // 2. Hitung jumlah transaksi yang akan dihapus
  const totalLedger = await prisma.walletLedger.count()

  // 3. Hapus SEMUA wallet_ledger dalam transaction
  const result = await prisma.$transaction(async (tx) => {
    // Hapus semua ledger
    const deleted = await tx.walletLedger.deleteMany()

    // Recreate MODAL_MASUK dari setiap modal_awal
    const recreated = []
    for (const m of modals) {
      const entry = await tx.walletLedger.create({
        data: {
          walletId: m.walletId,
          trxDate: m.tanggalSetup,
          trxType: 'MODAL_MASUK',
          category: 'Modal Awal',
          amount: Math.abs(m.jumlah),
          note: `Reset keuangan — saldo awal dari ${m.wallet.name}`,
          createdBy: session.username,
        },
      })
      recreated.push({
        wallet: m.wallet.name,
        amount: m.jumlah,
      })
    }

    // Audit log
    await tx.auditLog.create({
      data: {
        entityType: 'WALLET_LEDGER',
        entityId: 'RESET',
        action: 'DELETE',
        performedBy: session.username,
        note: `Reset keuangan: menghapus ${deleted.count} transaksi, recreate ${recreated.length} modal awal`,
      },
    })

    return { deletedCount: deleted.count, recreated }
  })

  return apiSuccess({
    message: `Reset berhasil: ${result.deletedCount} transaksi dihapus, ${result.recreated.length} saldo awal dipulihkan`,
    deletedCount: result.deletedCount,
    wallets: result.recreated,
  })
}
