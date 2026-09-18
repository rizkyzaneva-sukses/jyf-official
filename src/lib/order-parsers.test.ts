import { describe, it, expect } from 'vitest'
import {
  parseShopeeOrders,
  parseTikTokOrders,
  detectPlatform,
} from '@/lib/order-parsers'

// ── detectPlatform ──────────────────────────────────────

describe('detectPlatform', () => {
  it('detects TikTok from "Order ID" header', () => {
    const headers = ['Order ID', 'Product Name', 'Quantity']
    expect(detectPlatform(headers)).toBe('TikTok')
  })

  it('detects TikTok from "Seller SKU" header', () => {
    const headers = ['Seller SKU', 'Product Name']
    expect(detectPlatform(headers)).toBe('TikTok')
  })

  it('detects TikTok from "Tracking ID" header', () => {
    const headers = ['Tracking ID', 'Order Status']
    expect(detectPlatform(headers)).toBe('TikTok')
  })

  it('detects TikTok from "Order settled time" header', () => {
    const headers = ['Order settled time', 'Buyer Username']
    expect(detectPlatform(headers)).toBe('TikTok')
  })

  it('detects Shopee from "No. Pesanan" header', () => {
    const headers = ['No. Pesanan', 'Status Pesanan']
    expect(detectPlatform(headers)).toBe('Shopee')
  })

  it('detects Shopee from "Nomor Referensi SKU" header', () => {
    const headers = ['Nomor Referensi SKU', 'Harga Setelah Diskon']
    expect(detectPlatform(headers)).toBe('Shopee')
  })

  it('detects Shopee from "Waktu Dana Dilepaskan" header', () => {
    const headers = ['Waktu Dana Dilepaskan', 'No. Resi']
    expect(detectPlatform(headers)).toBe('Shopee')
  })

  it('detects Shopee from "Waktu Pesanan Dibuat" header', () => {
    const headers = ['Waktu Pesanan Dibuat']
    expect(detectPlatform(headers)).toBe('Shopee')
  })

  it('returns null for unrecognized headers', () => {
    const headers = ['Name', 'Email', 'Phone']
    expect(detectPlatform(headers)).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(detectPlatform([])).toBeNull()
  })

  it('is case-insensitive', () => {
    const headers = ['ORDER ID', 'seller sku']
    expect(detectPlatform(headers)).toBe('TikTok')
  })

  it('detects TikTok over Shopee when both have matching headers', () => {
    // TikTok check comes first in the code
    const headers = ['Order ID', 'No. Pesanan']
    expect(detectPlatform(headers)).toBe('TikTok')
  })
})

// ── parseShopeeOrders ───────────────────────────────────

