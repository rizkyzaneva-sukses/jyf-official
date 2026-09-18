import { prisma } from '@/lib/prisma'
import { resolveRange, formatRp, getCustomDateRange } from './helpers'

// ─────────────────────────────────────────────
// Tool 12: Geo analysis — top kota/provinsi
// ─────────────────────────────────────────────
export async function getGeoAnalysis(period?: string, startDate?: string, endDate?: string, limit: number = 10) {
    const range = resolveRange(period || 'week', startDate, endDate)

    const cityRows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(NULLIF(TRIM(city), ''), '(Tidak Diketahui)') AS city,
            COALESCE(NULLIF(TRIM(province), ''), '-') AS province,
            COUNT(*)::int AS order_count,
            SUM(qty)::int AS total_qty,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
        FROM orders
        WHERE trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY city, province
        ORDER BY order_count DESC
        LIMIT ${limit}
    `

    const provinceRows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(NULLIF(TRIM(province), ''), '(Tidak Diketahui)') AS province,
            COUNT(*)::int AS order_count,
            COUNT(DISTINCT city)::int AS city_count,
            SUM(qty)::int AS total_qty,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
        FROM orders
        WHERE trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY province
        ORDER BY order_count DESC
        LIMIT ${limit}
    `

    const totalOrders = cityRows.reduce((s, r) => s + Number(r.order_count), 0)

    return {
        period: range.label,
        topCities: cityRows.map((r, i) => ({
            rank: i + 1,
            city: r.city,
            province: r.province,
            orderCount: Number(r.order_count),
            totalQty: Number(r.total_qty),
            totalOmzet: formatRp(Number(r.total_omzet)),
            share: totalOrders > 0 ? ((Number(r.order_count) / totalOrders) * 100).toFixed(1) + '%' : '0%',
        })),
        topProvinces: provinceRows.map((r, i) => ({
            rank: i + 1,
            province: r.province,
            cityCount: Number(r.city_count),
            orderCount: Number(r.order_count),
            totalQty: Number(r.total_qty),
            totalOmzet: formatRp(Number(r.total_omzet)),
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 13: Customer analysis — repeat buyer & new vs returning
// ─────────────────────────────────────────────
export async function getCustomerAnalysis(period?: string, startDate?: string, endDate?: string, limit: number = 15) {
    const range = resolveRange(period || 'month', startDate, endDate)

    // Top buyers in period (use buyer_username || receiver_name as identity)
    const topBuyers = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), ''), '(Anonim)') AS buyer,
            COUNT(DISTINCT order_no)::int AS order_count,
            SUM(qty)::int AS total_qty,
            COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
        FROM orders
        WHERE trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
          AND status NOT ILIKE '%batal%'
          AND status NOT ILIKE '%cancel%'
          AND status NOT ILIKE '%dibatalkan%'
        GROUP BY buyer
        ORDER BY total_omzet DESC
        LIMIT ${limit}
    `

    // Repeat customer analysis: buyers who appear before period AND in period = returning
    const repeatStats = await prisma.$queryRaw<any[]>`
        WITH buyers_in_period AS (
            SELECT DISTINCT
                COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) AS buyer
            FROM orders
            WHERE trx_date >= ${range.gte}
              AND trx_date <= ${range.lte}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
              AND COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) IS NOT NULL
        ),
        buyers_before AS (
            SELECT DISTINCT
                COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) AS buyer
            FROM orders
            WHERE trx_date < ${range.gte}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
              AND COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) IS NOT NULL
        )
        SELECT
            (SELECT COUNT(*)::int FROM buyers_in_period) AS total_unique,
            (SELECT COUNT(*)::int FROM buyers_in_period bp INNER JOIN buyers_before bb ON bp.buyer = bb.buyer) AS returning_count
    `

    // Repeat buyer count (>1 order in period)
    const repeatInPeriod = await prisma.$queryRaw<any[]>`
        SELECT
            buyer,
            order_count
        FROM (
            SELECT
                COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) AS buyer,
                COUNT(DISTINCT order_no)::int AS order_count
            FROM orders
            WHERE trx_date >= ${range.gte}
              AND trx_date <= ${range.lte}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
              AND COALESCE(NULLIF(TRIM(buyer_username), ''), NULLIF(TRIM(receiver_name), '')) IS NOT NULL
            GROUP BY buyer
        ) x
        WHERE order_count > 1
    `

    const stats = repeatStats[0] || { total_unique: 0, returning_count: 0 }
    const totalUnique = Number(stats.total_unique)
    const returning = Number(stats.returning_count)
    const newBuyers = totalUnique - returning
    const repeatInPeriodCount = repeatInPeriod.length

    return {
        period: range.label,
        uniqueBuyers: totalUnique,
        newBuyers,
        returningBuyers: returning,
        returningRate: totalUnique > 0 ? ((returning / totalUnique) * 100).toFixed(1) + '%' : '0%',
        repeatBuyersInPeriod: repeatInPeriodCount,
        repeatRateInPeriod: totalUnique > 0 ? ((repeatInPeriodCount / totalUnique) * 100).toFixed(1) + '%' : '0%',
        topBuyers: topBuyers.map((r, i) => ({
            rank: i + 1,
            buyer: r.buyer,
            orderCount: Number(r.order_count),
            totalQty: Number(r.total_qty),
            totalOmzet: formatRp(Number(r.total_omzet)),
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 15: Period comparison (helper) — bandingkan dua range
// ─────────────────────────────────────────────
export async function getPeriodComparison(
    currentStart: string,
    currentEnd: string,
    previousStart: string,
    previousEnd: string
) {
    const cur = getCustomDateRange(currentStart, currentEnd)
    const prev = getCustomDateRange(previousStart, previousEnd)

    const fetchSummary = async (gte: Date, lte: Date) => {
        const rows = await prisma.$queryRaw<any[]>`
            SELECT
                COUNT(*)::int AS order_count,
                SUM(qty)::int AS total_qty,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
                COALESCE(SUM(hpp * qty), 0)::bigint AS total_hpp
            FROM orders
            WHERE trx_date >= ${gte}
              AND trx_date <= ${lte}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `
        const r = rows[0] || { order_count: 0, total_qty: 0, total_omzet: 0, total_hpp: 0 }
        const omzet = Number(r.total_omzet)
        const hpp = Number(r.total_hpp)
        return {
            orderCount: Number(r.order_count),
            totalQty: Number(r.total_qty || 0),
            omzet,
            hpp,
            grossProfit: omzet - hpp,
        }
    }

    const [curStats, prevStats] = await Promise.all([
        fetchSummary(cur.gte, cur.lte),
        fetchSummary(prev.gte, prev.lte),
    ])

    const pct = (a: number, b: number): string => {
        if (b === 0) return a > 0 ? '+∞%' : '0%'
        const v = ((a - b) / b) * 100
        return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
    }

    return {
        currentPeriod: cur.label,
        previousPeriod: prev.label,
        current: {
            orderCount: curStats.orderCount,
            totalQty: curStats.totalQty,
            omzet: formatRp(curStats.omzet),
            hpp: formatRp(curStats.hpp),
            grossProfit: formatRp(curStats.grossProfit),
        },
        previous: {
            orderCount: prevStats.orderCount,
            totalQty: prevStats.totalQty,
            omzet: formatRp(prevStats.omzet),
            hpp: formatRp(prevStats.hpp),
            grossProfit: formatRp(prevStats.grossProfit),
        },
        growth: {
            orderCount: pct(curStats.orderCount, prevStats.orderCount),
            totalQty: pct(curStats.totalQty, prevStats.totalQty),
            omzet: pct(curStats.omzet, prevStats.omzet),
            grossProfit: pct(curStats.grossProfit, prevStats.grossProfit),
        },
    }
}
