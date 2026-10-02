const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const prisma = new PrismaClient();
const SYNC_KEY = 'db_full_sync_2026_10_02_v1';

async function main() {
  const force = process.env.FORCE_DB_RESTORE === 'true';
  const existing = await prisma.appSetting.findUnique({ where: { key: SYNC_KEY } }).catch(() => null);

  if (existing && !force) {
    console.log(`[DB-Restore] Database already synced to version ${SYNC_KEY}. Skipping restore.`);
    return;
  }

  console.log(`[DB-Restore] Starting database wipe & restore from snapshot (force=${force})...`);

  // 1. Truncate all tables
  const truncateSql = `
    TRUNCATE TABLE
      orders,
      order_scan_logs,
      payouts,
      wallet_ledger,
      vendor_payments,
      goods_receipt_items,
      goods_receipts,
      purchase_order_items,
      purchase_orders,
      vendors,
      wallets,
      inventory_ledger,
      inventory_scan_batches,
      stock_opname_items,
      stock_opname_batches,
      master_products,
      product_categories,
      master_categories,
      master_reasons,
      master_expense_categories,
      aset_tetap,
      modal_awal,
      utangs,
      utang_payments,
      piutangs,
      piutang_collections,
      sku_mappings,
      telegram_recipients,
      report_schedules,
      ai_insights,
      audit_logs,
      app_users,
      app_settings
    CASCADE;
  `;

  try {
    await prisma.$executeRawUnsafe(truncateSql);
    console.log('[DB-Restore] Old tables truncated successfully.');
  } catch (err) {
    console.warn('[DB-Restore] Truncate warning (tables might be fresh):', err.message);
  }

  // 2. Find SQL dump
  const gzPath = path.join(__dirname, '..', 'prisma', 'data', 'production-data.sql.gz');
  const sqlPath = path.join(__dirname, '..', 'prisma', 'data', 'production-data.sql');

  let sqlBuffer;
  if (fs.existsSync(gzPath)) {
    console.log(`[DB-Restore] Reading and decompressing ${gzPath}...`);
    sqlBuffer = zlib.gunzipSync(fs.readFileSync(gzPath));
  } else if (fs.existsSync(sqlPath)) {
    console.log(`[DB-Restore] Reading ${sqlPath}...`);
    sqlBuffer = fs.readFileSync(sqlPath);
  } else {
    console.error('[DB-Restore] No dump file found at ' + gzPath + ' or ' + sqlPath);
    return;
  }

  // 3. Execute restore via psql
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('[DB-Restore] DATABASE_URL is not set!');
    return;
  }

  // Find psql executable
  let psqlCmd = 'psql';
  if (process.platform === 'win32') {
    const wherePsql = spawnSync('where', ['psql']);
    if (wherePsql.status !== 0) {
      const defaultWinPath = 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe';
      if (fs.existsSync(defaultWinPath)) psqlCmd = defaultWinPath;
    }
  }

  console.log(`[DB-Restore] Piping ${(sqlBuffer.length / (1024 * 1024)).toFixed(2)} MB SQL data to psql...`);
  const result = spawnSync(psqlCmd, ['-d', dbUrl, '-q'], {
    input: sqlBuffer,
    stdio: ['pipe', 'inherit', 'inherit'],
    maxBuffer: 100 * 1024 * 1024,
  });

  if (result.error) {
    console.error('[DB-Restore] Error executing psql:', result.error);
    throw result.error;
  }

  // 4. Record sync version in app_settings
  await prisma.appSetting.upsert({
    where: { key: SYNC_KEY },
    update: { value: new Date().toISOString(), updatedBy: 'system-restore' },
    create: { key: SYNC_KEY, value: new Date().toISOString(), updatedBy: 'system-restore' },
  });

  const orderCount = await prisma.order.count().catch(() => 0);
  const payoutCount = await prisma.payout.count().catch(() => 0);
  const ledgerCount = await prisma.walletLedger.count().catch(() => 0);
  const vendorCount = await prisma.vendor.count().catch(() => 0);

  console.log(`[DB-Restore] Restore complete! Stats:`);
  console.log(`  - Orders: ${orderCount}`);
  console.log(`  - Payouts: ${payoutCount}`);
  console.log(`  - Ledgers: ${ledgerCount}`);
  console.log(`  - Vendors: ${vendorCount}`);
}

main()
  .catch((err) => {
    console.error('[DB-Restore] Fatal error during restore:', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