describe('parseShopeeOrders', () => {
  const emptyHppMap = new Map<string, number>()
  const emptySkuMapping = new Map<string, string>()

  function makeShopeeRow(overrides: Record<string, unknown> = {}) {
    return {
      'No. Pesanan': 'SHP-001',
      'Status Pesanan': 'Selesai',
      'Nomor Referensi SKU': 'SKU-A',
      'Harga Setelah Diskon': '100.000',
      'Jumlah': '2',
      'Voucher Ditanggung Penjual': '0',
      'No. Resi': 'RESI001',
      'Waktu Pesanan Dibuat': '2026-06-10',
      'Nama Produk': 'Product A',
      'Kota/Kabupaten': 'Jakarta',
      'Provinsi': 'DKI Jakarta',
      'Username (Pembeli)': 'buyer1',
      'Nama Penerima': 'Buyer One',
      'No. Telepon': '0812345678',
      ...overrides,
    }
  }

  it('parses a simple single-row order', () => {
    const rows = [makeShopeeRow()]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(1)
    expect(result.failed).toHaveLength(0)
  })

  it('sets platform to Shopee', () => {
    const rows = [makeShopeeRow()]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].platform).toBe('Shopee')
  })

  it('parses order number correctly', () => {
    const rows = [makeShopeeRow()]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].orderNo).toBe('SHP-001')
  })

  it('parses quantity from Jumlah field', () => {
    const rows = [makeShopeeRow({ 'Jumlah': '3' })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].qty).toBe(3)
  })

  it('defaults qty to 1 when Jumlah is missing', () => {
    const rows = [makeShopeeRow({ 'Jumlah': undefined })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].qty).toBe(1)
  })

  it('skips rows without order number', () => {
    const rows = [makeShopeeRow({ 'No. Pesanan': '' })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
  })

  it('skips cancelled orders (dibatalkan)', () => {
    const rows = [makeShopeeRow({ 'Status Pesanan': 'Dibatalkan' })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
  })

  it('skips cancelled orders (batal)', () => {
    const rows = [makeShopeeRow({ 'Status Pesanan': 'Batal' })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
  })

  it('skips cancelled orders (cancelled)', () => {
    const rows = [makeShopeeRow({ 'Status Pesanan': 'Cancelled' })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
  })

  it('skips refund orders (pengembalian dana)', () => {
    const rows = [makeShopeeRow({ 'Status Pesanan': 'Pengembalian Dana' })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
  })

  it('groups multiple rows with same order number', () => {
    const rows = [
      makeShopeeRow({ 'No. Pesanan': 'SHP-100', 'Nomor Referensi SKU': 'SKU-A' }),
      makeShopeeRow({ 'No. Pesanan': 'SHP-100', 'Nomor Referensi SKU': 'SKU-B' }),
    ]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(2)
    expect(result.orders[0].orderNo).toBe('SHP-100')
    expect(result.orders[1].orderNo).toBe('SHP-100')
  })

  it('sets airwaybill from No. Resi', () => {
    const rows = [makeShopeeRow({ 'No. Resi': 'AWB123' })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].airwaybill).toBe('AWB123')
  })

  it('sets airwaybill to null when No. Resi is empty', () => {
    const rows = [makeShopeeRow({ 'No. Resi': '' })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].airwaybill).toBeNull()
  })

  it('looks up HPP from hppMap', () => {
    const hppMap = new Map<string, number>([['sku-a', 50000]])
    const rows = [makeShopeeRow()]
    const result = parseShopeeOrders(rows, hppMap, emptySkuMapping)
    expect(result.orders[0].hpp).toBe(50000)
  })

  it('defaults HPP to 0 when not in hppMap', () => {
    const rows = [makeShopeeRow()]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].hpp).toBe(0)
  })

  it('applies admin fee to realOmzet calculation', () => {
    const rows = [makeShopeeRow({
      'Harga Setelah Diskon': '100.000',
      'Jumlah': '1',
      'Voucher Ditanggung Penjual': '0',
    })]
    // default admin fee = 14%
    // basePrice = 100000, fee = 14000, realOmzet = (100000 - 14000) * 1 = 86000
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].realOmzet).toBe(86000)
  })

  it('applies custom admin fee', () => {
    const rows = [makeShopeeRow({
      'Harga Setelah Diskon': '100.000',
      'Jumlah': '1',
      'Voucher Ditanggung Penjual': '0',
    })]
    // admin fee = 10%
    // basePrice = 100000, fee = 10000, realOmzet = 90000
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping, 10)
    expect(result.orders[0].realOmzet).toBe(90000)
  })

  it('distributes voucher to non-excluded items', () => {
    const rows = [makeShopeeRow({
      'Harga Setelah Diskon': '100.000',
      'Jumlah': '2',
      'Voucher Ditanggung Penjual': '20.000',
    })]
    // voucherPerUnit = 20000 / 2 = 10000
    // basePrice = 100000 - 10000 = 90000
    // fee = 90000 * 0.14 = 12600
    // realOmzet = (90000 - 12600) * 2 = 154800
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].realOmzet).toBe(154800)
  })

  it('handles kaos SKUs with zero price', () => {
    const rows = [makeShopeeRow({ 'Nomor Referensi SKU': 'Kaos Merah' })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].totalProductPrice).toBe(0)
    expect(result.orders[0].realOmzet).toBe(0)
  })

  it('resolves combined SKU with mapping', () => {
    const skuMapping = new Map<string, string>([
      ['sku-a + sku-b', 'SKU-X + SKU-Y'],
    ])
    const rows = [makeShopeeRow({
      'Nomor Referensi SKU': 'SKU-A + SKU-B',
      'Harga Setelah Diskon': '200.000',
      'Jumlah': '1',
      'Voucher Ditanggung Penjual': '0',
    })]
    const result = parseShopeeOrders(rows, emptyHppMap, skuMapping)
    expect(result.orders).toHaveLength(2)
    expect(result.orders[0].sku).toBe('SKU-X')
    expect(result.orders[1].sku).toBe('SKU-Y')
  })

  it('marks combined SKU as failed when not in mapping', () => {
    const rows = [makeShopeeRow({
      'Nomor Referensi SKU': 'SKU-A + SKU-B',
    })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].reason).toContain('gabungan')
  })

  it('returns empty result for empty input', () => {
    const result = parseShopeeOrders([], emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
    expect(result.failed).toHaveLength(0)
  })

  it('parses province and city', () => {
    const rows = [makeShopeeRow({
      'Kota/Kabupaten': 'Bandung',
      'Provinsi': 'Jawa Barat',
    })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].city).toBe('Bandung')
    expect(result.orders[0].province).toBe('Jawa Barat')
  })

  it('parses buyer info', () => {
    const rows = [makeShopeeRow({
      'Username (Pembeli)': 'buyer123',
      'Nama Penerima': 'John Doe',
      'No. Telepon': '081234567890',
    })]
    const result = parseShopeeOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].buyerUsername).toBe('buyer123')
    expect(result.orders[0].receiverName).toBe('John Doe')
    expect(result.orders[0].phone).toBe('081234567890')
  })
})

