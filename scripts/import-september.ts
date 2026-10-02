import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import { prisma } from '../src/lib/prisma';
import {
  parseShopeeOrders,
  parseTikTokOrders,
  parseLazadaOrders,
} from '../src/lib/order-parsers';
import { parseOrderDate } from '../src/lib/order-date';


// ── Helpers ──
function fixWorksheetRange(ws: XLSX.WorkSheet | undefined): XLSX.WorkSheet | undefined {
  if (!ws) return ws;
  const addresses = Object.keys(ws).filter(k => !k.startsWith('!'));
  const cells = addresses.map(a => XLSX.utils.decode_cell(a));
  if (cells.length === 0) return ws;
  const maxRow = cells.reduce((max, c) => Math.max(max, c.r), 0);
  const maxCol = cells.reduce((max, c) => Math.max(max, c.c), 0);
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  return ws;
}

function n(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  const s = String(val).replace(/,/g, '').trim();
  const num = parseFloat(s);
  return isNaN(num) ? 0 : Math.round(num);
}

function firstValue(row: Record<string, unknown>, cols: string[]): unknown {
  for (const col of cols) {
    if (row[col] !== undefined && row[col] !== null && row[col] !== '') return row[col];
  }
  return undefined;
}

function firstNumber(row: Record<string, unknown>, cols: string[]): number {
  return n(firstValue(row, cols));
}

