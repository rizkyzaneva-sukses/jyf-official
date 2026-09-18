import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { addWibDays, apiSuccess, apiError, todayWIBStr, wibDayEnd, wibDayStart, wibMonthStartStr, wibPresetRange, wibStartDaysAgo } from '@/lib/utils'
import {
  getTotalCash,
  getBurnRate,
  getMonthlyTarget,
  ymWIB,
  monthPacing,
} from '@/lib/dashboard-helpers'

// ── Helper: format rupiah ──
function fmt(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)
}

// ── Kumpulkan data performa untuk dikirim ke AI ──
async function collectPerformanceData(periodType: 'monthly' | 'weekly' = 'monthly') {
  const today = todayWIBStr()

  let gteDate: Date
  const lteDate = wibDayEnd(today)
  let periodLabel = '30 Hari Terakhir'

  if (periodType === 'weekly') {
    const { from } = wibPresetRange('week', today)
    gteDate = wibDayStart(from)
    periodLabel = 'Minggu Ini (Senin - Sekarang)'
  } else {
    gteDate = wibDayStart(addWibDays(today, -30))
  }

  // Bulan ini (untuk target pacing & creative)
  const gteMonth = wibDayStart(wibMonthStartStr(today))

  const [
    omzetStats, omzetByPlatform, agingBacklog, stokKritis, topProvinces,
    payoutStats, dailyTrend, marketingCosts,
    kasTotal, burn, target, utangPiutang, poOutstandingRows, monthOmzet, topProducts,
  ] = await Promise.all([

    // Omzet & GP periode
    prisma.$queryRaw<{ total_omzet: bigint; total_hpp: bigint; cnt: bigint }[]>`
      SELECT
        COALESCE(SUM(real_omzet), 0) AS total_omzet,
        COALESCE(SUM(hpp * qty), 0) AS total_hpp,
        COUNT(*) AS cnt
      FROM orders
      WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
        AND status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%'
    `,

    // Per platform periode
    prisma.$queryRaw<{ platform: string; cnt: bigint; total_omzet: bigint; total_hpp: bigint }[]>`
      SELECT
        COALESCE(platform, 'Unknown') AS platform,
        COUNT(*) AS cnt,
        COALESCE(SUM(real_omzet), 0) AS total_omzet,
        COALESCE(SUM(hpp * qty), 0) AS total_hpp
      FROM orders
      WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
        AND status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%'
      GROUP BY platform ORDER BY total_omzet DESC
    `,

    // Aging backlog saat ini
    prisma.$queryRaw<{ bucket: string; cnt: bigint }[]>`
      SELECT
        CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 12 THEN '0-12 Jam'
          WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 24 THEN '12-24 Jam'
          WHEN EXTRACT(EPOCH FROM (NOW() - created_at))/3600 <= 48 THEN '24-48 Jam'
          ELSE '>48 Jam'
        END AS bucket,
        COUNT(*) AS cnt
      FROM orders
      WHERE status NOT LIKE 'TERKIRIM%'
        AND status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%'
      GROUP BY bucket
    `,

    // Stok kritis (SOH <= ROP)
    prisma.$queryRaw<{ cnt: bigint; skus: string }[]>`
      SELECT COUNT(*) AS cnt, STRING_AGG(sku, ', ') AS skus
      FROM (
        SELECT p.sku,
          p.stok_awal
          + COALESCE(SUM(CASE WHEN l.direction = 'IN' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN l.direction = 'OUT' AND (p.last_opname_date IS NULL OR l.trx_date >= p.last_opname_date) THEN l.qty ELSE 0 END), 0)
          AS soh, p.rop
        FROM master_products p
        LEFT JOIN inventory_ledger l ON l.sku = p.sku
        WHERE p.is_active = true
        GROUP BY p.sku, p.stok_awal, p.rop, p.last_opname_date
      ) x WHERE soh <= rop
    `,

    // Top 5 provinsi periode
    prisma.$queryRaw<{ province: string; cnt: bigint }[]>`
      SELECT province, COUNT(*) AS cnt
      FROM orders
      WHERE province IS NOT NULL AND trx_date >= ${gteDate} AND trx_date <= ${lteDate}
      GROUP BY province ORDER BY cnt DESC LIMIT 5
    `,

    // Payout bulan ini
    prisma.payout.aggregate({
      where: { releasedDate: { gte: gteMonth } },
      _sum: { totalIncome: true },
      _count: { id: true },
    }),

    // Trend harian 7 hari terakhir
    prisma.$queryRaw<{ day: string; cnt: bigint; omzet: bigint }[]>`
      SELECT
        TO_CHAR(trx_date AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD') AS day,
        COUNT(*) AS cnt,
        COALESCE(SUM(real_omzet), 0) AS omzet
      FROM orders
      WHERE trx_date >= ${wibStartDaysAgo(8)}
        AND status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%'
      GROUP BY day ORDER BY day
    `,

    // Marketing Costs (Ads & Sample)
    prisma.$queryRaw<{ category: string; amount: bigint }[]>`
      SELECT category, SUM(ABS(amount)) as amount
      FROM wallet_ledger
      WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
        AND trx_type = 'EXPENSE'
        AND category IS NOT NULL
        AND (
          category ILIKE '%iklan%'
          OR category ILIKE '%ads%'
          OR category ILIKE '%sample%'
          OR category ILIKE '%ongkir sample%'
        )
      GROUP BY category
    `,

    // Kas & Runway (as-of sekarang)
    getTotalCash(),
    getBurnRate(90),
    getMonthlyTarget(ymWIB()),

    // Utang & Piutang outstanding
    prisma.$queryRaw<{ kind: string; sisa: bigint }[]>`
      SELECT 'utang' AS kind, COALESCE(SUM(amount - amount_paid), 0) AS sisa
      FROM utangs WHERE status IN ('OUTSTANDING', 'PARTIAL')
      UNION ALL
      SELECT 'piutang' AS kind, COALESCE(SUM(amount - amount_collected), 0) AS sisa
      FROM piutangs WHERE status IN ('OUTSTANDING', 'PARTIAL')
    `,

    // PO outstanding (belum lunas)
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(total_amount - total_paid), 0) AS total
      FROM purchase_orders
      WHERE payment_status IN ('UNPAID', 'PARTIAL_PAID')
    `,

    // Omzet bulan ini (target pacing)
    prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COALESCE(SUM(real_omzet), 0) AS total
      FROM orders
      WHERE trx_date >= ${gteMonth} AND trx_date <= ${lteDate}
        AND status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%'
    `,

    // Top 5 produk periode (untuk Creative)
    prisma.$queryRaw<{ product_name: string; total_omzet: bigint; total_qty: bigint }[]>`
      SELECT
        COALESCE(product_name, sku, '-') AS product_name,
        COALESCE(SUM(real_omzet), 0) AS total_omzet,
        SUM(qty) AS total_qty
      FROM orders
      WHERE trx_date >= ${gteDate} AND trx_date <= ${lteDate}
        AND status NOT ILIKE '%batal%' AND status NOT ILIKE '%cancel%' AND status NOT ILIKE '%dibatalkan%'
      GROUP BY product_name, sku
      ORDER BY total_omzet DESC LIMIT 5
    `,
  ])

  const oStats = (omzetStats as any[])[0]
  const totalOmzet = Number(oStats?.total_omzet ?? 0)
  const totalHpp   = Number(oStats?.total_hpp ?? 0)
  const totalOrder = Number(oStats?.cnt ?? 0)
  const gp         = totalOmzet - totalHpp
  const margin     = totalOmzet > 0 ? ((gp / totalOmzet) * 100).toFixed(1) : '0'
  const agingMap   = Object.fromEntries((agingBacklog as any[]).map((r: any) => [r.bucket, Number(r.cnt)]))
  const agingTotal = (Object.values(agingMap) as number[]).reduce((s, v) => s + v, 0)
  const durationDays = periodType === 'weekly' ? Math.max(1, (lteDate.getTime() - gteDate.getTime()) / (1000 * 3600 * 24)) : 30;

  // Finance
  const saldoKas   = Number(kasTotal ?? 0)
  const burnHarian = Number(burn?.avgDailyBurn ?? 0)
  const runwayHari = burnHarian > 0 ? Math.floor(saldoKas / burnHarian) : 0
  const targetOmzet = target?.omzet ?? null
  const pacing     = monthPacing(ymWIB())
  const omzetBulanIni = Number((monthOmzet as any[])[0]?.total ?? 0)
  const targetPct = targetOmzet ? ((omzetBulanIni / targetOmzet) * 100).toFixed(0) : null
  const upMap = Object.fromEntries((utangPiutang as any[]).map((r: any) => [r.kind, Number(r.sisa)]))
  const utangTotal   = upMap['utang'] ?? 0
  const piutangTotal = upMap['piutang'] ?? 0
  const netPosition = piutangTotal - utangTotal
  const poOutstanding = Number((poOutstandingRows as any[])[0]?.total ?? 0)
  const marketingTotal = (marketingCosts as any[]).reduce((s: number, c: any) => s + Number(c.amount), 0)

  return {
    nowWIB: new Date().toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'long' }),
    periodLabel,
    omzetTotal: totalOmzet,
    hppTotal: totalHpp,
    gpTotal: gp,
    marginTotal: margin,
    orderCountTotal: totalOrder,
    avgOrderPerDay: totalOrder > 0 ? (totalOrder / durationDays).toFixed(1) : '0',
    byPlatform: (omzetByPlatform as any[]).map(p => {
      const platformName = (p.platform || '').toLowerCase()
      const adSpend = (marketingCosts as any[]).reduce((sum, cost) => {
        const cat = (cost.category || '').toLowerCase()
        if (cat.includes(platformName)) {
          return sum + Number(cost.amount)
        }
        return sum
      }, 0)
      const omzet = Number(p.total_omzet)
      const hpp = Number(p.total_hpp)
      const roas = adSpend > 0 ? (omzet / adSpend).toFixed(1) : '0'
      return {
        platform: p.platform,
        count: Number(p.cnt),
        omzet: omzet,
        gp: omzet - hpp,
        margin: omzet > 0 ? (((omzet - hpp) / omzet) * 100).toFixed(1) : '0',
        adSpend,
        roas,
      }
    }),
    agingBacklog: { total: agingTotal, ...agingMap },
    stokKritis: Number((stokKritis as any[])[0]?.cnt ?? 0),
    topProvinces: (topProvinces as any[]).map(p => ({ province: p.province, count: Number(p.cnt) })),
    payoutBulanIni: {
      count: payoutStats._count.id,
      totalCair: Number(payoutStats._sum.totalIncome ?? 0),
    },
    dailyTrend: (dailyTrend as any[]).map(d => ({
      day: d.day, count: Number(d.cnt), omzet: Number(d.omzet),
    })),
    // ── Finance ──
    kas: { saldoKas, burnHarian, runwayHari },
    target: { omzet: targetOmzet, pct: targetPct, hariKe: pacing.dayIndex, totalHari: pacing.daysInMonth },
    utangPiutang: { utang: utangTotal, piutang: piutangTotal, net: netPosition },
    poOutstanding,
    marketingTotal,
    // ── Creative ──
    topProducts: (topProducts as any[]).map(p => ({
      product: p.product_name, omzet: Number(p.total_omzet), qty: Number(p.total_qty),
    })),
  }
}

