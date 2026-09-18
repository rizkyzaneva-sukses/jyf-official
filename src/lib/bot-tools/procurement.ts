import { prisma } from '@/lib/prisma'
import { formatRp, fmtWIBDate } from './helpers'
import { nowWIB as getNowWIB } from '@/lib/utils'

// ─────────────────────────────────────────────
// Tool 10: Purchase Order status
// ─────────────────────────────────────────────
export async function getPurchaseOrderStatus(filter: 'open' | 'overdue' | 'all' = 'open') {
    const nowWIB = getNowWIB()

    let rows: any[]
    if (filter === 'overdue') {
        rows = await prisma.$queryRaw<any[]>`
            SELECT
                id, po_number, vendor_name, po_date, expected_date,
                status, payment_status,
                total_items, total_qty_order, total_qty_received,
                total_amount, total_paid
            FROM purchase_orders
            WHERE status IN ('OPEN', 'PARTIAL')
              AND expected_date IS NOT NULL
              AND expected_date < ${nowWIB}
            ORDER BY expected_date ASC
        `
    } else if (filter === 'all') {
        rows = await prisma.$queryRaw<any[]>`
            SELECT
                id, po_number, vendor_name, po_date, expected_date,
                status, payment_status,
                total_items, total_qty_order, total_qty_received,
                total_amount, total_paid
            FROM purchase_orders
            ORDER BY po_date DESC
            LIMIT 50
        `
    } else {
        rows = await prisma.$queryRaw<any[]>`
            SELECT
                id, po_number, vendor_name, po_date, expected_date,
                status, payment_status,
                total_items, total_qty_order, total_qty_received,
                total_amount, total_paid
            FROM purchase_orders
            WHERE status IN ('OPEN', 'PARTIAL')
            ORDER BY expected_date ASC NULLS LAST, po_date ASC
        `
    }

    const totalAmount = rows.reduce((s, r) => s + Number(r.total_amount), 0)
    const totalPaid = rows.reduce((s, r) => s + Number(r.total_paid), 0)
    const totalUnpaid = totalAmount - totalPaid
    const overdueCount = rows.filter(
        r => r.expected_date && new Date(r.expected_date) < nowWIB && r.status !== 'COMPLETED' && r.status !== 'CANCELLED'
    ).length

    const filterLabel =
        filter === 'overdue' ? 'PO Overdue (lewat tanggal kirim)' :
        filter === 'all' ? 'Semua PO (50 terakhir)' :
        'PO Belum Selesai (OPEN/PARTIAL)'

    return {
        filter: filterLabel,
        count: rows.length,
        overdueCount,
        totalAmount: formatRp(totalAmount),
        totalPaid: formatRp(totalPaid),
        totalUnpaid: formatRp(totalUnpaid),
        items: rows.slice(0, 25).map(r => {
            const isOverdueItem =
                r.expected_date &&
                new Date(r.expected_date) < nowWIB &&
                r.status !== 'COMPLETED' &&
                r.status !== 'CANCELLED'
            const fulfillmentPct = r.total_qty_order > 0
                ? Math.round((Number(r.total_qty_received) / Number(r.total_qty_order)) * 100)
                : 0
            return {
                poNumber: r.po_number,
                vendor: r.vendor_name,
                poDate: fmtWIBDate(new Date(r.po_date)),
                expectedDate: r.expected_date ? fmtWIBDate(new Date(r.expected_date)) : null,
                status: r.status,
                paymentStatus: r.payment_status,
                qtyOrder: Number(r.total_qty_order),
                qtyReceived: Number(r.total_qty_received),
                fulfillmentPct: fulfillmentPct + '%',
                totalAmount: formatRp(Number(r.total_amount)),
                totalPaid: formatRp(Number(r.total_paid)),
                sisaBayar: formatRp(Number(r.total_amount) - Number(r.total_paid)),
                isOverdue: isOverdueItem,
            }
        }),
    }
}