function parseDateValue(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const raw = String(value).trim();
  const ymd = raw.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (ymd) {
    return new Date(`${ymd[1]}-${ymd[2].padStart(2, '0')}-${ymd[3].padStart(2, '0')}T12:00:00+07:00`);
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

const TIKTOK_ORDER_ID_COLS = [
  'Order/adjustment ID',
  'ID Pesanan/Penyesuaian',
  'ID pesanan/penyesuaian',
  'Order ID',
  'ID Pesanan',
];
const TIKTOK_TYPE_COLS = ['Type', 'Jenis', 'Tipe', 'Jenis transaksi'];
const TIKTOK_DATE_COLS = ['Order settled time', 'Waktu penyelesaian pesanan', 'Waktu pembayaran pesanan', 'Waktu pemesanan'];
const TIKTOK_SETTLEMENT_COLS = [
  'Total settlement amount', 'Total Settlement Amount', 'Settlement Amount',
  'Jumlah penyelesaian pembayaran', 'Jumlah Penyelesaian Pembayaran',
  'Jumlah penyelesaian', 'Total Penyelesaian', 'Jumlah Penyelesaian',
  'Seller Settlement Amount', 'Jumlah Penyelesaian Penjual'
];
const TIKTOK_OMZET_COLS = ['Total Revenue', 'Total Pendapatan', 'Total pendapatan', 'Seller Revenue', 'Pendapatan Penjual'];

function calcTikTok(row: Record<string, unknown>) {
  const omzet = firstNumber(row, TIKTOK_OMZET_COLS);
  const totalFee = firstNumber(row, ['Total Fee', 'Total Fees', 'Total Biaya']);
  const biayaPlatform = totalFee || (
    firstNumber(row, ['Platform commission fee', 'Biaya komisi platform']) +
    firstNumber(row, ['Order processing fee', 'Biaya pemrosesan pesanan']) +
    firstNumber(row, ['Dynamic commission', 'Komisi dinamis']) +
    firstNumber(row, ['Shipping cost', 'Biaya pengiriman', 'Ongkir']) +
    firstNumber(row, ['Transaction fee', 'Biaya transaksi', 'Biaya Pembayaran']) +
    firstNumber(row, ['Seller Transaction Fee', 'Biaya Transaksi Penjual']) +
    firstNumber(row, ['Biaya layanan pre-order']) +
    firstNumber(row, ['Biaya layanan Mall']) +
    firstNumber(row, ['Credit card installment - Handling fee']) +
    firstNumber(row, ['Ongkir yang ditalangi penyedia jasa logistik']) +
    firstNumber(row, ['Ongkir penggantian (ditanggung pembeli)']) +
    firstNumber(row, ['Ongkir penukaran (ditanggung pembeli)'])
  );
  const biayaAms =
    firstNumber(row, ['Affiliate Commission', 'Komisi afiliasi']) +
    firstNumber(row, ['Affiliate Shop Ads commission', 'Komisi Iklan Toko Afiliasi']);
  const yangDiterima = firstNumber(row, TIKTOK_SETTLEMENT_COLS);
  return { omzet, biayaPlatform, biayaAms, biayaPlatformLainnya: 0, yangDiterima };
}

function calcShopee(row: Record<string, unknown>) {
  const omzet =
    firstNumber(row, ['Harga Asli Produk', 'Harga Produk']) +
    n(row['Total Diskon Produk']) +
    firstNumber(row, ['Voucher disponsor oleh Penjual', 'Penyesuaian Penjual - 1']) +
    firstNumber(row, ['Voucher co-fund disponsor oleh Penjual', 'Penyesuaian Penjual - 2']);

  const biayaPlatform =
    n(row['Biaya Administrasi']) +
    n(row['Biaya Layanan']) +
    n(row['Biaya Proses Pesanan']) +
    n(row['Biaya Layanan Promo XTRA']);

  const biayaAms =
    n(row['Biaya Komisi AMS']) +
    n(row['AMS Service Fee']);

  const biayaPlatformLainnya =
    n(row['Premi']) +
    n(row['Biaya Program Hemat Biaya Kirim']) +
    n(row['Biaya Transaksi']) +
    n(row['Biaya Kampanye']) +
    firstNumber(row, ['Bea Masuk, PPN & PPh', 'PPh 22']) +
    n(row['Biaya Isi Saldo Otomatis (dari Penghasilan)']) +
    n(row['Biaya Lainnya']) +
    n(row['FBS Fee']) +
    n(row['Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori D)']) +
    n(row['Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori G)']) +
    n(row['Biaya Gratis Ongkir XTRA - Ukuran Biasa (Kategori G) #2']);

  const bebanOngkir =
    n(row['Ongkos Kirim Pengembalian Barang']) +
    n(row['Kembali ke Biaya Pengiriman Pengirim']) +
    n(row['Pengembalian Biaya Kirim']) +
    n(row['Return to Seller Fee']);

  const yangDiterima = n(row['Total Penghasilan']);
  return { omzet, biayaPlatform, biayaAms, biayaPlatformLainnya, bebanOngkir, yangDiterima };
}

const LAZADA_ORDER_NO_COL = 'Nomor Pesanan';
const LAZADA_RELEASED_DATE_COL = 'Tanggal Dilepas';
const LAZADA_RELEASE_STATUS_COL = 'Status Pelepasan Dana';
const LAZADA_AMOUNT_COL = 'Jumlah (Termasuk Pajak)';
const LAZADA_FEE_NAME_COL = 'Nama Biaya';

function groupLazadaIncomeRows(rawRows: Record<string, unknown>[]): Record<string, unknown>[] {
  const grouped = new Map<string, Record<string, unknown>>();
  for (const row of rawRows) {
    const orderNo = String(row[LAZADA_ORDER_NO_COL] ?? '').trim();
    if (!orderNo) continue;
    const releaseStatus = String(row[LAZADA_RELEASE_STATUS_COL] ?? '').trim().toLowerCase();
    if (releaseStatus && !releaseStatus.includes('dilepas')) continue;
    const amount = n(row[LAZADA_AMOUNT_COL]);
    const feeName = String(row[LAZADA_FEE_NAME_COL] ?? '').trim().toLowerCase();
    const current = grouped.get(orderNo) ?? {
      __orderNo: orderNo,
      __releasedDate: String(row[LAZADA_RELEASED_DATE_COL] ?? '').trim(),
      __settlement: 0,
      __omzet: 0,
      __platformFee: 0,
      __platformFeeOther: 0,
    };
    current.__settlement = n(current.__settlement) + amount;
    if (feeName.includes('omset penjualan')) {
      current.__omzet = n(current.__omzet) + amount;
    } else if (/(komisi|biaya transaksi|order processing|biaya layanan)/.test(feeName)) {
      current.__platformFee = n(current.__platformFee) + amount;
    } else {
      current.__platformFeeOther = n(current.__platformFeeOther) + amount;
    }
    grouped.set(orderNo, current);
  }
  return [...grouped.values()];
}

function calcLazada(row: Record<string, unknown>) {
  return {
    omzet: n(row.__omzet),
    biayaPlatform: n(row.__platformFee),
    biayaAms: 0,
    biayaPlatformLainnya: n(row.__platformFeeOther),
    yangDiterima: n(row.__settlement),
  };
}

async function run() {
  console.log('=== STARTING SEPTEMBER IMPORT ===');
  const septDir = path.join('DATA RAHASIA', 'SEPTEMBER');

  // Load product & settings for orders
  const [products, skuMappings, shopeeFeeSetting, tiktokFeeSetting] = await Promise.all([
    prisma.masterProduct.findMany({ select: { sku: true, hpp: true, productName: true } }),
    prisma.skuMapping.findMany({ where: { isActive: true }, select: { fromSku: true, toSku: true } }),
    prisma.appSetting.findUnique({ where: { key: 'biaya_admin_shopee' } }),
    prisma.appSetting.findUnique({ where: { key: 'biaya_admin_tiktok' } }),
  ]);

  const hppMap = new Map(products.map(p => [p.sku.toLowerCase(), p.hpp]));
  const productNameMap = new Map(products.map(p => [p.sku.toLowerCase(), p.productName]));
  const skuMappingMap = new Map(skuMappings.map(m => [m.fromSku.toLowerCase(), m.toSku]));

  const shopeeAdminFee = parseFloat(shopeeFeeSetting?.value ?? '14');
  const tiktokAdminFee = parseFloat(tiktokFeeSetting?.value ?? '14.1');

  // Wallets
  const tiktokWallet = await prisma.wallet.findFirst({ where: { name: { contains: 'TikTok', mode: 'insensitive' } } });
  const shopeeWallet = await prisma.wallet.findFirst({ where: { name: { contains: 'Shopee', mode: 'insensitive' } } });
  const lazadaWallet = await prisma.wallet.findFirst({ where: { name: { contains: 'Lazada', mode: 'insensitive' } } });

  console.log('Wallets:', {
    shopee: shopeeWallet?.id,
    tiktok: tiktokWallet?.id,
    lazada: lazadaWallet?.id,
  });

  // ══════════════════════════════════════════════════
  // PART 1: IMPORT ORDERS
  // ══════════════════════════════════════════════════
  console.log('\n--- 1. PARSING & IMPORTING ORDERS ---');
  const orderFiles = [
    {
      file: 'Data Pesanan September 2026 - Shopee.xlsx',
      platform: 'Shopee',
      parse: (rows: Record<string, unknown>[]) => parseShopeeOrders(rows, hppMap, skuMappingMap, shopeeAdminFee, productNameMap),
    },
    {
      file: 'Data Pesanan September 2026 - Tiktok.xlsx',
      platform: 'TikTok',
      parse: (rows: Record<string, unknown>[]) => parseTikTokOrders(rows, hppMap, skuMappingMap, tiktokAdminFee, productNameMap),
    },
    {
      file: 'Data Pesanan September 2026 - Lazada.xlsx',
      platform: 'Lazada',
      parse: (rows: Record<string, unknown>[]) => parseLazadaOrders(rows, hppMap, skuMappingMap, 0, productNameMap),
    },
  ];

  for (const { file, platform, parse } of orderFiles) {
    const fullPath = path.join(septDir, file);
    if (!fs.existsSync(fullPath)) {
      console.log(`File not found: ${file}`);
      continue;
    }
    const wb = XLSX.readFile(fullPath);
    const ws = wb.Sheets[wb.SheetNames[0]];
    fixWorksheetRange(ws);
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    const { orders: parsed, failed } = parse(rawRows);
    console.log(`[${platform}] Parsed ${parsed.length} orders from ${file} (Failed/unmapped: ${failed.length})`);

    // Check existing orderNo + sku
    const orderNos = [...new Set(parsed.map(p => p.orderNo))];
    const existing = await prisma.order.findMany({
      where: { orderNo: { in: orderNos } },
      select: { orderNo: true, sku: true },
    });
    const existingKeys = new Set(existing.map(e => `${e.orderNo}__${e.sku ?? ''}`));
    const toInsert = parsed.filter(p => !existingKeys.has(`${p.orderNo}__${p.sku ?? ''}`));
    console.log(`[${platform}] New orders to insert: ${toInsert.length} (Skipping existing: ${parsed.length - toInsert.length})`);

    const rowsToInsert = toInsert.map(o => ({
      orderNo: o.orderNo,
      status: o.status,
      platform: o.platform,
      airwaybill: o.airwaybill,
      orderCreatedAt: o.orderCreatedAt,
      trxDate: parseOrderDate(o.orderCreatedAt),
      sku: o.sku,
      productName: o.productName,
      qty: o.qty,
      totalProductPrice: o.totalProductPrice,
      realOmzet: o.realOmzet,
      city: o.city,
      province: o.province,
      buyerUsername: o.buyerUsername,
      receiverName: o.receiverName,
      phone: o.phone,
      hpp: o.hpp,
      createdBy: 'import-september',
    }));

    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
      const chunk = rowsToInsert.slice(i, i + CHUNK);
      const res = await prisma.order.createMany({ data: chunk });
      inserted += res.count;
    }
    console.log(`[${platform}] Successfully inserted ${inserted} orders.`);
  }

  // ══════════════════════════════════════════════════
  // PART 2: IMPORT PAYOUTS
  // ══════════════════════════════════════════════════
  console.log('\n--- 2. PARSING & IMPORTING PAYOUTS ---');
  const existingPayouts = await prisma.payout.findMany({ select: { orderNo: true } });
  const existingPayoutSet = new Set(existingPayouts.map(p => p.orderNo));
  console.log(`Existing payouts in DB: ${existingPayoutSet.size}`);

function parseTableRows(raw: unknown[][], requiredHeader: string) {
  const headerRowIdx = raw.findIndex(row =>
    Array.isArray(row) && row.some(cell => String(cell).trim() === requiredHeader)
  );
  if (headerRowIdx === -1) throw new Error(`Kolom "${requiredHeader}" tidak ditemukan di file`);

  const rawHeaderRow = raw[headerRowIdx] as unknown[];
  let lastCol = rawHeaderRow.length - 1;
  while (lastCol >= 0 && (rawHeaderRow[lastCol] === '' || rawHeaderRow[lastCol] == null)) lastCol--;

  const seenHeaders = new Map<string, number>();
  const headers = rawHeaderRow.slice(0, lastCol + 1).map(cell => {
    const name = String(cell ?? '').trim() || '(kosong)';
    const count = (seenHeaders.get(name) ?? 0) + 1;
    seenHeaders.set(name, count);
    return count === 1 ? name : `${name} #${count}`;
  });

  const rows = raw.slice(headerRowIdx + 1)
    .filter(row => Array.isArray(row) && row.some(cell => cell !== '' && cell != null))
    .map(row => {
      const obj: Record<string, unknown> = {};
      headers.forEach((header, index) => { obj[header] = row[index] ?? 0; });
      return obj;
    });

  return { headers, rows };
}

  const payoutTasks = [
    {
      file: 'Data Pencairan Dana September 2026 - Shopee.xlsx',
      platform: 'Shopee',
      source: 'shopee_income',
      walletId: shopeeWallet?.id!,
      sheetCandidates: ['Penghasilan'],
      getRows: (ws: XLSX.WorkSheet) => {
        const addresses = Object.keys(ws).filter(key => !key.startsWith('!'));
        const cells = addresses.map(address => XLSX.utils.decode_cell(address));
        const maxRow = cells.reduce((max, cell) => Math.max(max, cell.r), 0);
        const maxCol = cells.reduce((max, cell) => Math.max(max, cell.c), 0);
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          defval: '',
          range: { s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } },
        }) as unknown[][];
        const parsed = parseTableRows(raw, 'No. Pesanan');
        return parsed.rows.filter(r => {
          if (!('Lihat berdasarkan' in r)) return true;
          return String(r['Lihat berdasarkan'] ?? '').trim().toLowerCase() === 'order';
        });
      },

      processRow: (r: Record<string, unknown>) => {
        const orderNo = String(r['No. Pesanan'] ?? '').trim();
        if (!orderNo) return null;
        const calc = calcShopee(r);
        const rawDate = r['Tanggal Dana Dilepaskan'];
        const releasedDate = parseDateValue(rawDate) || new Date();
        return { orderNo, calc, releasedDate };
      },
    },
    {
      file: 'Data Pencairan Dana September 2026 - Tiktok.xlsx',
      platform: 'TikTok',
      source: 'tiktok_income',
      walletId: tiktokWallet?.id!,
      sheetCandidates: ['Detail pesanan', 'Order details'],
      getRows: (ws: XLSX.WorkSheet) => {
        fixWorksheetRange(ws);
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: 0 });
        return rows.filter(r => {
          const typeStr = String(firstValue(r, TIKTOK_TYPE_COLS) || '').trim().toLowerCase();
          return typeStr === 'order' || typeStr === 'pesanan';
        });
      },
      processRow: (r: Record<string, unknown>) => {
        const orderNo = String(firstValue(r, TIKTOK_ORDER_ID_COLS) || '').trim();
        if (!orderNo || orderNo.startsWith('/')) return null;
        const calc = calcTikTok(r);
        const rawDate = firstValue(r, TIKTOK_DATE_COLS);
        const releasedDate = parseDateValue(rawDate) || new Date();
        return { orderNo, calc, releasedDate };
      },
    },
    {
      file: 'Data Pencairan Dana September 2026 - Lazada.xlsx',
      platform: 'Lazada',
      source: 'lazada_income',
      walletId: lazadaWallet?.id!,
      sheetCandidates: ['Income Overview'],
      getRows: (ws: XLSX.WorkSheet) => {
        fixWorksheetRange(ws);
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: 0 });
        return groupLazadaIncomeRows(rows);
      },
      processRow: (r: Record<string, unknown>) => {
        const orderNo = String(r.__orderNo ?? '').trim();
        if (!orderNo) return null;
        const calc = calcLazada(r);
        const releasedDate = parseDateValue(r.__releasedDate) || new Date();
        return { orderNo, calc, releasedDate };
      },
    },
  ];

  for (const task of payoutTasks) {
    const fullPath = path.join(septDir, task.file);
    if (!fs.existsSync(fullPath)) {
      console.log(`Payout file not found: ${task.file}`);
      continue;
    }
    const wb = XLSX.readFile(fullPath);
    let ws: XLSX.WorkSheet | undefined;
    for (const name of task.sheetCandidates) {
      if (wb.Sheets[name]) { ws = wb.Sheets[name]; break; }
    }
    if (!ws) ws = wb.Sheets[wb.SheetNames[0]];

    const rows = task.getRows(ws);
    console.log(`[${task.platform} Payout] Total candidate rows: ${rows.length}`);

    const seenOrderNos = new Set<string>();
    const payoutsToInsert: any[] = [];
    const ledgerToInsert: any[] = [];

    for (const row of rows) {
      const processed = task.processRow(row);
      if (!processed) continue;
      const { orderNo, calc, releasedDate } = processed;
      if (existingPayoutSet.has(orderNo) || seenOrderNos.has(orderNo)) continue;
      seenOrderNos.add(orderNo);

      const settlement = calc.yangDiterima;
      if (settlement === 0) continue; // skip net zero

      const ledgerCat = `Payout ${task.platform}`;

      if (settlement < 0) {
        payoutsToInsert.push({
          orderNo,
          releasedDate,
          platform: task.platform,
          omzet: 0,
          platformFee: 0,
          amsFee: 0,
          platformFeeOther: 0,
          bebanOngkir: Math.round(Math.abs(settlement)),
          totalIncome: Math.round(settlement),
          walletId: task.walletId,
          source: task.source,
          createdBy: 'import-september',
          orderId: null,
        });
        ledgerToInsert.push({
          walletId: task.walletId,
          trxDate: releasedDate,
          trxType: 'PAYOUT',
          category: ledgerCat,
          amount: Math.round(settlement),
          refOrderNo: orderNo,
          note: `Payout ${task.platform} (minus) - ${orderNo}`,
          createdBy: 'import-september',
        });
      } else {
        payoutsToInsert.push({
          orderNo,
          releasedDate,
          platform: task.platform,
          omzet: Math.round(Math.abs(calc.omzet)),
          platformFee: Math.round(Math.abs(calc.biayaPlatform)),
          amsFee: Math.round(Math.abs(calc.biayaAms)),
          platformFeeOther: Math.round(Math.abs(calc.biayaPlatformLainnya || 0)),
          bebanOngkir: 0,
          totalIncome: Math.round(settlement),
          walletId: task.walletId,
          source: task.source,
          createdBy: 'import-september',
          orderId: null,
        });
        ledgerToInsert.push({
          walletId: task.walletId,
          trxDate: releasedDate,
          trxType: 'PAYOUT',
          category: ledgerCat,
          amount: Math.round(settlement),
          refOrderNo: orderNo,
          note: `Payout ${task.platform} - ${orderNo}`,
          createdBy: 'import-september',
        });
      }
    }

    console.log(`[${task.platform} Payout] New payouts to insert: ${payoutsToInsert.length}`);

    // Map orderId for existing orders
    const allTaskOrderNos = payoutsToInsert.map(p => p.orderNo);
    const matchingOrders = await prisma.order.findMany({
      where: { orderNo: { in: allTaskOrderNos } },
      select: { id: true, orderNo: true },
      distinct: ['orderNo'],
    });
    const orderIdMap = new Map(matchingOrders.map(o => [o.orderNo, o.id]));
    for (const p of payoutsToInsert) {
      p.orderId = orderIdMap.get(p.orderNo) ?? null;
    }

    const CHUNK = 500;
    for (let i = 0; i < payoutsToInsert.length; i += CHUNK) {
      await prisma.payout.createMany({ data: payoutsToInsert.slice(i, i + CHUNK) });
    }
    for (let i = 0; i < ledgerToInsert.length; i += CHUNK) {
      await prisma.walletLedger.createMany({ data: ledgerToInsert.slice(i, i + CHUNK) });
    }
    console.log(`[${task.platform} Payout] Successfully saved payouts & ledger entries.`);
  }

  // ══════════════════════════════════════════════════
  // PART 3: UPDATE ORDER STATUSES TO DICAIRKAN
  // ══════════════════════════════════════════════════
  console.log('\n--- 3. UPDATING ORDER STATUSES TO DICAIRKAN ---');
  const allPaidPayouts = await prisma.payout.findMany({
    where: { totalIncome: { gt: 0 } },
    select: { orderNo: true },
  });
  const allPaidOrderNos = [...new Set(allPaidPayouts.map(p => p.orderNo))];
  console.log(`Total unique paid orderNos across all payouts: ${allPaidOrderNos.length}`);

  let totalUpdated = 0;
  const CHUNK = 500;
  for (let i = 0; i < allPaidOrderNos.length; i += CHUNK) {
    const chunk = allPaidOrderNos.slice(i, i + CHUNK);
    const res = await prisma.order.updateMany({
      where: {
        orderNo: { in: chunk },
        OR: [
          { status: { startsWith: 'TERKIRIM', mode: 'insensitive' } },
          { status: { startsWith: 'SHIPPED', mode: 'insensitive' } },
        ],
      },
      data: { status: 'DICAIRKAN' },
    });
    totalUpdated += res.count;
  }
  console.log(`Successfully updated ${totalUpdated} orders to DICAIRKAN.`);

  // ══════════════════════════════════════════════════
  // PART 4: SUMMARY BREAKDOWN
  // ══════════════════════════════════════════════════
  console.log('\n--- 4. FINAL ORDER BREAKDOWN ---');
  const summary = await prisma.order.groupBy({
    by: ['platform', 'status'],
    _count: { id: true },
  });
  console.table(summary);
}

run()
  .catch(err => {
    console.error('Error running September import:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