// ── Build prompt untuk AI (5 dimensi) ──
function buildPrompt(data: ReturnType<typeof collectPerformanceData> extends Promise<infer T> ? T : never) {
  const platformLines = data.byPlatform.map(p =>
    `  - ${p.platform}: ${p.count} order, Omzet ${fmt(p.omzet)}, GP ${fmt(p.gp)} (margin ${p.margin}%)${p.adSpend > 0 ? `, Ad Spend ${fmt(p.adSpend)}, ROAS: ${p.roas}x` : ''}`
  ).join('\n')

  const provinceLines = data.topProvinces.map((p, i) =>
    `  ${i + 1}. ${p.province}: ${p.count} order`
  ).join('\n')

  const topProductLines = data.topProducts.length > 0
    ? data.topProducts.map((p, i) => `  ${i + 1}. ${p.product} — ${fmt(p.omzet)} (${p.qty} pcs)`).join('\n')
    : '  (belum ada data)'

  const dailyLines = data.dailyTrend.map(d =>
    `  ${d.day}: ${d.count} order — ${fmt(d.omzet)}`
  ).join('\n')

  const targetLine = data.target.omzet
    ? `${fmt(data.target.omzet)} (baru tercapai ${data.target.pct}% • hari ke-${data.target.hariKe}/${data.target.totalHari})`
    : 'belum di-set'
  const runwayLine = data.kas.runwayHari > 0 ? `${data.kas.runwayHari} hari` : '—'

  return `Kamu adalah analis bisnis senior yang memahami e-commerce Indonesia.
Berikut data performa toko Elyasr per ${data.nowWIB} (periode: ${data.periodLabel}):

## DATA INTI
- Total Omzet    : ${fmt(data.omzetTotal)}
- Total HPP      : ${fmt(data.hppTotal)}
- Gross Profit   : ${fmt(data.gpTotal)} (margin ${data.marginTotal}%)
- Total Order    : ${data.orderCountTotal} order
- Rata-rata/hari : ${data.avgOrderPerDay} order/hari
- Target Bulan Ini : ${targetLine}
- Kas & Runway  : saldo ${fmt(data.kas.saldoKas)}, burn ${fmt(data.kas.burnHarian)}/hari, runway ${runwayLine}
- Utang / Piutang : ${fmt(data.utangPiutang.utang)} / ${fmt(data.utangPiutang.piutang)} (Net ${fmt(data.utangPiutang.net)})
- PO Outstanding : ${fmt(data.poOutstanding)} (belum lunas)

## PER PLATFORM (Omzet, GP, ROAS)
${platformLines}

## OPERASIONAL
- Aging backlog total: ${data.agingBacklog.total} order (0-12j:${data.agingBacklog['0-12 Jam'] ?? 0}, 12-24j:${data.agingBacklog['12-24 Jam'] ?? 0}, 24-48j:${data.agingBacklog['24-48 Jam'] ?? 0}, >48j:${data.agingBacklog['>48 Jam'] ?? 0} ⚠️)
- Stok kritis (<= ROP): ${data.stokKritis} SKU

## MARKETING (ROAS Iklan)
- Total ad spend: ${fmt(data.marketingTotal)}
${platformLines.split('\n').map(l => l.includes('ROAS') ? `  ${l}` : '').filter(Boolean).join('\n') || '  (belum ada data ROAS)'}

## CREATIVE
- Top produk:
${topProductLines}
- Top provinsi:
${provinceLines}

## TREN HARIAN (7 hari)
${dailyLines}

---
Buatlah analisis bisnis yang WAJIB dibagi tepat menjadi 5 bagian dengan header "## " persis seperti berikut (urutan jangan diubah):

## 🏭 OPERASIONAL
Ringkas kondisi operasional: fulfillment, aging/SLA, dan stok kritis. Sebutkan perhatian jika ada order >48 jam belum terkirim. Maks 4 poin.

## 📣 MARKETING
Fokus efisiensi ROAS per platform, alokasi budget iklan, dan saran geo-targeting dari top provinsi. Tandai platform dengan ROAS <2x sebagai "bakar duit". Maks 4 poin.

## 💰 FINANCE
Fokus posisi kas & runway, kelancaran utang/piutang, pencapaian target bulan ini, dan PO outstanding. Beri perhatian jika runway <30 hari atau target jauh dari pacing. Maks 4 poin.

## 🎨 CREATIVE
Beri ide konten konkret berdasarkan top produk & top provinsi, serta saran format per platform (TikTok vs Shopee). Maks 4 poin.

## 🎯 STRATEGIS
Tinjau growth vs target & vs periode sebelumnya, serta peluang jangka menengah yang bisa dimanfaatkan. Maks 4 poin.

Format: setiap bagian pakai poin "-" atau "1." yang jelas, emoji konsisten, bahasa Indonesia natural tapi profesional. Owner ingin baca cepat di handphone — jangan terlalu panjang.`
}

