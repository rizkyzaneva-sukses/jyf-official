import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { apiSuccess, apiError } from '@/lib/utils'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) return apiError('Forbidden', 403)

  const batch = await prisma.inventoryScanBatch.findUnique({ where: { id: (await params).id } })
  if (!batch) return apiError('Batch tidak ditemukan', 404)
  if (batch.status !== 'DRAFT') return apiError('Batch sudah diproses')

  const itemsJson = batch.itemsJson as any
  if (!itemsJson || (Array.isArray(itemsJson) ? itemsJson.length === 0 : Object.keys(itemsJson).length === 0)) {
    return apiError('Batch kosong')
  }

  const isArray = Array.isArray(itemsJson)
  const skus = Array.from(new Set(isArray ? itemsJson.map((x: any) => x.sku) : Object.keys(itemsJson)))

  const products = await prisma.masterProduct.findMany({ where: { sku: { in: skus } } })
  const foundSkus = new Set(products.map(p => p.sku))
  const missing = skus.filter(s => !foundSkus.has(s))
  if (missing.length > 0) return apiError(`SKU tidak ditemukan: ${missing.join(', ')}`)

  // Build ledger data
  const ledgerData: any[] = []
  if (isArray) {
    for (const item of itemsJson) {
      ledgerData.push({
        sku: item.sku,
        trxDate: item.trxDate ? new Date(`${item.trxDate}T12:00:00Z`) : batch.batchDate,
        direction: batch.direction,
        reason: (batch.reason as any) || 'ADJUSTMENT',
        qty: parseInt(item.qty, 10),
        batchId: batch.id,
        note: [item.supplierName && `Supplier: ${item.supplierName}`, item.note && `Catatan: ${item.note}`].filter(Boolean).join(' - ') || null,
        createdBy: session.username,
      })
    }
  } else {
    for (const sku of skus) {
      ledgerData.push({
        sku,
        trxDate: batch.batchDate,
        direction: batch.direction,
        reason: (batch.reason as any) || 'ADJUSTMENT',
        qty: parseInt(itemsJson[sku] as string, 10),
        batchId: batch.id,
        createdBy: session.username,
      })
    }
  }

  // ── PO Auto-Match: PURCHASE + vendorId → update PO items ──
  const isPurchase = batch.reason === 'PURCHASE' && batch.vendorId
  const poUpdates: { poId: string; poNumber: string; matched: { sku: string; qty: number }[] }[] = []

  if (isPurchase) {
    const openPOs = await prisma.purchaseOrder.findMany({
      where: {
        vendorId: batch.vendorId!,
        status: { in: ['OPEN', 'PARTIAL'] },
      },
      include: {
        items: {
          where: { status: { not: 'COMPLETED' } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { poDate: 'asc' },
    })

    // Build a map: sku → [{ poItemId, poId, poNumber, remaining }]
    const skuPOMap = new Map<string, { poItemId: string; poId: string; poNumber: string; remaining: number }[]>()
    for (const po of openPOs) {
      for (const item of po.items) {
        const remaining = item.qtyOrder - item.qtyReceived
        if (remaining <= 0) continue
        const list = skuPOMap.get(item.sku) || []
        list.push({ poItemId: item.id, poId: po.id, poNumber: po.poNumber, remaining })
        skuPOMap.set(item.sku, list)
      }
    }

    // For each scanned item, distribute qty across matching PO items (FIFO)
    for (const entry of ledgerData) {
      const poItems = skuPOMap.get(entry.sku)
      if (!poItems || poItems.length === 0) continue

      let qtyLeft = entry.qty
      const matched: { sku: string; qty: number }[] = []

      for (const pi of poItems) {
        if (qtyLeft <= 0) break
        const allocQty = Math.min(qtyLeft, pi.remaining)
        if (allocQty <= 0) continue

        // Update PO item
        const poItem = await prisma.purchaseOrderItem.findUnique({ where: { id: pi.poItemId } })
        if (poItem) {
          const newQtyReceived = poItem.qtyReceived + allocQty
          const itemStatus = newQtyReceived >= poItem.qtyOrder ? 'COMPLETED' : 'PARTIAL'
          await prisma.purchaseOrderItem.update({
            where: { id: pi.poItemId },
            data: { qtyReceived: newQtyReceived, status: itemStatus },
          })
        }

        pi.remaining -= allocQty
        qtyLeft -= allocQty
        matched.push({ sku: entry.sku, qty: allocQty })

        // Update ledger note to include PO reference
        entry.note = [entry.note, `→ ${pi.poNumber}`].filter(Boolean).join(' | ')
      }

      // Also update ledger note with PO summary
      if (matched.length > 0) {
        const poNumbers = [...new Set(openPOs.filter(p => matched.some(m => m.sku === entry.sku)).map(p => p.poNumber))]
        if (poNumbers.length > 0) {
          entry.note = [entry.note, `PO: ${poNumbers.join(', ')}`].filter(Boolean).join(' | ')
        }
      }

      // Track which POs were updated
      const affectedPOIds = new Set<string>()
      for (const pi of skuPOMap.get(entry.sku) || []) {
        if (pi.remaining < (pi.remaining + (qtyLeft < entry.qty ? entry.qty - qtyLeft : 0))) {
          affectedPOIds.add(pi.poId)
        }
      }

      for (const poId of affectedPOIds) {
        const existing = poUpdates.find(u => u.poId === poId)
        if (existing) {
          existing.matched.push(...matched)
        } else {
          const po = openPOs.find(p => p.id === poId)
          poUpdates.push({ poId, poNumber: po?.poNumber || '-', matched: [...matched] })
        }
      }
    }
  }

  // ── Endorsement Beban Sample ──
  const isEndorsement = batch.reason === 'MARKETING'
  let walletBookingWarning: string | null = null
  const walletLedgerData: any[] = []

  if (isEndorsement) {
    const kasOps = await prisma.wallet.findFirst({
      where: {
        isActive: true,
        name: { contains: 'Kas Operasional', mode: 'insensitive' },
      },
    })

    if (!kasOps) {
      walletBookingWarning =
        'Wallet "Kas Operasional" tidak ditemukan — Beban Sample TIDAK otomatis dibukukan ke Finance. Silakan input manual di modul Finance.'
    } else {
      const hppMap = new Map(products.map(p => [p.sku, p.hpp ?? 0]))

      for (const entry of ledgerData) {
        const hpp = hppMap.get(entry.sku) ?? 0
        const qty = entry.qty
        const totalBeban = hpp * qty

        if (totalBeban > 0) {
          walletLedgerData.push({
            walletId: kasOps.id,
            trxDate: entry.trxDate,
            trxType: 'EXPENSE' as const,
            category: 'Beban Sample',
            amount: -Math.abs(totalBeban),
            note: `Endorsement: ${entry.sku} × ${qty} unit (HPP Rp${hpp.toLocaleString('id-ID')}/unit) | Ref: ${batch.id.slice(-8)}`,
            createdBy: session.username,
          })
        }
      }

      if (walletLedgerData.length === 0) {
        walletBookingWarning =
          'Semua produk memiliki HPP = 0, Beban Sample tidak dibukukan. Pastikan HPP produk sudah diisi di Master Produk.'
      }
    }
  }

  // Commit everything in transaction
  await prisma.$transaction(async (tx) => {
    // 1. Inventory ledger
    await tx.inventoryLedger.createMany({ data: ledgerData })

    // 2. PO status updates
    if (isPurchase) {
      const affectedPOIds = [...new Set(poUpdates.map(u => u.poId))]
      for (const poId of affectedPOIds) {
        const updatedItems = await tx.purchaseOrderItem.findMany({ where: { poId } })
        const anyReceived = updatedItems.some(i => i.qtyReceived > 0)
        const allCompleted = updatedItems.every(i => i.status === 'COMPLETED')
        const poStatus = allCompleted ? 'COMPLETED' : anyReceived ? 'PARTIAL' : 'OPEN'
        const totalQtyReceived = updatedItems.reduce((sum, i) => sum + i.qtyReceived, 0)

        await tx.purchaseOrder.update({
          where: { id: poId },
          data: { status: poStatus, totalQtyReceived },
        })
      }
    }

    // 3. Finance: Beban Sample
    if (walletLedgerData.length > 0) {
      await tx.walletLedger.createMany({ data: walletLedgerData })
    }

    // 4. Commit batch
    await tx.inventoryScanBatch.update({
      where: { id: batch.id },
      data: { status: 'COMMITTED' },
    })

    // 5. Audit log
    await tx.auditLog.create({
      data: {
        entityType: 'InventoryScanBatch',
        action: 'COMMIT',
        entityId: batch.id,
        afterJson: {
          items: itemsJson,
          direction: batch.direction,
          reason: batch.reason,
          vendorId: batch.vendorId,
          poUpdates: poUpdates.length > 0 ? poUpdates.map(u => ({ poNumber: u.poNumber, items: u.matched })) : undefined,
          bebanSampleBooked: walletLedgerData.length,
        },
        performedBy: session.username,
      },
    })
  })

  const totalBebanSample = walletLedgerData.reduce((s, e) => s + Math.abs(e.amount), 0)
  const totalPOItems = poUpdates.reduce((s, u) => s + u.matched.length, 0)

  return apiSuccess({
    message: 'Batch berhasil dicommit',
    batchId: batch.id,
    ...(poUpdates.length > 0 && {
      poMatched: poUpdates.map(u => ({
        poNumber: u.poNumber,
        items: u.matched,
      })),
      totalPOItemsMatched: totalPOItems,
    }),
    ...(isEndorsement && {
      bebanSample: {
        booked: walletLedgerData.length,
        totalAmount: totalBebanSample,
        warning: walletBookingWarning,
      },
    }),
  })
}
