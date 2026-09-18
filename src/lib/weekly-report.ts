/**
 * Weekly report builder — perbandingan minggu ini vs minggu lalu.
 * Senin–Minggu, dikirim setiap Senin pagi (recap minggu lalu).
 *
 * Versi CEO: recap finansial + lapisan keputusan
 * (kas/runway, progress target bulan ini, ROAS mingguan,
 * dan 1–3 Eksekusi Minggu Depan yang di-derive otomatis
 * dari stok kritis, PO overdue, & piutang/utang tempo).
 */

import { prisma } from '@/lib/prisma'
import {
  getTotalCash,
  getBurnRate,
  getMonthlyTarget,
  ymWIB,
  monthPacing,
} from '@/lib/dashboard-helpers'
import { todayWIBStr, addWibDays, wibMondayOfWeek, wibYmd } from '@/lib/utils'

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

function fmtWIBDateShort(dateStr: string): string {
    const [, m, day] = dateStr.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des']
    return `${Number(day)} ${months[Number(m) - 1]}`
}

function fmtTglShort(d: any): string {
    const ymd = wibYmd(new Date(d))
    if (!ymd) return '-'
    const [, m, day] = ymd.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des']
    return `${Number(day)} ${months[Number(m) - 1]}`
}

export async function buildWeeklyReport(): Promise<string> {
    const today = todayWIBStr()
    // "Minggu lalu" = Senin minus 7 sampai Minggu minus 1
    const thisMonday = wibMondayOfWeek(today)
    const lastMonday = addWibDays(thisMonday, -7)
    const lastSunday = addWibDays(thisMonday, -1)
    const prevMonday = addWibDays(lastMonday, -7)
    const prevSunday = addWibDays(lastMonday, -1)

    const lastWeekStart = new Date(`${lastMonday}T00:00:00+07:00`)
    const lastWeekEnd = new Date(`${lastSunday}T23:59:59+07:00`)
    const prevWeekStart = new Date(`${prevMonday}T00:00:00+07:00`)
    const prevWeekEnd = new Date(`${prevSunday}T23:59:59+07:00`)

    // Untuk kas/runway/tempo/adspend: basis "hari ini"
    const gteToday = new Date(`${today}T00:00:00+07:00`)
    const lteToday = new Date(`${today}T23:59:59+07:00`)
    // Progress bulan ini
    const monthStart = today.slice(0, 7) + '-01'
    const gteMonth = new Date(`${monthStart}T00:00:00+07:00`)
    // Tempo "minggu depan" (forward 7 hari)
    const tempoFrom = gteToday
    const tempoTo = new Date(`${addWibDays(today, 7)}T23:59:59+07:00`)

    const [
        lastWeekStats,
        prevWeekStats,
        topProducts,
        platformBreakdown,
        platformBreakdownPrev,
        utangPiutang,
        stockCriticalRows,
        poOverdue,
        utangPiutangTempo,
        adSpendRows,
        monthOmzet,
        kasTotal,
        burn,
        target,
    ] = await Promise.all([

        // Last week stats — omzet, hpp, count
        prisma.$queryRaw<any[]>`
            SELECT
                CASE
                    WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                    ELSE 'valid'
                END AS grp,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
                COALESCE(SUM(hpp * qty), 0)::bigint AS total_hpp
            FROM orders
            WHERE trx_date >= ${lastWeekStart} AND trx_date <= ${lastWeekEnd}
            GROUP BY grp
        `,

        // Prev week stats
        prisma.$queryRaw<any[]>`
            SELECT
                CASE
                    WHEN status ILIKE '%batal%' OR status ILIKE '%cancel%' OR status ILIKE '%dibatalkan%' THEN 'batal'
                    ELSE 'valid'
                END AS grp,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet,
                COALESCE(SUM(hpp * qty), 0)::bigint AS total_hpp
            FROM orders
            WHERE trx_date >= ${prevWeekStart} AND trx_date <= ${prevWeekEnd}
            GROUP BY grp
        `,

        // Top products last week
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(product_name, sku, '-') AS product_name,
                SUM(qty)::int AS total_qty,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${lastWeekStart} AND trx_date <= ${lastWeekEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY product_name, sku
            ORDER BY total_qty DESC
            LIMIT 10
        `,

        // Platform breakdown last week
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(platform, 'Unknown') AS platform,
                COUNT(*)::int AS cnt,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${lastWeekStart} AND trx_date <= ${lastWeekEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
            ORDER BY total_omzet DESC
        `,

        // Platform breakdown prev week (untuk growth per platform)
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(platform, 'Unknown') AS platform,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${prevWeekStart} AND trx_date <= ${prevWeekEnd}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
        `,

        // Utang piutang outstanding
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

        // Stok kritis: SOH ≤ ROP ATAU minus
        prisma.$queryRaw<any[]>`
            SELECT sku, product_name, soh, rop FROM (
                SELECT p.sku, p.product_name, p.rop,
                    p.stok_awal
                    + COALESCE(SUM(CASE WHEN l.direction = 'IN'  AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
                    AS soh
                FROM master_products p
                LEFT JOIN inventory_ledger l ON l.sku = p.sku
                WHERE p.is_active = true
                GROUP BY p.sku, p.product_name, p.stok_awal, p.rop, p.last_opname_date
            ) x WHERE soh <= rop OR soh < 0
            ORDER BY soh ASC
        `,

        // PO overdue (expected_date lewat, belum selesai)
        prisma.$queryRaw<any[]>`
            SELECT po_number, vendor_name, expected_date
            FROM purchase_orders
            WHERE expected_date IS NOT NULL
              AND expected_date < ${gteToday}
              AND status NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED')
            ORDER BY expected_date ASC
            LIMIT 5
        `,

        // Utang & Piutang jatuh tempo (minggu depan, +7 hari)
        prisma.$queryRaw<any[]>`
            SELECT 'piutang' AS kind, debtor_name AS name, due_date, (amount - amount_collected)::bigint AS sisa
            FROM piutangs
            WHERE due_date IS NOT NULL
              AND due_date >= ${tempoFrom} AND due_date <= ${tempoTo}
              AND status IN ('OUTSTANDING', 'PARTIAL')
            UNION ALL
            SELECT 'utang' AS kind, creditor_name AS name, due_date, (amount - amount_paid)::bigint AS sisa
            FROM utangs
            WHERE due_date IS NOT NULL
              AND due_date >= ${tempoFrom} AND due_date <= ${tempoTo}
              AND status IN ('OUTSTANDING', 'PARTIAL')
            ORDER BY due_date ASC
            LIMIT 5
        `,

        // Ad spend minggu lalu — wallet is_ads_budget (sama dashboard / Laba Rugi)
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(w.linked_platform, l.category, 'Iklan') AS category,
                COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
            FROM wallet_ledger l
            JOIN wallets w ON w.id = l.wallet_id
            WHERE w.is_ads_budget = true
              AND l.trx_type = 'EXPENSE'
              AND l.trx_date >= ${lastWeekStart} AND l.trx_date <= ${lastWeekEnd}
            GROUP BY COALESCE(w.linked_platform, l.category, 'Iklan')
        `,

        // Omzet bulan ini (progress target)
        prisma.$queryRaw<any[]>`
            SELECT COALESCE(SUM(real_omzet), 0)::bigint AS total
            FROM orders
            WHERE trx_date >= ${gteMonth} AND trx_date <= ${lteToday}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `,

        // Saldo kas seluruh wallet aktif
        getTotalCash(),

        // Burn rate rata-rata (90 hari)
        getBurnRate(90),

        // Target omzet bulan ini (AppSetting)
        getMonthlyTarget(ymWIB()),
    ])

    // ── Hitung last week ───────────────────────────────────────────────────
    const lwMap = Object.fromEntries(lastWeekStats.map((r: any) => [
        r.grp,
        { cnt: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
    ]))
    const lwValid = lwMap['valid'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const lwBatal = lwMap['batal'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const lwOmzet = lwValid.omzet
    const lwHpp = lwValid.hpp
    const lwGp = lwOmzet - lwHpp
    const lwMargin = lwOmzet > 0 ? ((lwGp / lwOmzet) * 100).toFixed(1) : '0'
    const lwTotalOrder = lwValid.cnt + lwBatal.cnt

    // ── Hitung prev week ────────────────────────────────────────────────
    const pwMap = Object.fromEntries(prevWeekStats.map((r: any) => [
        r.grp,
        { cnt: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
    ]))
    const pwValid = pwMap['valid'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const pwOmzet = pwValid.omzet
    const pwHpp = pwValid.hpp
    const pwGp = pwOmzet - pwHpp

    // ── Platform growth map ──────────────────────────────────────────────
    const pwPlatformMap = Object.fromEntries(
        platformBreakdownPrev.map((r: any) => [r.platform, Number(r.total_omzet)])
    )

    // ── Utang piutang ──────────────────────────────────────────────────
    const upMap = Object.fromEntries(utangPiutang.map((r: any) => [r.kind, { cnt: Number(r.cnt), total: Number(r.total) }]))
    const utangData = upMap['utang'] ?? { cnt: 0, total: 0 }
    const piutangData = upMap['piutang'] ?? { cnt: 0, total: 0 }

    // ── Kas & Runway ───────────────────────────────────────────────────
    const saldoKas   = Number(kasTotal ?? 0)
    const burnHarian = Number(burn?.avgDailyBurn ?? 0)
    const runwayHari = burnHarian > 0 ? Math.floor(saldoKas / burnHarian) : 0

    // ── Progress target bulan ini ───────────────────────────────────────
    const targetOmzet = target?.omzet ?? null
    const pacing      = monthPacing(ymWIB())
    const omzetBulanIni = Number((monthOmzet as any[])[0]?.total ?? 0)
    const targetPct   = targetOmzet ? ((omzetBulanIni / targetOmzet) * 100).toFixed(0) : null

    // ── ROAS mingguan (ad spend minggu lalu per platform) ────────────
    const adByCat = (adSpendRows as any[]).map((a: any) => ({ cat: (a.category || '').toLowerCase(), total: Number(a.total) }))
    const roasLines = (platformBreakdown as any[]).length === 0
        ? ''
        : (platformBreakdown as any[]).map((p: any) => {
            const pn = (p.platform || '').toLowerCase()
            const adSpend = adByCat
                .filter(a => pn && a.cat.includes(pn))
                .reduce((s: number, a) => s + a.total, 0)
            const omzet = Number(p.total_omzet)
            const roas = adSpend > 0 && omzet > 0 ? `${(omzet / adSpend).toFixed(1)}x` : '—'
            const adStr = adSpend > 0 ? ` (ad ${fmt(adSpend)})` : ''
            return `  ▪️ ${esc(p.platform)} — <b>${roas}</b>${adStr}`
          }).join('\n')

    // Map ROAS numerik per platform (untuk keputusan marketing)
    const roasMap = (platformBreakdown as any[]).map((p: any) => {
        const pn = (p.platform || '').toLowerCase()
        const adSpend = adByCat.filter(a => pn && a.cat.includes(pn)).reduce((s: number, a: any) => s + a.total, 0)
        const omzet = Number(p.total_omzet)
        const roas = adSpend > 0 && omzet > 0 ? Number((omzet / adSpend).toFixed(1)) : null
        return { platform: p.platform, omzet, adSpend, roas }
    })

    // ── Separator ────────────────────────────────────────────────────
    const sep = '━━━━━━━━━━━━━━━━━━━━━'
    const periodLabel = `${fmtWIBDateShort(lastMonday)} – ${fmtWIBDateShort(lastSunday)}`
    const prevPeriodLabel = `${fmtWIBDateShort(prevMonday)} – ${fmtWIBDateShort(prevSunday)}`

    const medalEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟']

    const topProductLines = topProducts.length === 0
        ? '  <i>(belum ada data)</i>'
        : topProducts.map((p: any, i: number) =>
            `  ${medalEmoji[i] ?? '▪️'} ${esc(p.product_name)} — <b>${Number(p.total_qty)} pcs</b> (${fmt(Number(p.total_omzet))})`
          ).join('\n')

    const platformLines = platformBreakdown.length === 0
        ? '  <i>(belum ada data)</i>'
        : platformBreakdown.map((p: any) => {
            const cur = Number(p.total_omzet)
            const prev = pwPlatformMap[p.platform] ?? 0
            return `  ▪️ ${esc(p.platform)} — <b>${fmt(cur)}</b> ${trendIcon(cur, prev)} ${pctChange(cur, prev)}`
          }).join('\n')

    // ── 1–10 EKSEKUSI MINGGU DEPAN (operasional + marketing + konten) ────────────────
    const actions: string[] = []

    // 1. Stok kritis (terburuk duluan) — top 4
    for (const s of (stockCriticalRows as any[]).slice(0, 4)) {
        actions.push(`🔴 Restock ${esc(s.product_name)} — stok ${Number(s.soh)} (ROP ${Number(s.rop)})`)
    }

    // 2. PO overdue (ETA lewat) — top 3
    for (const po of (poOverdue as any[]).slice(0, 3)) {
        actions.push(`📦 PO ${esc(po.po_number)} (${esc(po.vendor_name)}) lewat ETA ${fmtTglShort(po.expected_date)}`)
    }

    // 3. Piutang / Utang jatuh tempo minggu depan — masing top 2
    for (const u of (utangPiutangTempo as any[]).filter((x: any) => x.kind === 'piutang').slice(0, 2)) {
        actions.push(`💰 Tagih ${esc(u.name)} ${fmt(Number(u.sisa))} · jatuh ${fmtTglShort(u.due_date)}`)
    }
    for (const u of (utangPiutangTempo as any[]).filter((x: any) => x.kind === 'utang').slice(0, 2)) {
        actions.push(`🏦 Bayar ${esc(u.name)} ${fmt(Number(u.sisa))} · jatuh ${fmtTglShort(u.due_date)}`)
    }

    // 4. Marketing — ROAS per platform (BEP iklan ~ 2x)
    for (const r of roasMap) {
        if (r.roas == null) continue
        if (r.roas < 2) {
            actions.push(`📣 Turunkan iklan ${esc(r.platform)} — ROAS ${r.roas}x (ad ${fmt(r.adSpend)}, di bawah BEP ~2x)`)
        } else if (r.roas >= 4) {
            actions.push(`📣 Naikkan budget iklan ${esc(r.platform)} — ROAS ${r.roas}x (efisien)`)
        }
    }

    // 5. Konten — fitur produk terlaris minggu lalu
    const topKonten = (topProducts as any[])[0]
    if (topKonten) {
        actions.push(`🎬 Buat konten ${esc(topKonten.product_name)} (terlaris mg lalu ${Number(topKonten.total_qty)} pcs)`)
    }

    const eksekusiLines = actions.length === 0
        ? '  ✅ <i>Tidak ada aksi mendesak</i>'
        : actions.slice(0, 10).map((a, i) => `  ${i + 1}. ${a}`).join('\n')

    // ── Alert stok (dari stok kritis: minus / 0), dibatasi ────────────
    const STOK_ALERT_LIMIT = 10
    const minusRows = (stockCriticalRows as any[]).filter((r: any) => Number(r.soh) < 0)
    const zeroRows  = (stockCriticalRows as any[]).filter((r: any) => Number(r.soh) === 0)
    const minusShown = minusRows.slice(0, STOK_ALERT_LIMIT)
    const zeroShown  = zeroRows.slice(0, STOK_ALERT_LIMIT)
    const minusLines = minusRows.length === 0 ? '' : [
        `🚨 <b>Stok Minus — ${minusRows.length} produk:</b>`,
        ...minusShown.map((p: any) => `  • ${esc(p.product_name)} | <b>${Number(p.soh)}</b>`),
        ...(minusRows.length > minusShown.length ? [`  • <i>+${minusRows.length - minusShown.length} lainnya</i>`] : []),
    ].join('\n')
    const zeroLines = zeroRows.length === 0 ? '' : [
        `🔴 <b>Stok Habis (0) — ${zeroRows.length} produk:</b>`,
        ...zeroShown.map((p: any) => `  • ${esc(p.product_name)}`),
        ...(zeroRows.length > zeroShown.length ? [`  • <i>+${zeroRows.length - zeroShown.length} lainnya</i>`] : []),
    ].join('\n')
    const hasStockAlert = minusRows.length > 0 || zeroRows.length > 0
    const stockSection = hasStockAlert ? [
        sep, ``,
        `⚠️ <b>PERINGATAN STOK</b>`, ``,
        ...(zeroLines  ? [zeroLines,  ``] : []),
        ...(minusLines ? [minusLines,  ``] : []),
    ] : [
        sep, ``,
        `✅ <b>STOK</b> · Tidak ada stok minus/habis`, ``,
    ]

    const lines = [
        `📅 <b>LAPORAN MINGGUAN — ELYASR</b>`,
        `🗓️ ${esc(periodLabel)} (vs ${esc(prevPeriodLabel)})`,
        sep, ``,

        `💰 <b>OPS — ORDER MASUK (minggu lalu)</b> <i>(bukan Laba Rugi / pencairan)</i>`, ``,
        `🛒 Total Order  · <b>${lwTotalOrder} paket</b> (valid: ${lwValid.cnt}, batal: ${lwBatal.cnt})`,
        `💵 Omzet         · <b>${fmt(lwOmzet)}</b>`,
        `🏷️ HPP            · ${fmt(lwHpp)}`,
        `💎 GP ops (estimasi) · <b>${fmt(lwGp)}</b> (${lwMargin}%)`, ``,

        `🏦 <b>KAS & RUNWAY</b>`, ``,
        `💵 Saldo Kas    · <b>${fmt(saldoKas)}</b>`,
        `🔥 Burn/hari    · ${fmt(burnHarian)}`,
        `⏳ Runway       · <b>${runwayHari > 0 ? runwayHari + ' hari' : '—'}</b>`,
        `🎯 Progress Bulan Ini · ${targetOmzet ? `${fmt(omzetBulanIni)} / ${fmt(targetOmzet)} (${targetPct}% · minggu ke-${pacing.dayIndex === 0 ? 1 : Math.ceil(pacing.dayIndex / 7)}/${Math.ceil(pacing.daysInMonth / 7)})` : '<i>belum di-set</i>'}`, ``,

        `📊 <b>VS MINGGU SEBELUMNYA</b>`,
        `${trendIcon(lwOmzet, pwOmzet)} Omzet         · <b>${pctChange(lwOmzet, pwOmzet)}</b>  <i>(${fmt(pwOmzet)})</i>`,
        `${trendIcon(lwGp, pwGp)} Gross Profit · <b>${pctChange(lwGp, pwGp)}</b>  <i>(${fmt(pwGp)})</i>`,
        `${trendIcon(lwValid.cnt, pwValid.cnt)} Order Valid · <b>${pctChange(lwValid.cnt, pwValid.cnt)}</b>  <i>(${pwValid.cnt})</i>`, ``,

        sep, ``,
        `🏪 <b>OMZET OPS PER PLATFORM</b>`,
        platformLines, ``,
        ...(roasLines ? (() => {
            const totalAd = (adSpendRows as any[]).reduce((s: number, a: any) => s + Number(a.total), 0)
            const adPct = lwOmzet > 0 ? ((totalAd / lwOmzet) * 100).toFixed(1) : '0'
            return [
                `📣 <b>IKLAN &amp; ROAS (MINGGU LALU)</b> <i>(% thd omzet ops)</i>`,
                `  Total iklan · <b>${fmt(totalAd)}</b> (${adPct}% omzet ops)`,
                roasLines,
                ``,
            ]
        })() : []),

        sep, ``,
        `🏆 <b>TOP 10 PRODUK MINGGU LALU</b>`,
        topProductLines, ``,

        sep, ``,
        `⚡ <b>EKSEKUSI MINGGU DEPAN</b>`, ``,
        eksekusiLines, ``,

        ...stockSection,

        sep,
        `🤖 <i>Auto weekly report · Elyasr Ops</i>`,
    ]

    return lines.join('\n')
}
