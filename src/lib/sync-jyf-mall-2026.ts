import { prisma } from './prisma';
import { VendorPaymentType, VendorPaymentStatus, WalletTrxType } from '@prisma/client';
import syncData from '@/data/jyf-mall-2026-data.json';

const SYNC_KEY = 'jyf_mall_2026_sync_v1';

export async function autoSyncJyfMall2026(): Promise<void> {
  try {
    const existing = await prisma.appSetting.findUnique({
      where: { key: SYNC_KEY },
    });

    if (existing) {
      return;
    }

    console.log('[AutoSync] Starting automatic migration for JYF Mall 2026 data...');

    // 1. Clean up unused dummy wallets if 0 ledger entries
    for (const name of syncData.cleanupWallets) {
      const w = await prisma.wallet.findFirst({ where: { name } });
      if (w) {
        const count = await prisma.walletLedger.count({ where: { walletId: w.id } });
        if (count === 0) {
          await prisma.wallet.delete({ where: { id: w.id } }).catch(() => {});
          console.log(`[AutoSync] Cleaned up unused wallet: ${name}`);
        }
      }
    }

    // 2. Ensure target wallets exist
    const walletMap = new Map<string, string>(); // name -> id
    for (const tw of syncData.wallets) {
      let w = await prisma.wallet.findFirst({ where: { name: tw.name } });
      if (!w) {
        w = await prisma.wallet.create({
          data: {
            name: tw.name,
            isActive: true,
            isAdsBudget: false,
            linkedPlatform: tw.linkedPlatform,
          },
        });
        console.log(`[AutoSync] Created wallet: ${w.name}`);
      }
      walletMap.set(tw.name, w.id);
    }

    // Also get platform wallets if present
    const allWallets = await prisma.wallet.findMany();
    for (const w of allWallets) {
      walletMap.set(w.name, w.id);
    }

    // 3. Ensure vendors exist
    const vendorMap = new Map<string, string>(); // vendorCode -> id
    for (const v of syncData.vendors) {
      let rec = await prisma.vendor.findUnique({ where: { vendorCode: v.vendorCode } });
      if (!rec) {
        rec = await prisma.vendor.create({
          data: {
            vendorCode: v.vendorCode,
            namaVendor: v.namaVendor,
            isActive: true,
            createdBy: 'import-transaksi',
          },
        });
        console.log(`[AutoSync] Created vendor: ${rec.namaVendor}`);
      }
      vendorMap.set(v.vendorCode, rec.id);
    }

    // 4. Remove previous imported ledgers & vendor payments to prevent duplication
    await prisma.vendorPayment.deleteMany({ where: { createdBy: 'import-transaksi' } });
    await prisma.walletLedger.deleteMany({ where: { createdBy: 'import-transaksi' } });

    // 5. Insert Vendor Payments
    let vpCount = 0;
    for (const vp of syncData.vendorPayments) {
      const vendorId = vendorMap.get(vp.vendorCode);
      const walletId = walletMap.get(vp.walletName);
      if (!vendorId || !walletId) continue;

      await prisma.vendorPayment.create({
        data: {
          paymentNumber: vp.paymentNumber,
          paymentDate: new Date(vp.paymentDate),
          vendorId,
          vendorName: syncData.vendors.find(v => v.vendorCode === vp.vendorCode)?.namaVendor || 'Vendor',
          walletId,
          walletName: vp.walletName,
          amount: vp.amount,
          paymentType: vp.paymentType as VendorPaymentType,
          status: vp.status as VendorPaymentStatus,
          note: vp.note,
          createdBy: 'import-transaksi',
        },
      });
      vpCount++;
    }

    // 6. Insert Wallet Ledgers
    let ledgerCount = 0;
    for (const l of syncData.ledgers) {
      const walletId = walletMap.get(l.walletName);
      if (!walletId) continue;

      await prisma.walletLedger.create({
        data: {
          walletId,
          trxDate: new Date(l.trxDate),
          trxType: l.trxType as WalletTrxType,
          category: l.category,
          amount: l.amount,
          note: l.note,
          createdBy: 'import-transaksi',
        },
      });
      ledgerCount++;
    }

    // 7. Mark as synced in app_settings
    await prisma.appSetting.upsert({
      where: { key: SYNC_KEY },
      update: { value: new Date().toISOString(), updatedBy: 'system-autosync' },
      create: { key: SYNC_KEY, value: new Date().toISOString(), updatedBy: 'system-autosync' },
    });

    console.log(`[AutoSync] Successfully synced JYF Mall 2026! (${vpCount} vendor payments, ${ledgerCount} ledger entries)`);
  } catch (err) {
    console.error('[AutoSync] Error syncing JYF Mall 2026 data:', err);
  }
}