// ── POST: Generate insights baru ──
export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Hanya Owner yang bisa generate AI Insights', 403)

  // ── Provider: 1 Default + 1 Fallback ──
  const apiKey = process.env.ANTIGRAVITY_KEY_1 || process.env.ANTIGRAVITY_KEY_2
  if (!apiKey) return apiError('ANTIGRAVITY_KEY_1 / _2 belum di-set di environment', 500)

  const DEFAULT = {
    url: process.env.ANTIGRAVITY_URL_1,
    key: process.env.ANTIGRAVITY_KEY_1,
    model: process.env.ANTIGRAVITY_MODEL_1,
    name: 'Default',
  }
  const FALLBACK = {
    url: process.env.ANTIGRAVITY_URL_2,
    key: process.env.ANTIGRAVITY_KEY_2,
    model: process.env.ANTIGRAVITY_MODEL_2,
    name: 'Fallback',
  }
  const providers = [DEFAULT, FALLBACK].filter(p => p.url && p.key) as { url: string; key: string; model: string; name: string }[]

  if (providers.length === 0) return apiError('Tidak ada AI provider yang dikonfigurasi', 500)

  try {
    const periodType = (request.nextUrl.searchParams.get('type') || 'monthly') as 'monthly' | 'weekly'
    const data = await collectPerformanceData(periodType)
    const prompt = buildPrompt(data)

    let content = ''
    let modelUsed = ''
    const errors: string[] = []

    for (const provider of providers) {
      try {
        const aiRes = await fetch(`${provider.url}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.key}`,
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 1800,
            temperature: 0.7,
          }),
          signal: AbortSignal.timeout(30000),
        })

        if (!aiRes.ok) {
          const errText = await aiRes.text()
          errors.push(`${provider.name}: HTTP ${aiRes.status} — ${errText.slice(0, 200)}`)
          continue
        }

        const aiText = await aiRes.text()
        let aiJson: any
        try {
          aiJson = JSON.parse(aiText)
        } catch {
          errors.push(`${provider.name}: Response bukan JSON`)
          continue
        }

        content = aiJson?.choices?.[0]?.message?.content ?? ''
        modelUsed = provider.model
        if (content) break
      } catch (err: any) {
        errors.push(`${provider.name}: ${err.message}`)
      }
    }

    if (!content) {
      return apiError(`Semua AI provider gagal: ${errors.join(' | ')}`, 500)
    }

    const period  = todayWIBStr().slice(0, 7)
    const insight = await prisma.aiInsight.create({
      data: {
        period,
        periodType,
        content,
        modelUsed,
        generatedBy: session.username,
        dataSnapshot: data as any,
      },
    })

    return apiSuccess({ id: insight.id, content, generatedAt: insight.createdAt, data })
  } catch (err: any) {
    return apiError(err.message || 'Gagal generate insights', 500)
  }
}

// ── GET: Ambil insight terakhir ──
export async function GET() {
  const session = await getSession()
  if (!session.isLoggedIn) return apiError('Unauthorized', 401)
  if (session.userRole !== 'OWNER') return apiError('Hanya Owner', 403)

  const latest = await prisma.aiInsight.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, createdAt: true, content: true, period: true, modelUsed: true, generatedBy: true, dataSnapshot: true },
  })

  return apiSuccess({ insight: latest })
}
