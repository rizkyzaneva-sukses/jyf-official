import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = process.env.CRON_SECRET || 'jyf-local-cron-secret';

    const isOwner = session?.isLoggedIn && session?.userRole === 'OWNER';
    const isSecretValid = cronSecret && cronSecret === expectedSecret;

    if (!isOwner && !isSecretValid) {
      return NextResponse.json({ error: 'Unauthorized. Hanya Owner yang dapat mereset database.' }, { status: 403 });
    }

    console.log('[API-Restore] Owner triggered database wipe and restore...');

    // 1. Truncate tables
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
    await prisma.$executeRawUnsafe(truncateSql);

    // 2. Read dump
    const gzPath = path.join(process.cwd(), 'prisma', 'data', 'production-data.sql.gz');
    const sqlPath = path.join(process.cwd(), 'prisma', 'data', 'production-data.sql');

    let sqlBuffer: Buffer;
    if (fs.existsSync(gzPath)) {
      sqlBuffer = zlib.gunzipSync(fs.readFileSync(gzPath));
    } else if (fs.existsSync(sqlPath)) {
      sqlBuffer = fs.readFileSync(sqlPath);
    } else {
      return NextResponse.json({ error: 'Dump file tidak ditemukan di server.' }, { status: 404 });
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return NextResponse.json({ error: 'DATABASE_URL tidak diset.' }, { status: 500 });
    }

    let psqlCmd = 'psql';
    if (process.platform === 'win32') {
      const wherePsql = spawnSync('where', ['psql']);
      if (wherePsql.status !== 0) {
        const defaultWinPath = 'C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe';
        if (fs.existsSync(defaultWinPath)) psqlCmd = defaultWinPath;
      }
    }

    const result = spawnSync(psqlCmd, ['-d', dbUrl, '-q'], {
      input: sqlBuffer,
      stdio: ['pipe', 'inherit', 'inherit'],
      maxBuffer: 100 * 1024 * 1024,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    const SYNC_KEY = 'db_full_sync_2026_10_02_v1';
    await prisma.appSetting.upsert({
      where: { key: SYNC_KEY },
      update: { value: new Date().toISOString(), updatedBy: 'owner-api-restore' },
      create: { key: SYNC_KEY, value: new Date().toISOString(), updatedBy: 'owner-api-restore' },
    });

    const [orderCount, payoutCount, ledgerCount, vendorCount] = await Promise.all([
      prisma.order.count(),
      prisma.payout.count(),
      prisma.walletLedger.count(),
      prisma.vendor.count(),
    ]);

    return NextResponse.json({
      success: true,
      message: 'Database berhasil direset dan dipulihkan ke snapshot JYF lengkap!',
      stats: {
        orders: orderCount,
        payouts: payoutCount,
        walletLedgers: ledgerCount,
        vendors: vendorCount,
      },
    });
  } catch (err: any) {
    console.error('[API-Restore] Error:', err);
    return NextResponse.json({ error: err.message || 'Gagal memulihkan database' }, { status: 500 });
  }
}
