import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/session'
import { todayWIBStr, wibDateRange, wibDayEnd, wibDayStart, wibYmd } from '@/lib/utils'

function normalizeStatus(status: string | null | undefined): string {
  return String(status ?? '').trim().toLowerCase()
}

function statusWhere(status: string) {
  const s = normalizeStatus(status)
  if (s.includes('retur') || s.includes('return') || s.includes('dikembalikan')) {
    return {
      OR: [
        { status: { contains: 'retur', mode: 'insensitive' as const } },
        { status: { contains: 'return', mode: 'insensitive' as const } },
        { status: { contains: 'dikembalikan', mode: 'insensitive' as const } },
      ],
    }
  }
  if (s.includes('batal') || s.includes('cancel')) {
    return {
      OR: [
        { status: { contains: 'batal', mode: 'insensitive' as const } },
        { status: { contains: 'cancel', mode: 'insensitive' as const } },
        { status: { contains: 'dibatalkan', mode: 'insensitive' as const } },
      ],
    }
  }
  if (s.startsWith('terkirim') || s.startsWith('shipped')) {
    return {
      OR: [
        { status: { startsWith: 'terkirim', mode: 'insensitive' as const } },
        { status: { startsWith: 'shipped', mode: 'insensitive' as const } },
      ],
    }
  }
  return { status }
}

