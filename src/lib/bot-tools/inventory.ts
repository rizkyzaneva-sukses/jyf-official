import { prisma } from '@/lib/prisma'
import { resolveRange, formatRp } from './helpers'
import { todayWIBStr, addWibDays, wibDayStart, wibDayEnd } from '@/lib/utils'

// ─────────────────────────────────────────────
// Tool 3: Status stok produk
// ─────────────────────────────────────────────
export async function getStockLevels(filter: string = 'low', limit: number = 20) {
    const f = filter as 'all' | 'low' | 'critical'
    const havingClause = f === 'critical' ? 'soh <= 0' : f === 'low' ? 'soh <= rop' : '1=1'

    // PostgreSQL subquery + HAVING via dynamic SQL through raw
    let rows: any[]
    if (f === 'critical') {
        rows = await prisma.$queryRaw`
            SELECT sku, product_name, rop, soh FROM (
                SELECT p.sku, p.product_name, p.rop,
                    p.stok_awal
                    + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    AS soh
                FROM master_products p
                LEFT JOIN inventory_ledger l ON l.sku = p.sku
                WHERE p.is_active = true
                GROUP BY p.sku, p.product_name, p.rop, p.stok_awal, p.last_opname_date
            ) x WHERE soh <= 0
            ORDER BY soh ASC
            LIMIT ${limit}
        `
    } else if (f === 'low') {
        rows = await prisma.$queryRaw`
            SELECT sku, product_name, rop, soh FROM (
                SELECT p.sku, p.product_name, p.rop,
                    p.stok_awal
                    + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    AS soh
                FROM master_products p
                LEFT JOIN inventory_ledger l ON l.sku = p.sku
                WHERE p.is_active = true
                GROUP BY p.sku, p.product_name, p.rop, p.stok_awal, p.last_opname_date
            ) x WHERE soh <= rop
            ORDER BY soh ASC
            LIMIT ${limit}
        `
    } else {
        rows = await prisma.$queryRaw`
            SELECT sku, product_name, rop, soh FROM (
                SELECT p.sku, p.product_name, p.rop,
                    p.stok_awal
                    + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    AS soh
                FROM master_products p
                LEFT JOIN inventory_ledger l ON l.sku = p.sku
                WHERE p.is_active = true
                GROUP BY p.sku, p.product_name, p.rop, p.stok_awal, p.last_opname_date
            ) x
            ORDER BY soh ASC
            LIMIT ${limit}
        `
    }

    const filterLabel = f === 'critical' ? 'Stok Habis' : f === 'low' ? 'Stok Kritis (≤ ROP)' : 'Semua Produk'

    return {
        filter: filterLabel,
        count: rows.length,
        products: rows.map(r => ({
            sku: r.sku,
            productName: r.product_name,
            currentStock: Number(r.soh),
            rop: Number(r.rop),
            status: Number(r.soh) <= 0 ? '🔴 HABIS' : Number(r.soh) <= Number(r.rop) ? '🟡 KRITIS' : '🟢 OK',
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 11: Dead stock — produk dengan stok tinggi tapi tidak ada penjualan
// ─────────────────────────────────────────────
export async function getDeadStock(days: number = 30, limit: number = 25) {
    const cutoffDate = wibDayStart(addWibDays(todayWIBStr(), -days))

    // Cari produk dengan stok > 0 tapi qty_terjual = 0 dalam N hari terakhir
    const rows = await prisma.$queryRaw<any[]>`
        WITH stock_calc AS (
            SELECT p.sku, p.product_name, p.hpp, p.rop,
                p.stok_awal
                + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                AS soh
            FROM master_products p
            LEFT JOIN inventory_ledger l ON l.sku = p.sku
            WHERE p.is_active = true
            GROUP BY p.sku, p.product_name, p.hpp, p.rop, p.stok_awal, p.last_opname_date
        ),
        sales_recent AS (
            SELECT sku, COALESCE(SUM(qty), 0)::int AS qty_sold
            FROM orders
            WHERE trx_date >= ${cutoffDate}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY sku
        )
        SELECT
            s.sku,
            s.product_name,
            s.soh,
            s.hpp,
            s.rop,
            COALESCE(sr.qty_sold, 0)::int AS qty_sold,
            (s.soh * s.hpp)::bigint AS dead_value
        FROM stock_calc s
        LEFT JOIN sales_recent sr ON sr.sku = s.sku
        WHERE s.soh > 0
          AND COALESCE(sr.qty_sold, 0) = 0
        ORDER BY dead_value DESC
        LIMIT ${limit}
    `

    const totalDeadValue = rows.reduce((s, r) => s + Number(r.dead_value), 0)

    return {
        period: `${days} hari terakhir`,
        count: rows.length,
        totalDeadValue: formatRp(totalDeadValue),
        products: rows.map(r => ({
            sku: r.sku,
            productName: r.product_name,
            currentStock: Number(r.soh),
            qtySoldRecent: Number(r.qty_sold),
            hpp: formatRp(Number(r.hpp)),
            deadValue: formatRp(Number(r.dead_value)),
            rop: Number(r.rop),
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 14: Scan & fulfillment performance
// ─────────────────────────────────────────────
export async function getScanFulfillment(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'today', startDate, endDate)

    // Total order vs scanned dalam period (berdasarkan trx_date order)
    const summary = await prisma.$queryRaw<any[]>`
        SELECT
            COUNT(DISTINCT o.id)::int AS total_orders,
            COUNT(DISTINCT CASE WHEN sl.id IS NOT NULL THEN o.id END)::int AS scanned_orders
        FROM orders o
        LEFT JOIN order_scan_logs sl ON sl.order_id = o.id
        WHERE o.trx_date >= ${range.gte}
          AND o.trx_date <= ${range.lte}
          AND o.status NOT ILIKE '%batal%'
          AND o.status NOT ILIKE '%cancel%'
          AND o.status NOT ILIKE '%dibatalkan%'
    `

    // Average fulfillment time (jam) — dari created_at ke scanned_at
    const avgRow = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(
                AVG(EXTRACT(EPOCH FROM (sl.scanned_at - o.created_at)) / 3600.0),
                0
            )::float AS avg_hours
        FROM orders o
        INNER JOIN order_scan_logs sl ON sl.order_id = o.id
        WHERE o.trx_date >= ${range.gte}
          AND o.trx_date <= ${range.lte}
          AND o.status NOT ILIKE '%batal%'
          AND o.status NOT ILIKE '%cancel%'
          AND o.status NOT ILIKE '%dibatalkan%'
          AND sl.scanned_at >= o.created_at
    `

    // Scan progress hari ini (siapa yang scan, berapa banyak)
    const todayStr = todayWIBStr()
    const todayGte = wibDayStart(todayStr)
    const todayLte = wibDayEnd(todayStr)

    const todayScans = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(scanned_by, '(Unknown)') AS scanned_by,
            COUNT(*)::int AS scan_count,
            COUNT(DISTINCT order_no)::int AS unique_orders
        FROM order_scan_logs
        WHERE scanned_at >= ${todayGte}
          AND scanned_at <= ${todayLte}
        GROUP BY scanned_by
        ORDER BY scan_count DESC
    `

    // Pending unscanned (orders in period yang belum di-scan, status non-terkirim)
    const unscannedAging = await prisma.$queryRaw<any[]>`
        SELECT
            CASE
                WHEN EXTRACT(EPOCH FROM (NOW() - o.created_at))/3600 <= 12 THEN '0-12 Jam'
                WHEN EXTRACT(EPOCH FROM (NOW() - o.created_at))/3600 <= 24 THEN '12-24 Jam'
                WHEN EXTRACT(EPOCH FROM (NOW() - o.created_at))/3600 <= 48 THEN '24-48 Jam'
                ELSE '>48 Jam'
            END AS bucket,
            COUNT(*)::int AS cnt
        FROM orders o
        LEFT JOIN order_scan_logs sl ON sl.order_id = o.id
        WHERE sl.id IS NULL
          AND o.status NOT LIKE 'TERKIRIM%'
          AND o.status NOT ILIKE '%batal%'
          AND o.status NOT ILIKE '%cancel%'
          AND o.status NOT ILIKE '%dibatalkan%'
        GROUP BY bucket
        ORDER BY bucket
    `

    const s = summary[0] || { total_orders: 0, scanned_orders: 0 }
    const totalOrders = Number(s.total_orders)
    const scannedOrders = Number(s.scanned_orders)
    const unscanned = totalOrders - scannedOrders
    const avgHours = Number(avgRow[0]?.avg_hours || 0)
    const todayScanTotal = todayScans.reduce((acc, r) => acc + Number(r.scan_count), 0)

    return {
        period: range.label,
        totalOrders,
        scannedOrders,
        unscannedOrders: unscanned,
        scanProgress: totalOrders > 0 ? ((scannedOrders / totalOrders) * 100).toFixed(1) + '%' : '0%',
        avgFulfillmentHours: avgHours.toFixed(1),
        todayScanTotal,
        todayScanByOperator: todayScans.map(r => ({
            operator: r.scanned_by,
            scanCount: Number(r.scan_count),
            uniqueOrders: Number(r.unique_orders),
        })),
        unscannedAging: unscannedAging.map(r => ({ bucket: r.bucket, count: Number(r.cnt) })),
    }
}
