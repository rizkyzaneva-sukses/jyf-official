import { prisma } from '@/lib/prisma'
import { resolveRange, formatRp, fmtWIBDate } from './helpers'
import { nowWIB as getNowWIB } from '@/lib/utils'

// ─────────────────────────────────────────────
// Tool 6: Wallet summary — saldo per wallet & posisi kas
// ─────────────────────────────────────────────
export async function getWalletSummary() {
    // Saldo per wallet aktif (SUM amount dari wallet_ledger karena sign sudah benar di DB)
    const walletRows = await prisma.$queryRaw<any[]>`
        SELECT
            w.id,
            w.name,
            w.is_active AS is_active,
            w.is_ads_budget AS is_ads_budget,
            w.linked_platform AS linked_platform,
            COALESCE(SUM(l.amount), 0)::bigint AS balance,
            COUNT(l.id)::int AS trx_count
        FROM wallets w
        LEFT JOIN wallet_ledger l ON l.wallet_id = w.id
        GROUP BY w.id, w.name, w.is_active, w.is_ads_budget, w.linked_platform
        ORDER BY w.is_active DESC, balance DESC
    `

    // Recent transactions (10 terakhir)
    const recentRows = await prisma.$queryRaw<any[]>`
        SELECT
            l.trx_date,
            l.trx_type,
            l.category,
            l.amount,
            l.note,
            w.name AS wallet_name
        FROM wallet_ledger l
        JOIN wallets w ON w.id = l.wallet_id
        ORDER BY l.trx_date DESC, l.created_at DESC
        LIMIT 10
    `

    const totalCash = walletRows
        .filter(r => r.is_active)
        .reduce((s, r) => s + Number(r.balance), 0)

    const adsBudgetTotal = walletRows
        .filter(r => r.is_active && r.is_ads_budget)
        .reduce((s, r) => s + Number(r.balance), 0)

    return {
        totalCashPosition: formatRp(totalCash),
        adsBudgetTotal: formatRp(adsBudgetTotal),
        activeWalletCount: walletRows.filter(r => r.is_active).length,
        wallets: walletRows.map(r => ({
            name: r.name,
            balance: formatRp(Number(r.balance)),
            balanceRaw: Number(r.balance),
            isActive: r.is_active,
            isAdsBudget: r.is_ads_budget,
            linkedPlatform: r.linked_platform || null,
            trxCount: Number(r.trx_count),
        })),
        recentTransactions: recentRows.map(r => ({
            date: fmtWIBDate(new Date(r.trx_date)),
            wallet: r.wallet_name,
            type: r.trx_type,
            category: r.category || '-',
            amount: formatRp(Number(r.amount)),
            note: r.note || '',
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 7: Expense breakdown per kategori
// ─────────────────────────────────────────────
export async function getExpenseBreakdown(period?: string, startDate?: string, endDate?: string) {
    const range = resolveRange(period || 'month', startDate, endDate)

    const rows = await prisma.$queryRaw<any[]>`
        SELECT
            COALESCE(category, '(Tanpa Kategori)') AS category,
            COUNT(*)::int AS trx_count,
            COALESCE(SUM(ABS(amount)), 0)::bigint AS total_amount
        FROM wallet_ledger
        WHERE trx_type = 'EXPENSE'
          AND trx_date >= ${range.gte}
          AND trx_date <= ${range.lte}
        GROUP BY category
        ORDER BY total_amount DESC
    `

    const grandTotal = rows.reduce((s, r) => s + Number(r.total_amount), 0)

    return {
        period: range.label,
        totalExpense: formatRp(grandTotal),
        categoryCount: rows.length,
        breakdown: rows.map(r => ({
            category: r.category,
            trxCount: Number(r.trx_count),
            total: formatRp(Number(r.total_amount)),
            share: grandTotal > 0 ? ((Number(r.total_amount) / grandTotal) * 100).toFixed(1) + '%' : '0%',
        })),
    }
}

// ─────────────────────────────────────────────
// Tool 9: Utang & Piutang outstanding
// ─────────────────────────────────────────────
export async function getUtangPiutangSummary() {
    const nowWIB = getNowWIB()
    const in7DaysWIB = new Date(nowWIB.getTime() + 7 * 86400000)

    // Utang outstanding
    const utangRows = await prisma.$queryRaw<any[]>`
        SELECT
            id,
            type,
            creditor_name,
            source_wallet_name,
            amount,
            amount_paid,
            (amount - amount_paid)::bigint AS sisa,
            trx_date,
            due_date,
            status
        FROM utangs
        WHERE status IN ('OUTSTANDING', 'PARTIAL')
        ORDER BY due_date ASC NULLS LAST, trx_date ASC
    `

    // Piutang outstanding
    const piutangRows = await prisma.$queryRaw<any[]>`
        SELECT
            id,
            type,
            debtor_name,
            source_wallet_name,
            amount,
            amount_collected,
            (amount - amount_collected)::bigint AS sisa,
            trx_date,
            due_date,
            status
        FROM piutangs
        WHERE status IN ('OUTSTANDING', 'PARTIAL')
        ORDER BY due_date ASC NULLS LAST, trx_date ASC
    `

    const totalUtang = utangRows.reduce((s, r) => s + Number(r.sisa), 0)
    const totalPiutang = piutangRows.reduce((s, r) => s + Number(r.sisa), 0)

    const isApproachingDue = (dueDate: any): boolean => {
        if (!dueDate) return false
        const d = new Date(dueDate)
        return d <= in7DaysWIB
    }
    const isOverdue = (dueDate: any): boolean => {
        if (!dueDate) return false
        const d = new Date(dueDate)
        return d < nowWIB
    }

    return {
        netPosition: formatRp(totalPiutang - totalUtang),
        utang: {
            count: utangRows.length,
            totalOutstanding: formatRp(totalUtang),
            approachingDue: utangRows.filter(r => isApproachingDue(r.due_date) && !isOverdue(r.due_date)).length,
            overdue: utangRows.filter(r => isOverdue(r.due_date)).length,
            items: utangRows.slice(0, 15).map(r => ({
                creditor: r.creditor_name,
                type: r.type,
                amount: formatRp(Number(r.amount)),
                paid: formatRp(Number(r.amount_paid)),
                sisa: formatRp(Number(r.sisa)),
                trxDate: fmtWIBDate(new Date(r.trx_date)),
                dueDate: r.due_date ? fmtWIBDate(new Date(r.due_date)) : null,
                status: r.status,
                isOverdue: isOverdue(r.due_date),
                isApproachingDue: isApproachingDue(r.due_date) && !isOverdue(r.due_date),
            })),
        },
        piutang: {
            count: piutangRows.length,
            totalOutstanding: formatRp(totalPiutang),
            approachingDue: piutangRows.filter(r => isApproachingDue(r.due_date) && !isOverdue(r.due_date)).length,
            overdue: piutangRows.filter(r => isOverdue(r.due_date)).length,
            items: piutangRows.slice(0, 15).map(r => ({
                debtor: r.debtor_name,
                type: r.type,
                amount: formatRp(Number(r.amount)),
                collected: formatRp(Number(r.amount_collected)),
                sisa: formatRp(Number(r.sisa)),
                trxDate: fmtWIBDate(new Date(r.trx_date)),
                dueDate: r.due_date ? fmtWIBDate(new Date(r.due_date)) : null,
                status: r.status,
                isOverdue: isOverdue(r.due_date),
                isApproachingDue: isApproachingDue(r.due_date) && !isOverdue(r.due_date),
            })),
        },
    }
}
