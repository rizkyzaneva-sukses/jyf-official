/**
 * Monthly report — Laba Rugi basis kas (pencairan) + cuplikan ops.
 * Dikirim setiap tanggal 2 pagi (recap bulan sebelumnya).
 */

import { prisma } from '@/lib/prisma'
import { computeProfitLoss } from '@/lib/pnl-helpers'
import { todayWIBStr } from '@/lib/utils'

function fmt(n: number): string {
    return 'Rp ' + Math.round(n || 0).toLocaleString('id-ID')
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function pctChange(current: number, previous: number): string {
    if (previous === 0) return current > 0 ? '+∞' : '0%'
    const pct = ((current - previous) / previous) * 100
    const sign = pct >= 0 ? '+' : ''
    return `${sign}${pct.toFixed(1)}%`
}

function trendIcon(current: number, previous: number): string {
    return current >= previous ? '📈' : '📉'
}

function getPrevMonthRange(): { start: string; end: string; label: string; prevStart: string; prevEnd: string; prevLabel: string } {
    const today = todayWIBStr()
    const [yearStr, monthStr] = today.split('-')
    let year = parseInt(yearStr)
    let month = parseInt(monthStr)
    let lastMonth = month - 1
    let lastYear = year
    if (lastMonth === 0) { lastMonth = 12; lastYear = year - 1 }
    let prevMonth = lastMonth - 1
    let prevYear = lastYear
    if (prevMonth === 0) { prevMonth = 12; prevYear = lastYear - 1 }

    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

    const lastMonthStr = String(lastMonth).padStart(2, '0')
    const prevMonthStr = String(prevMonth).padStart(2, '0')

    const lastDay = new Date(lastYear, lastMonth, 0).getDate()
    const prevLastDay = new Date(prevYear, prevMonth, 0).getDate()

    return {
        start: `${lastYear}-${lastMonthStr}-01`,
        end: `${lastYear}-${lastMonthStr}-${String(lastDay).padStart(2, '0')}`,
        label: `${monthNames[lastMonth - 1]} ${lastYear}`,
        prevStart: `${prevYear}-${prevMonthStr}-01`,
        prevEnd: `${prevYear}-${prevMonthStr}-${String(prevLastDay).padStart(2, '0')}`,
        prevLabel: `${monthNames[prevMonth - 1]} ${prevYear}`,
    }
}

export async function buildMonthlyReport(): Promise<string> {
    const r = getPrevMonthRange()
    const monthStart = new Date(`${r.start}T00:00:00+07:00`)
    const monthEnd = new Date(`${r.end}T23:59:59.999+07:00`)
    const prevMonthStart = new Date(`${r.prevStart}T00:00:00+07:00`)
    const prevMonthEnd = new Date(`${r.prevEnd}T23:59:59.999+07:00`)

    const [
        pl,
        plPrev,
        monthStats,
        prevMonthStats,
        topProducts,
        bottomProducts,
        platformBreakdown,
        platformBreakdownPrev,
        expenseBreakdown,
        utangPiutang,
        topCities,
    ] = await Promise.all([
        computeProfitLoss(monthStart, monthEnd),
        computeProfitLoss(prevMonthStart, prevMonthEnd),
        prisma.$queryRaw<any[]>`
            SELECT
                CASE
                    WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                    ELSE 'valid'
                END AS grp,
                COUNT(DISTINCT order_no)::int AS cnt,
                SUM(qty)::int AS total_qty,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
                COALESCE(SUM(hpp * qty), 0)::bigint AS total_hpp
            FROM orders
            WHERE trx_date >= ${monthStart} AND trx_date <= ${monthEnd}
            GROUP BY grp
        `,
        prisma.$queryRaw<any[]>`
            SELECT
                CASE
                    WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                    ELSE 'valid'
                END AS grp,
                COUNT(DISTINCT order_no)::int AS cnt,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
                COALESCE(SUM(hpp * qty), 0)::bigint AS total_hpp
            FROM orders
            WHERE trx_date >= ${prevMonthStart} AND trx_date <= ${prevMonthEnd}
            GROUP BY grp
        `,
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(product_name, sku, '-') AS product_name,
                SUM(qty)::int AS total_qty,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${monthStart} AND trx_date <= ${monthEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY product_name, sku
            ORDER BY total_qty DESC
            LIMIT 10
        `,
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(product_name, sku, '-') AS product_name,
                SUM(qty)::int AS total_qty
            FROM orders
            WHERE trx_date >= ${monthStart} AND trx_date <= ${monthEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY product_name, sku
            HAVING SUM(qty) > 0
            ORDER BY total_qty ASC
            LIMIT 5
        `,
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(platform, 'Unknown') AS platform,
                COUNT(DISTINCT order_no)::int AS cnt,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${monthStart} AND trx_date <= ${monthEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
            ORDER BY total_omzet DESC
        `,
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(platform, 'Unknown') AS platform,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${prevMonthStart} AND trx_date <= ${prevMonthEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
        `,
        // OPEX breakdown — exclude Bayar Vendor (bukan OPEX, sudah di HPP)
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(category, '(Tanpa Kategori)') AS category,
                COALESCE(SUM(ABS(amount)), 0)::bigint AS total_amount
            FROM wallet_ledger
            WHERE trx_type = 'EXPENSE'
              AND trx_date >= ${monthStart}
              AND trx_date <= ${monthEnd}
              AND (category IS NULL OR category NOT ILIKE 'Bayar Vendor%')
            GROUP BY category
            ORDER BY total_amount DESC
            LIMIT 8
        `,
        prisma.$queryRaw<any[]>`
            SELECT
                'utang' AS kind,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(amount - amount_paid), 0)::bigint AS total
            FROM utangs
            WHERE status IN ('OUTSTANDING', 'PARTIAL')
            UNION ALL
            SELECT
                'piutang' AS kind,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(amount - amount_collected), 0)::bigint AS total
            FROM piutangs
            WHERE status IN ('OUTSTANDING', 'PARTIAL')
        `,
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(NULLIF(TRIM(city), ''), '(Tidak Diketahui)') AS city,
                COUNT(DISTINCT order_no)::int AS order_count,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${monthStart} AND trx_date <= ${monthEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY city
            ORDER BY order_count DESC
            LIMIT 5
        `,
    ])

    const mMap = Object.fromEntries(monthStats.map((row: any) => [
        row.grp,
        { cnt: Number(row.cnt), qty: Number(row.total_qty || 0), omzet: Number(row.total_omzet), hpp: Number(row.total_hpp) }
    ]))
    const mValid = mMap['valid'] ?? { cnt: 0, qty: 0, omzet: 0, hpp: 0 }
    const mBatal = mMap['batal'] ?? { cnt: 0, qty: 0, omzet: 0, hpp: 0 }
    const omzetOps = mValid.omzet
    const hppOps = mValid.hpp
    const gpOps = omzetOps - hppOps
    const marginOps = omzetOps > 0 ? ((gpOps / omzetOps) * 100).toFixed(1) : '0'
    const totalOrder = mValid.cnt + mBatal.cnt
    const aov = mValid.cnt > 0 ? omzetOps / mValid.cnt : 0

    const pmMap = Object.fromEntries(prevMonthStats.map((row: any) => [
        row.grp,
        { cnt: Number(row.cnt), omzet: Number(row.total_omzet), hpp: Number(row.total_hpp) }
    ]))
    const pmValid = pmMap['valid'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const pmOmzet = pmValid.omzet

    const pmPlatformMap = Object.fromEntries(
        platformBreakdownPrev.map((row: any) => [row.platform, Number(row.total_omzet)])
    )

    const expenseTotal = expenseBreakdown.reduce((s: number, row: any) => s + Number(row.total_amount), 0)

    const upMap = Object.fromEntries(utangPiutang.map((row: any) => [row.kind, { cnt: Number(row.cnt), total: Number(row.total) }]))
    const utangData = upMap['utang'] ?? { cnt: 0, total: 0 }
    const piutangData = upMap['piutang'] ?? { cnt: 0, total: 0 }

    const sep = '━━━━━━━━━━━━━━━━━━━━━━━'
    const medalEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']

    const topProductLines = topProducts.length === 0
        ? '  <i>(belum ada data)</i>'
        : topProducts.map((p: any, i: number) =>
            `  ${medalEmoji[i] ?? '▪️'} ${esc(p.product_name)} — <b>${Number(p.total_qty)} pcs</b> (${fmt(Number(p.total_omzet))})`
          ).join('\n')

    const bottomProductLines = bottomProducts.length === 0
        ? '  <i>(tidak ada data)</i>'
        : bottomProducts.map((p: any) =>
            `  ▫️ ${esc(p.product_name)} — ${Number(p.total_qty)} pcs`
          ).join('\n')

    const platformLines = platformBreakdown.length === 0
        ? '  <i>(belum ada data)</i>'
        : platformBreakdown.map((p: any) => {
            const cur = Number(p.total_omzet)
            const prev = pmPlatformMap[p.platform] ?? 0
            const share = omzetOps > 0 ? ((cur / omzetOps) * 100).toFixed(1) : '0'
            return `  ▪️ ${esc(p.platform)} — <b>${fmt(cur)}</b> (${share}%) ${trendIcon(cur, prev)} ${pctChange(cur, prev)}`
          }).join('\n')

    const expenseLines = expenseBreakdown.length === 0
        ? '  <i>(tidak ada pengeluaran tercatat)</i>'
        : expenseBreakdown.map((e: any) => {
            const amt = Number(e.total_amount)
            const share = expenseTotal > 0 ? ((amt / expenseTotal) * 100).toFixed(1) : '0'
            return `  ▪️ ${esc(e.category)} — <b>${fmt(amt)}</b> (${share}%)`
          }).join('\n')

    const cityLines = topCities.length === 0
        ? '  <i>(belum ada data)</i>'
        : topCities.map((c: any, i: number) =>
            `  ${medalEmoji[i] ?? '▪️'} ${esc(c.city)} — <b>${Number(c.order_count)} order</b> (${fmt(Number(c.total_omzet))})`
          ).join('\n')

    const plMargin = pl.pencairanBersih > 0
        ? ((pl.labaKotor / pl.pencairanBersih) * 100).toFixed(1)
        : '0'

    const lines = [
        `📊 <b>LAPORAN BULANAN — ELYASR</b>`,
        `🗓️ ${esc(r.label)} (vs ${esc(r.prevLabel)})`,
        `📌 <i>Laba Rugi = basis pencairan · Ops = order masuk</i>`,
        sep, ``,

        `💰 <b>LABA RUGI (basis pencairan)</b>`, ``,
        `💵 Pencairan Bersih · <b>${fmt(pl.pencairanBersih)}</b>  <i>(${pl.totalOrdersPaid} order cair)</i>`,
        `🏷️ HPP (order cair, non-retur) · ${fmt(pl.hpp)}`,
        `💎 Laba Kotor     · <b>${fmt(pl.labaKotor)}</b> (${plMargin}%)`,
        `💸 Beban OPEX     · <b>${fmt(pl.bebanOperasional)}</b>`,
        `📣 Iklan (bagian OPEX) · ${fmt(pl.iklanTotal)}  <b>(${pl.iklanPctPencairan}% thd pencairan)</b>`,
        `📈 Laba Bersih Ops · <b>${fmt(pl.labaBersihOperasional)}</b>`,
        `➕ Pendapatan lain · ${fmt(pl.otherIncome)}`,
        `✅ <b>LABA BERSIH · ${fmt(pl.labaBersih)}</b>`,
        pl.totalBayarVendor > 0
            ? `ℹ️ Bayar Vendor · ${fmt(pl.totalBayarVendor)} <i>(bukan OPEX — sudah di HPP)</i>`
            : '',
        ``,

        `📈 <b>GROWTH LABA RUGI vs ${esc(r.prevLabel)}</b>`,
        `${trendIcon(pl.pencairanBersih, plPrev.pencairanBersih)} Pencairan · <b>${pctChange(pl.pencairanBersih, plPrev.pencairanBersih)}</b>  <i>(${fmt(plPrev.pencairanBersih)})</i>`,
        `${trendIcon(pl.labaBersih, plPrev.labaBersih)} Laba Bersih · <b>${pctChange(pl.labaBersih, plPrev.labaBersih)}</b>  <i>(${fmt(plPrev.labaBersih)})</i>`, ``,

        sep, ``,
        `🛒 <b>CUPLIKAN OPS (order masuk · trx_date)</b>`,
        `  Order  · <b>${totalOrder} paket</b> (valid: ${mValid.cnt}, batal: ${mBatal.cnt})`,
        `  Qty    · <b>${mValid.qty} pcs</b>`,
        `  Omzet ops · <b>${fmt(omzetOps)}</b>  ${trendIcon(omzetOps, pmOmzet)} ${pctChange(omzetOps, pmOmzet)}`,
        `  GP ops · ${fmt(gpOps)} (${marginOps}%) · AOV ${fmt(aov)}`, ``,

        sep, ``,
        `🏪 <b>OMZET OPS PER PLATFORM</b>`,
        platformLines, ``,

        sep, ``,
        `🏆 <b>TOP 10 PRODUK (ops)</b>`,
        topProductLines, ``,
        `🔻 <b>5 PRODUK TER-LAMBAT</b>`,
        bottomProductLines, ``,

        sep, ``,
        `📍 <b>TOP 5 KOTA (ops)</b>`,
        cityLines, ``,

        sep, ``,
        `💼 <b>BREAKDOWN OPEX (tanpa Bayar Vendor)</b>`,
        expenseLines, ``,

        sep, ``,
        `💳 <b>UTANG &amp; PIUTANG OUTSTANDING</b>`,
        `  💸 Utang   · ${utangData.cnt} item · <b>${fmt(utangData.total)}</b>`,
        `  💰 Piutang · ${piutangData.cnt} item · <b>${fmt(piutangData.total)}</b>`,
        `  ⚖️ Net Position · <b>${fmt(piutangData.total - utangData.total)}</b>`, ``,

        sep,
        `🤖 <i>Auto monthly · tgl 2 · Laba Rugi kas · Elyasr Ops</i>`,
    ].filter(line => line !== '')

    return lines.join('\n')
}