// GET /api/orders/export
// Query: mode=created_at|order_date|payout_date, dateFrom, dateTo, platform, status
export async function GET(request: NextRequest) {
  const session = await getSession()
  if (!session.isLoggedIn) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (!['OWNER', 'FINANCE', 'STAFF'].includes(session.userRole)) {
    return new Response('Forbidden', { status: 403 })
  }

  const { searchParams } = request.nextUrl
  const mode     = searchParams.get('mode') || 'order_date'
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo   = searchParams.get('dateTo') || ''
  const platform = searchParams.get('platform') || ''
  const status   = searchParams.get('status') || ''
  const statusClause = status ? statusWhere(status) : {}

  let orders: any[] = []

  if (mode === 'payout_date') {
    // Filter berdasarkan payout.releasedDate — cari orderNo yang payout-nya
    // cair dalam rentang, lalu ambil SEMUA order row dengan orderNo tsb.
    // (Tidak pakai relasi payout.orderId: order bisa multi-SKU per orderNo,
    // sedangkan Payout.orderId hanya di-assign ke salah satu row saja saat import.)
    const dateFilter: any = {}
    if (dateFrom && dateTo) {
      const { fromDate, toDate } = wibDateRange(dateFrom, dateTo)
      dateFilter.gte = fromDate
      dateFilter.lte = toDate
    } else if (dateFrom) {
      dateFilter.gte = wibDayStart(dateFrom)
    } else if (dateTo) {
      dateFilter.lte = wibDayEnd(dateTo)
    }

    const matchingPayouts = await prisma.payout.findMany({
      where: Object.keys(dateFilter).length ? { releasedDate: dateFilter } : {},
      select: { orderNo: true, releasedDate: true, totalIncome: true },
    })
    const payoutMap = new Map(matchingPayouts.map(p => [p.orderNo, p]))

    const matchedOrders = await prisma.order.findMany({
      where: {
        orderNo: { in: [...payoutMap.keys()] },
        ...(platform && { platform }),
        ...statusClause,
      },
    })

    orders = matchedOrders
      .map(o => ({ ...o, payout: payoutMap.get(o.orderNo) ?? null }))
      .sort((a, b) => {
        const da = a.payout?.releasedDate ? new Date(a.payout.releasedDate).getTime() : 0
        const db = b.payout?.releasedDate ? new Date(b.payout.releasedDate).getTime() : 0
        return da - db
      })

  } else if (mode === 'created_at') {
    // Mode created_at — filter pakai orderCreatedAt (String, tanggal pesanan dibuat di marketplace)
    const where: any = {}
    if (dateFrom || dateTo) {
      const f: any = {}
      if (dateFrom) f.gte = dateFrom
      if (dateTo)   f.lte = dateTo + ' 23:59:59'
      where.orderCreatedAt = f
    }
    if (platform) where.platform = platform
    if (status)   Object.assign(where, statusClause)

    const matchedOrders = await prisma.order.findMany({
      where,
      orderBy: { orderCreatedAt: 'asc' },
    })
    orders = await attachPayouts(matchedOrders)

  } else {
    // Mode order_date — filter pakai trxDate (DateTime, Waktu Dana Dilepaskan / Order settled time)
    const where: any = {}
    if (dateFrom || dateTo) {
      const f: any = {}
      if (dateFrom && dateTo) {
        const { fromDate, toDate } = wibDateRange(dateFrom, dateTo)
        f.gte = fromDate
        f.lte = toDate
      } else if (dateFrom) {
        f.gte = wibDayStart(dateFrom)
      } else if (dateTo) {
        f.lte = wibDayEnd(dateTo)
      }
      where.trxDate = f
    }
    if (platform) where.platform = platform
    if (status)   Object.assign(where, statusClause)

    let matchedOrders = await prisma.order.findMany({
      where,
      orderBy: { trxDate: 'asc' },
    })

    // Fallback: jika trxDate belum diisi (data lama), coba filter orderCreatedAt (String)
    if (matchedOrders.length === 0 && (dateFrom || dateTo)) {
      const fw: any = {}
      if (dateFrom) fw.orderCreatedAt = { gte: dateFrom }
      if (dateTo)   fw.orderCreatedAt = { ...fw.orderCreatedAt, lte: dateTo + ' 23:59:59' }
      if (platform) fw.platform = platform
      if (status)   Object.assign(fw, statusClause)

      matchedOrders = await prisma.order.findMany({
        where: fw,
        orderBy: { orderCreatedAt: 'asc' },
      })
    }

    orders = await attachPayouts(matchedOrders)
  }

  // BOM agar Excel buka tanpa garbled
  const BOM = '\uFEFF'
  const header = [
    'No. Pesanan', 'Platform', 'SKU', 'Nama Produk', 'Qty',
    'Tgl Order', 'Tgl Cair', 'No. Resi', 'Nama Penerima', 'No. Telepon',
    'Kota', 'Provinsi', 'Status', 'Real Omzet', 'HPP', 'Tgl Pencairan (Payout)',
  ].join(',')

  const rows = orders.map((o: any) => [
    csvEscape(o.orderNo),
    csvEscape(o.platform || ''),
    csvEscape(o.sku || ''),
    csvEscape(o.productName || ''),
    o.qty ?? 0,
    csvEscape(o.orderCreatedAt ? String(o.orderCreatedAt).slice(0, 10) : ''),
    fmtDate(o.trxDate),
    csvEscape(o.airwaybill || ''),
    csvEscape(o.receiverName || ''),
    csvEscape(o.phone || ''),
    csvEscape(o.city || ''),
    csvEscape(o.province || ''),
    csvEscape(o.status || ''),
    o.realOmzet ?? 0,
    o.hpp ?? 0,
    fmtDate(o.payout?.releasedDate),
  ].join(','))

  const csv = BOM + [header, ...rows].join('\n')
  const filename = `orders-export-${mode}-${todayWIBStr()}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

// Join manual berdasarkan orderNo (bukan relasi payout.orderId) — order bisa
// multi-SKU per orderNo, sedangkan Payout.orderId hanya di-assign ke satu row.
async function attachPayouts(orders: any[]): Promise<any[]> {
  const orderNos = [...new Set(orders.map(o => o.orderNo).filter(Boolean))]
  if (orderNos.length === 0) return orders.map(o => ({ ...o, payout: null }))

  const payouts = await prisma.payout.findMany({
    where: { orderNo: { in: orderNos } },
    select: { orderNo: true, releasedDate: true, totalIncome: true },
  })
  const payoutMap = new Map(payouts.map(p => [p.orderNo, p]))

  return orders.map(o => ({ ...o, payout: payoutMap.get(o.orderNo) ?? null }))
}

function csvEscape(val: string): string {
  if (!val) return ''
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return ''
  return wibYmd(d)
}