// ── parseTikTokOrders ───────────────────────────────────

describe('parseTikTokOrders', () => {
  const emptyHppMap = new Map<string, number>()
  const emptySkuMapping = new Map<string, string>()

  function makeTikTokRow(overrides: Record<string, unknown> = {}) {
    return {
      'Order ID': 'TT-001',
      'Order Status': 'Delivered',
      'Seller SKU': 'SKU-A',
      'SKU Subtotal After Discount': '100000',
      'Quantity': '2',
      'Tracking ID': 'TRK001',
      'Created Time': '2026-06-10',
      'Product Name': 'Product A',
      'Regency and City': 'Jakarta',
      'Province': 'DKI Jakarta',
      'Buyer Username': 'buyer1',
      'Recipient': 'Buyer One',
      'Phone #': '0812345678',
      ...overrides,
    }
  }

  it('parses a simple single-row order', () => {
    const rows = [makeTikTokRow()]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(1)
    expect(result.failed).toHaveLength(0)
  })

  it('sets platform to TikTok', () => {
    const rows = [makeTikTokRow()]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].platform).toBe('TikTok')
  })

  it('parses order number from Order ID', () => {
    const rows = [makeTikTokRow()]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].orderNo).toBe('TT-001')
  })

  it('parses quantity', () => {
    const rows = [makeTikTokRow({ 'Quantity': '5' })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].qty).toBe(5)
  })

  it('defaults qty to 1 when Quantity is missing', () => {
    const rows = [makeTikTokRow({ 'Quantity': undefined })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].qty).toBe(1)
  })

  it('skips rows without Order ID', () => {
    const rows = [makeTikTokRow({ 'Order ID': '' })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
  })

  it('skips cancelled orders (cancelled)', () => {
    const rows = [makeTikTokRow({ 'Order Status': 'Cancelled' })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
  })

  it('skips cancelled orders (dibatalkan)', () => {
    const rows = [makeTikTokRow({ 'Order Status': 'Dibatalkan' })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
  })

  it('skips cancelled orders (canceled)', () => {
    const rows = [makeTikTokRow({ 'Order Status': 'Canceled' })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
  })

  it('applies admin fee to realOmzet calculation', () => {
    const rows = [makeTikTokRow({
      'SKU Subtotal After Discount': '100000',
      'Quantity': '1',
    })]
    // default admin fee = 14.1%
    // realOmzet = round(100000 * (1 - 0.141)) = round(85900) = 85900
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].realOmzet).toBe(85900)
  })

  it('applies custom admin fee', () => {
    const rows = [makeTikTokRow({
      'SKU Subtotal After Discount': '100000',
      'Quantity': '1',
    })]
    // admin fee = 10%
    // realOmzet = round(100000 * 0.9) = 90000
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping, 10)
    expect(result.orders[0].realOmzet).toBe(90000)
  })

  it('handles kaos SKUs with zero price', () => {
    const rows = [makeTikTokRow({ 'Seller SKU': 'T-shirt Merah' })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].totalProductPrice).toBe(0)
    expect(result.orders[0].realOmzet).toBe(0)
  })

  it('resolves combined SKU with mapping', () => {
    const skuMapping = new Map<string, string>([
      ['sku-a + sku-b', 'SKU-X + SKU-Y'],
    ])
    const rows = [makeTikTokRow({
      'Seller SKU': 'SKU-A + SKU-B',
      'SKU Subtotal After Discount': '200000',
    })]
    const result = parseTikTokOrders(rows, emptyHppMap, skuMapping)
    expect(result.orders).toHaveLength(2)
    expect(result.orders[0].sku).toBe('SKU-X')
    expect(result.orders[1].sku).toBe('SKU-Y')
  })

  it('marks combined SKU as failed when not in mapping', () => {
    const rows = [makeTikTokRow({ 'Seller SKU': 'SKU-A + SKU-B' })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
    expect(result.failed).toHaveLength(1)
    expect(result.failed[0].reason).toContain('gabungan')
  })

  it('parses airwaybill from Tracking ID', () => {
    const rows = [makeTikTokRow({ 'Tracking ID': 'TRK999' })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].airwaybill).toBe('TRK999')
  })

  it('sets airwaybill to null when Tracking ID is empty', () => {
    const rows = [makeTikTokRow({ 'Tracking ID': '' })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].airwaybill).toBeNull()
  })

  it('prefers Order settled time over Created Time', () => {
    const rows = [makeTikTokRow({
      'Order settled time': '2026-06-20',
      'Created Time': '2026-06-10',
    })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].orderCreatedAt).toBe('2026-06-20')
  })

  it('uses Created Time when Order settled time is empty', () => {
    const rows = [makeTikTokRow({
      'Order settled time': '',
      'Created Time': '2026-06-10',
    })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].orderCreatedAt).toBe('2026-06-10')
  })

  it('looks up HPP from hppMap', () => {
    const hppMap = new Map<string, number>([['sku-a', 50000]])
    const rows = [makeTikTokRow()]
    const result = parseTikTokOrders(rows, hppMap, emptySkuMapping)
    expect(result.orders[0].hpp).toBe(50000)
  })

  it('returns empty result for empty input', () => {
    const result = parseTikTokOrders([], emptyHppMap, emptySkuMapping)
    expect(result.orders).toHaveLength(0)
    expect(result.failed).toHaveLength(0)
  })

  it('parses buyer info', () => {
    const rows = [makeTikTokRow({
      'Buyer Username': 'buyer99',
      'Recipient': 'Jane Doe',
      'Phone #': '0876543210',
    })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].buyerUsername).toBe('buyer99')
    expect(result.orders[0].receiverName).toBe('Jane Doe')
    expect(result.orders[0].phone).toBe('0876543210')
  })

  it('parses city and province', () => {
    const rows = [makeTikTokRow({
      'Regency and City': 'Surabaya',
      'Province': 'Jawa Timur',
    })]
    const result = parseTikTokOrders(rows, emptyHppMap, emptySkuMapping)
    expect(result.orders[0].city).toBe('Surabaya')
    expect(result.orders[0].province).toBe('Jawa Timur')
  })
})
