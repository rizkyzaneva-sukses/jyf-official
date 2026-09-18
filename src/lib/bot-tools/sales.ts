import { prisma } from '@/lib/prisma'
import { resolveRange, formatRp } from './helpers'

// ─────────────────────────────────────────────
// Tool 1: Ranking produk terlaris
// ─────────────────────────────────────────────
export async function getSalesRanking(period?: string, limit: number = 10, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'week', startDate, endDate)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(sku, '-') AS sku,
            COALESCE(product_name, sku, '-') AS product_name,
            SUM(qty)::int AS total_qty,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
            COUNT(*)::int AS order_count
        FROM orders
        WHERE trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY sku, product_name
        ORDER BY total_qty DESC
        LIMIT ${limit}
    `

    return {
        period: range.label,
        ranking: rows.map((r, i) => ({
            rank: i + 1,
            sku: r.sku,
            productName: r.product_name,
            totalQty: Number(r.total_qty),
            totalOmzet: formatRp(Number(r.total_omzet)),
            orderCount: Number(r.order_count),
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 2: Ringkasan omzet & profit
// ─────────────────────────────────────────────
export async function getRevenueSummary(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'today', startDate, endDate)

    // Gunakan GROUP BY status (sama dengan daily-report & dashboard) agar HPP terhitung benar
    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            CASE
                WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                ELSE 'valid'
            END AS grp,
            COUNT(*)::int AS cnt,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
            COALESCE(SUM(hpp * qty), 0)::bigint AS total_hpp
        FROM orders
        WHERE trx_date >= ${range.gte} AND trx_date <= ${range.lte}
        GROUP BY grp
    `

    const map = Object.fromEntries(rows.map(r => [
        r.grp,
        { cnt: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
    ]))
    const valid = map['valid'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const batal = map['batal'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const omzet = valid.omzet
    const hpp   = valid.hpp
    const gp    = omzet - hpp

    return {
        period: range.label,
        totalOrders: valid.cnt + batal.cnt,
        validOrders: valid.cnt,
        batalCount:  batal.cnt,
        omzet:       formatRp(omzet),
        hpp:         formatRp(hpp),
        grossProfit: formatRp(gp),
        marginPct:   omzet > 0 ? ((gp / omzet) * 100).toFixed(1) + '%' : '0%',
    }
}

// ─────────────────────────────────────────────
// Tool 4: Ringkasan order per status
// ─────────────────────────────────────────────
export async function getOrdersSummary(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'today', startDate, endDate)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            CASE
                WHEN status LIKE 'TERKIRIM%' THEN 'terkirim'
                WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                ELSE 'pending'
            END AS grp,
            COUNT(*)::int AS cnt,
            COALESCE(SUM(real_omzet), 0)::bigint AS omzet
        FROM orders
        WHERE trx_date >= ${range.gte} AND trx_date <= ${range.lte}
        GROUP BY grp
    `

    const map = Object.fromEntries(rows.map(r => [r.grp, { count: Number(r.cnt), omzet: Number(r.omzet) }]))
    const terkirim = map['terkirim']  ?? { count: 0, omzet: 0 }
    const pending  = map['pending']   ?? { count: 0, omzet: 0 }
    const batal    = map['batal']     ?? { count: 0, omzet: 0 }
    const total    = terkirim.count + pending.count + batal.count

    // Aging backlog
    const aging = await prisma.$queryRaw<any[]>`
        SELECT
            CASE
                WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 12 THEN '0-12 Jam'
                WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 24 THEN '12-24 Jam'
                WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 48 THEN '24-48 Jam'
                ELSE '>48 Jam'
            END AS bucket,
            COUNT(*)::int AS cnt
        FROM orders
        WHERE status NOT LIKE 'TERKIRIM%'
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY bucket
        ORDER BY bucket
    `

    return {
        period: range.label,
        total,
        terkirim:  { count: terkirim.count, omzet: formatRp(terkirim.omzet) },
        pending:   { count: pending.count,  omzet: formatRp(pending.omzet)  },
        batal:     { count: batal.count },
        agingBacklog: aging.map(a => ({ bucket: a.bucket, count: Number(a.cnt) })),
    }
}

// ─────────────────────────────────────────────
// Tool 5: Breakdown per platform
// ─────────────────────────────────────────────
export async function getPlatformBreakdown(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'week', startDate, endDate)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(platform, 'Unknown') AS platform,
            COUNT(*)::int AS cnt,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
            SUM(qty)::int AS total_qty
        FROM orders
        WHERE trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY platform
        ORDER BY total_omzet DESC
    `

    const grandTotal = rows.reduce((s, r) => s + Number(r.total_omzet), 0)

    return {
        period: range.label,
        platforms: rows.map(r => ({
            platform:   r.platform,
            orderCount: Number(r.cnt),
            totalQty:   Number(r.total_qty),
            totalOmzet: formatRp(Number(r.total_omzet)),
            share:      grandTotal > 0 ? ((Number(r.total_omzet) / grandTotal) * 100).toFixed(1) + '%' : '0%',
        })),
        grandTotalOmzet: formatRp(grandTotal),
    }
}

// ─────────────────────────────────────────────
// Tool 8: Payout summary per platform
// ─────────────────────────────────────────────
export async function getPayoutSummary(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'month', startDate, endDate)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(platform, 'Unknown') AS platform,
            COUNT(*)::int AS payout_count,
            COALESCE(SUM(omzet), 0)::bigint AS total_omzet,
            COALESCE(SUM(platform_fee), 0)::bigint AS total_platform_fee,
            COALESCE(SUM(ams_fee), 0)::bigint AS total_ams_fee,
            COALESCE(SUM(platform_fee_other), 0)::bigint AS total_other_fee,
            COALESCE(SUM(beban_ongkir), 0)::bigint AS total_beban_ongkir,
            COALESCE(SUM(total_income), 0)::bigint AS total_income
        FROM payouts
        WHERE released_date >= ${range.gte}
          AND released_date <= ${range.lte}
        GROUP BY platform
        ORDER BY total_income DESC
    `

    const grandIncome = rows.reduce((s, r) => s + Number(r.total_income), 0)
    const grandOmzet = rows.reduce((s, r) => s + Number(r.total_omzet), 0)
    const grandFees = rows.reduce(
        (s, r) =>
            s +
            Number(r.total_platform_fee) +
            Number(r.total_ams_fee) +
            Number(r.total_other_fee) +
            Number(r.total_beban_ongkir),
        0
    )

    return {
        period: range.label,
        totalPayoutIncome: formatRp(grandIncome),
        totalOmzet: formatRp(grandOmzet),
        totalFees: formatRp(grandFees),
        netRatio: grandOmzet > 0 ? ((grandIncome / grandOmzet) * 100).toFixed(1) + '%' : '0%',
        platforms: rows.map(r => ({
            platform: r.platform,
            payoutCount: Number(r.payout_count),
            omzet: formatRp(Number(r.total_omzet)),
            platformFee: formatRp(Number(r.total_platform_fee)),
            amsFee: formatRp(Number(r.total_ams_fee)),
            otherFee: formatRp(Number(r.total_other_fee)),
            bebanOngkir: formatRp(Number(r.total_beban_ongkir)),
            netIncome: formatRp(Number(r.total_income)),
            share: grandIncome > 0 ? ((Number(r.total_income) / grandIncome) * 100).toFixed(1) + '%' : '0%',
        })),
    }
}
