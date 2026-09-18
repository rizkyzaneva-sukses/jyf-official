/**
 * Daily report builder untuk Elyasr Ops.
 * Mengambil data dari DB dan memformat jadi pesan Telegram HTML.
 *
 * Versi CEO: snapshot operasional + lapisan keputusan
 * (kas/runway, pacing target, ROAS, dan 1–3 Eksekusi Besok
 * yang di-derive otomatis dari stok kritis, PO overdue, & piutang tempo).
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

function fmtTglShort(d: any): string {
    const ymd = wibYmd(new Date(d))
    if (!ymd) return '-'
    const [, m, day] = ymd.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des']
    return `${Number(day)} ${months[Number(m) - 1]}`
}

export async function buildDailyReport(): Promise<string> {
    const today      = todayWIBStr()
    const yesterday  = addWibDays(today, -1)
    const weekMinus7 = addWibDays(today, -7)
    const weekStart  = wibMondayOfWeek(today)
    const monthStart = today.slice(0, 7) + '-01'

    const gteToday    = new Date(`${today}T00:00:00+07:00`)
    const lteToday    = new Date(`${today}T23:59:59+07:00`)
    const gteYest     = new Date(`${yesterday}T00:00:00+07:00`)
    const lteYest     = new Date(`${yesterday}T23:59:59+07:00`)
    const gteH7       = new Date(`${weekMinus7}T00:00:00+07:00`)
    const lteH7       = new Date(`${weekMinus7}T23:59:59+07:00`)
    const gteWeek     = new Date(`${weekStart}T00:00:00+07:00`)
    const gteMonth    = new Date(`${monthStart}T00:00:00+07:00`)
    const gte10d      = new Date(`${addWibDays(today, -9)}T00:00:00+07:00`)

    // ── Eksekusi Besok: jendela tempo ±7 hari (sedikit ke belakang utk yg lewat) ──
    const tempoFrom = new Date(`${addWibDays(today, -3)}T00:00:00+07:00`)
    const tempoTo   = new Date(`${addWibDays(today, 7)}T23:59:59+07:00`)

    const [
        todayRows,
        yesterdayRows,
        h7Rows,
        weekRows,
        monthRows,
        platformRows,
        pendingRows,
        stockCriticalRows,
        kasTotal,
        burn,
        target,
        poOverdue,
        utangPiutangTempo,
        adSpendRows,
        cashflowHariIni,
        topProductsHariIni,
    ] = await Promise.all([

        // Hari ini — omzet, hpp, count (COUNT DISTINCT order_no agar multi-SKU dihitung 1x)
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
            WHERE trx_date >= ${gteToday} AND trx_date <= ${lteToday}
            GROUP BY grp
        `,

        // Kemarin — omzet non-batal
        prisma.$queryRaw<any[]>`
            SELECT COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteYest} AND trx_date <= ${lteYest}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `,

        // 7 hari lalu (hari yang sama minggu lalu)
        prisma.$queryRaw<any[]>`
            SELECT COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteH7} AND trx_date <= ${lteH7}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `,

        // Minggu ini (Senin s/d hari ini)
        prisma.$queryRaw<any[]>`
            SELECT COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteWeek} AND trx_date <= ${lteToday}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `,

        // Bulan ini
        prisma.$queryRaw<any[]>`
            SELECT COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteMonth} AND trx_date <= ${lteToday}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
        `,

        // Platform breakdown hari ini
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(platform, 'Unknown') AS platform,
                COUNT(DISTINCT order_no)::int AS cnt,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteToday} AND trx_date <= ${lteToday}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY platform
            ORDER BY total_omzet DESC
            LIMIT 5
        `,

        // Pending orders 10 hari terakhir — agregasi per produk
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(product_name, sku, '-') AS product_name,
                SUM(qty)::int AS total_qty
            FROM orders
            WHERE trx_date >= ${gte10d} AND trx_date <= ${lteToday}
              AND status NOT LIKE 'TERKIRIM%'
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY product_name, sku
            ORDER BY total_qty DESC
            LIMIT 25
        `,

        // Stok kritis: SOH ≤ ROP ATAU minus (gabungan alert 0/minus + ROP)
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

        // Saldo kas seluruh wallet aktif
        getTotalCash(),

        // Burn rate rata-rata (90 hari)
        getBurnRate(90),

        // Target omzet bulan ini (AppSetting)
        getMonthlyTarget(ymWIB()),

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

        // Utang & Piutang jatuh tempo (±7 hari)
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

        // Ad spend hari ini — wallet is_ads_budget (sama dashboard / Laba Rugi)
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(w.linked_platform, l.category, 'Iklan') AS category,
                COALESCE(SUM(ABS(l.amount)), 0)::bigint AS total
            FROM wallet_ledger l
            JOIN wallets w ON w.id = l.wallet_id
            WHERE w.is_ads_budget = true
              AND l.trx_type = 'EXPENSE'
              AND l.trx_date >= ${gteToday} AND l.trx_date <= ${lteToday}
            GROUP BY COALESCE(w.linked_platform, l.category, 'Iklan')
        `,

        // Kas masuk / keluar hari ini (wallet ledger)
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0)::bigint AS inflow,
                COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0)::bigint AS outflow
                FROM wallet_ledger
            WHERE trx_date >= ${gteToday} AND trx_date <= ${lteToday}
        `,

        // Top produk hari ini (untuk saran konten)
        prisma.$queryRaw<any[]>`
            SELECT
                COALESCE(product_name, sku, '-') AS product_name,
                SUM(qty)::int AS total_qty,
                COALESCE(SUM(real_omzet), 0)::bigint AS total_omzet
            FROM orders
            WHERE trx_date >= ${gteToday} AND trx_date <= ${lteToday}
              AND status NOT ILIKE '%batal%'
              AND status NOT ILIKE '%cancel%'
              AND status NOT ILIKE '%dibatalkan%'
            GROUP BY product_name, sku
            ORDER BY total_omzet DESC
            LIMIT 3
        `,
    ])

    // ─── Kalkulasi hari ini ───────────────────────────────────────────────────
    const statsMap = Object.fromEntries(todayRows.map((r: any) => [
        r.grp,
        { cnt: Number(r.cnt), omzet: Number(r.total_omzet), hpp: Number(r.total_hpp) }
    ]))
    const valid      = statsMap['valid'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const batal      = statsMap['batal'] ?? { cnt: 0, omzet: 0, hpp: 0 }
    const omzetHari  = valid.omzet
    const hppHari    = valid.hpp
    const gpHari     = omzetHari - hppHari
    const marginHari = omzetHari > 0 ? ((gpHari / omzetHari) * 100).toFixed(1) : '0'
    const totalOrder = valid.cnt + batal.cnt

    const omzetKemarin  = Number((yesterdayRows as any[])[0]?.total_omzet ?? 0)
    const omzetH7       = Number((h7Rows as any[])[0]?.total_omzet ?? 0)
    const omzetMinggu   = Number((weekRows as any[])[0]?.total_omzet ?? 0)
    const omzetBulan    = Number((monthRows as any[])[0]?.total_omzet ?? 0)

    // ─── Kas & Runway ──────────────────────────────────────────────────────
    const saldoKas   = Number(kasTotal ?? 0)
    const burnHarian = Number(burn?.avgDailyBurn ?? 0)
    const runwayHari = burnHarian > 0 ? Math.floor(saldoKas / burnHarian) : 0
    const kasMasukHari  = Number((cashflowHariIni as any[])[0]?.inflow ?? 0)
    const kasKeluarHari = Number((cashflowHariIni as any[])[0]?.outflow ?? 0)

    // ─── Target pacing bulan ini ─────────────────────────────────────────────
    const targetOmzet = target?.omzet ?? null
    const pacing      = monthPacing(ymWIB())
    const targetPct   = targetOmzet ? ((omzetBulan / targetOmzet) * 100).toFixed(0) : null

    // ─── ROAS per platform (ad spend hari ini) ─────────────────────────────
    const adByCat = (adSpendRows as any[]).map((a: any) => ({ cat: (a.category || '').toLowerCase(), total: Number(a.total) }))
    const roasLines = (platformRows as any[]).length === 0
        ? ''
        : (platformRows as any[]).map((p: any) => {
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
    const roasMap = (platformRows as any[]).map((p: any) => {
        const pn = (p.platform || '').toLowerCase()
        const adSpend = adByCat.filter(a => pn && a.cat.includes(pn)).reduce((s: number, a: any) => s + a.total, 0)
        const omzet = Number(p.total_omzet)
        const roas = adSpend > 0 && omzet > 0 ? Number((omzet / adSpend).toFixed(1)) : null
        return { platform: p.platform, omzet, adSpend, roas }
    })

    // ─── Waktu ───────────────────────────────────────────────────────────────
    const dateStr = new Date().toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const timeStr = new Date().toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit', minute: '2-digit', hour12: false,
    })

    // ─── Separator (dipakai di banyak section) ────────────────────────────
    const sep = '━━━━━━━━━━━━━━━━━━━━━'

    // ─── Platform lines ───────────────────────────────────────────────────
    const medalEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
    const platformLines = (platformRows as any[]).length === 0
        ? '  <i>(belum ada data hari ini)</i>'
        : (platformRows as any[]).map((p: any, i: number) =>
            `  ${medalEmoji[i] ?? '▪️'} ${esc(p.platform)} — <b>${fmt(Number(p.total_omzet))}</b>`
          ).join('\n')

    // ─── Pending product lines ────────────────────────────────────────────────
    const pendingCount = (pendingRows as any[]).reduce((s: number, r: any) => s + Number(r.total_qty), 0)
    const pendingProductLines = (pendingRows as any[]).length === 0
        ? '  <i>(tidak ada order pending)</i>'
        : (pendingRows as any[]).map((r: any) =>
            `  • ${esc(r.product_name)} | ${Number(r.total_qty)}`
          ).join('\n')

    // 1-10 Eksekusi Besok (operasional + marketing + konten)
    const actions: string[] = []

    // 1. Stok kritis (terburuk duluan) - top 3
    for (const s of (stockCriticalRows as any[]).slice(0, 3)) {
        actions.push(`Restock ${esc(s.product_name)} - stok ${Number(s.soh)} (ROP ${Number(s.rop)})`)
    }

    // 2. PO overdue (ETA lewat) - top 2
    for (const po of (poOverdue as any[]).slice(0, 2)) {
        actions.push(`PO ${esc(po.po_number)} (${esc(po.vendor_name)}) lewat ETA ${fmtTglShort(po.expected_date)}`)
    }

    // 3. Piutang / Utang jatuh tempo (+/-7 hari) - masing top 1
    for (const u of (utangPiutangTempo as any[]).filter((x: any) => x.kind === 'piutang').slice(0, 1)) {
        actions.push(`Tagih ${esc(u.name)} ${fmt(Number(u.sisa))} . jatuh ${fmtTglShort(u.due_date)}`)
    }
    for (const u of (utangPiutangTempo as any[]).filter((x: any) => x.kind === 'utang').slice(0, 1)) {
        actions.push(`Bayar ${esc(u.name)} ${fmt(Number(u.sisa))} . jatuh ${fmtTglShort(u.due_date)}`)
    }

    // 4. Marketing - ROAS per platform (BEP iklan ~ 2x)
    for (const r of roasMap) {
        if (r.roas == null) continue
        if (r.roas < 2) {
            actions.push(`Turunkan iklan ${esc(r.platform)} - ROAS ${r.roas}x (ad ${fmt(r.adSpend)}, di bawah BEP ~2x)`)
        } else if (r.roas >= 4) {
            actions.push(`Naikkan budget iklan ${esc(r.platform)} - ROAS ${r.roas}x (efisien)`)
        }
    }

    // 5. Konten - fitur produk terlaris hari ini
    const topKonten = (topProductsHariIni as any[])[0]
    if (topKonten) {
        actions.push(`Buat konten ${esc(topKonten.product_name)} (terlaris hari ini ${Number(topKonten.total_qty)} pcs)`)
    }

    const eksekusiLines = actions.length === 0
        ? '  Tidak ada aksi mendesak'
        : actions.slice(0, 10).map((a, i) => `  ${i + 1}. ${a}`).join('\n')


    // ─── Alert stok (dari stok kritis: minus / 0) ─────────────────────────
    // Batasi tampilan per kategori (jaga 1 chat Telegram) + "+N lainnya"
    const STOK_ALERT_LIMIT = 10
    const minusRows = (stockCriticalRows as any[]).filter((r: any) => Number(r.soh) < 0)
    const zeroRows  = (stockCriticalRows as any[]).filter((r: any) => Number(r.soh) === 0)
    const minusShown  = minusRows.slice(0, STOK_ALERT_LIMIT)
    const zeroShown   = zeroRows.slice(0, STOK_ALERT_LIMIT)
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
        ...(minusLines ? [minusLines, ``] : []),
    ] : [
        sep, ``,
        `✅ <b>STOK</b> · Tidak ada stok minus/habis`, ``,
    ]

    // ─── Assemble ─────────────────────────────────────────────────────────────
    const lines = [
        `🏪 <b>LAPORAN HARIAN — ELYASR</b>`,
        `📅 ${esc(dateStr)} · ${timeStr} WIB`,
        sep, ``,

        `💰 <b>OPS — ORDER MASUK</b> <i>(bukan Laba Rugi / pencairan)</i>`, ``,
        `🛒 Order Masuk   · <b>${totalOrder} paket</b>`,
        `💵 Nilai Order   · <b>${fmt(omzetHari)}</b>`, ``,
        `📊 Omset Hari Ini    · <b>${fmt(omzetHari)}</b>`,
        `📅 Omset Minggu Ini  · <b>${fmt(omzetMinggu)}</b>`,
        `📆 Omset Bulan Ini   · <b>${fmt(omzetBulan)}</b>`, ``,
        `${trendIcon(omzetHari, omzetKemarin)} vs Kemarin     · <b>${pctChange(omzetHari, omzetKemarin)}</b>  <i>(${fmt(omzetKemarin)})</i>`,
        `${trendIcon(omzetHari, omzetH7)} vs Minggu Lalu · <b>${pctChange(omzetHari, omzetH7)}</b>  <i>(${fmt(omzetH7)})</i>`, ``,
        `💡 <b>GROSS PROFIT OPS (estimasi)</b>`,
        `├ HPP        · ${fmt(hppHari)}`,
        `└ GP ops     · <b>${fmt(gpHari)}</b> (${marginHari}%)`, ``,

        `🏦 <b>KAS & RUNAY</b>`, ``,
        `💵 Saldo Kas    · <b>${fmt(saldoKas)}</b>`,
        `🔥 Burn/hari    · ${fmt(burnHarian)}`,
        `💚 Kas Masuk Hari Ini  · ${fmt(kasMasukHari)}`,
        `💸 Kas Keluar Hari Ini · ${fmt(kasKeluarHari)}`,
        `⏳ Runway       · <b>${runwayHari > 0 ? runwayHari + ' hari' : '—'}</b>`,
        `🎯 Target Bulan  · ${targetOmzet ? `${fmt(targetOmzet)} (${targetPct}% · hari ke-${pacing.dayIndex}/${pacing.daysInMonth})` : '<i>belum di-set</i>'}`, ``,

        `🏪 <b>OMZET PER PLATFORM</b>`,
        platformLines, ``,
        ...(roasLines ? (() => {
            const totalAd = adByCat.reduce((s, a) => s + a.total, 0)
            const adPct = omzetHari > 0 ? ((totalAd / omzetHari) * 100).toFixed(1) : '0'
            return [
                `📣 <b>IKLAN &amp; ROAS</b> <i>(% thd omzet ops hari ini)</i>`,
                `  Total iklan · <b>${fmt(totalAd)}</b> (${adPct}% omzet ops)`,
                roasLines,
                ``,
            ]
        })() : []),

        sep, ``,
        `📦 <b>OPERASIONAL</b>`, ``,
        `⏳ Order Pending  · <b>${pendingCount} paket</b>`, ``,
        `📋 <b>Detail Produk Pending :</b>`,
        pendingProductLines, ``,

        sep, ``,
        `⚡ <b>EKSEKUSI BESOK</b>`, ``,
        eksekusiLines, ``,

        ...stockSection,
        sep,
        `🤖 <i>Auto-report · ${timeStr} WIB · Elyasr Ops</i>`,
    ]

    return lines.join('\n')
}
