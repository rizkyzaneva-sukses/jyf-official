import * as path from 'path';
import * as XLSX from 'xlsx';
import { prisma } from '../src/lib/prisma';
import { VendorPaymentType, VendorPaymentStatus, WalletTrxType } from '@prisma/client';

function serialToDate(serial: unknown): Date {
  if (typeof serial === 'number') {
    const utc_days = Math.floor(serial - 25569);
    const utc_value = utc_days * 86400;
    return new Date(utc_value * 1000);
  }
  const raw = String(serial || '').trim();
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date() : d;
}

const VENDOR_DEFS = [
  { code: 'VND-SPT-YASIR', name: 'Vendor Sepatu Yasir', match: /yasir/i },
  { code: 'VND-SPT-AEP', name: 'Vendor Sepatu Aep', match: /aep/i },
  { code: 'VND-SPT-USEP', name: 'Vendor Sepatu Usep', match: /usep/i },
  { code: 'VND-SPT-IIP', name: 'Vendor Sepatu Iip', match: /iip/i },
  { code: 'VND-SPT-DENI', name: 'Vendor Sepatu Deni', match: /deni/i },
  { code: 'VND-SPT-OYOD', name: 'Vendor Sepatu Oyod', match: /oyod/i },
  { code: 'VND-SPT-FMI', name: 'Vendor Sepatu FMI', match: /fmi/i },
  { code: 'VND-TAS-YUDI', name: 'Vendor Tas Yudi', match: /yudi/i },
  { code: 'VND-TAS-OPI', name: 'Vendor Tas Opi', match: /opi/i },
  { code: 'VND-TAS-BARAKA', name: 'Vendor Tas Baraka', match: /baraka/i },
  { code: 'VND-TAS-ARADA', name: 'Vendor Tas Arada', match: /arada/i },
  { code: 'VND-PKG-JAJANG', name: 'Vendor Dus Jajang', match: /jajang/i },
  { code: 'VND-LBL-IPEY', name: 'Vendor Label Ipey', match: /ipey/i },
];

async function main() {
  console.log('=== STARTING TRANSAKSI JYF MALL 2026 IMPORT ===');

  // 1. Manage Wallets
  console.log('--- 1. Setting up Wallets ---');
  // Clean up unused dummy wallets if 0 entries
  const unusedNames = ['Kas Utama', 'BCA Bisnis', 'BRI Bisnis'];
  for (const name of unusedNames) {
    const w = await prisma.wallet.findFirst({ where: { name } });
    if (w) {
      const counts = await prisma.walletLedger.count({ where: { walletId: w.id } });
      if (counts === 0) {
        await prisma.wallet.delete({ where: { id: w.id } });
        console.log(`Deleted empty dummy wallet: ${name}`);
      }
    }
  }

  // Ensure 4 real wallets exist
  const targetWallets = [
    { name: 'Kas Tunai', platform: null },
    { name: 'BCA 78070', platform: null },
    { name: 'BCA Petty Cash', platform: null },
    { name: 'BCA 52664', platform: null },
  ];

  const walletMap = new Map<string, { id: string; name: string }>();
  for (const tw of targetWallets) {
    let w = await prisma.wallet.findFirst({ where: { name: tw.name } });
    if (!w) {
      w = await prisma.wallet.create({
        data: {
          name: tw.name,
          isActive: true,
          isAdsBudget: false,
          linkedPlatform: tw.platform,
        },
      });
      console.log(`Created new wallet: ${w.name} (${w.id})`);
    } else {
      console.log(`Found existing wallet: ${w.name} (${w.id})`);
    }
    walletMap.set(tw.name, { id: w.id, name: w.name });
  }

  // 2. Setup Master Vendors
  console.log('\n--- 2. Setting up Master Vendors ---');
  const vendorMap = new Map<string, { id: string; name: string }>();
  for (const vd of VENDOR_DEFS) {
    let v = await prisma.vendor.findUnique({ where: { vendorCode: vd.code } });
    if (!v) {
      v = await prisma.vendor.create({
        data: {
          vendorCode: vd.code,
          namaVendor: vd.name,
          isActive: true,
          createdBy: 'import-transaksi',
        },
      });
      console.log(`Created vendor: ${v.namaVendor} (${v.vendorCode})`);
    } else {
      console.log(`Found vendor: ${v.namaVendor} (${v.vendorCode})`);
    }
    vendorMap.set(vd.code, { id: v.id, name: v.namaVendor });
  }

  // 3. Read Workbook
  console.log('\n--- 3. Reading Excel File ---');
  const filePath = path.join('DATA RAHASIA', 'Data Transaksi JYF Mall 2026.xlsx');
  const wb = XLSX.readFile(filePath);

  const sheetConfigs = [
    { name: 'Kas Tunai', debetCol: 9, kreditCol: 10, coaCol: 6, codeCol: 2, wallet: walletMap.get('Kas Tunai')! },
    { name: 'BCA Petty Cash', debetCol: 9, kreditCol: 10, coaCol: 6, codeCol: 2, wallet: walletMap.get('BCA Petty Cash')! },
    { name: 'BCA 78070', debetCol: 9, kreditCol: 10, coaCol: 6, codeCol: 2, wallet: walletMap.get('BCA 78070')! },
    { name: 'BCA 52664', debetCol: 7, kreditCol: 8, coaCol: 6, codeCol: 2, wallet: walletMap.get('BCA 52664')! },
  ];

  // Clean old imports of these transactions to allow clean re-runs
  await prisma.vendorPayment.deleteMany({ where: { createdBy: 'import-transaksi' } });
  await prisma.walletLedger.deleteMany({ where: { createdBy: 'import-transaksi' } });

  let totalLedgerInserts = 0;
  let totalVendorPayments = 0;
  let totalShodaqoh = 0;

  for (const cfg of sheetConfigs) {
    const ws = wb.Sheets[cfg.name];
    if (!ws) continue;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    console.log(`Processing sheet: ${cfg.name}`);

    for (let i = 4; i < raw.length; i++) {
      const r = raw[i];
      if (!r || r.length === 0) continue;
      const no = r[0];
      const dateSerial = r[1];
      const uraian = String(r[3] || '').trim();
      if (typeof no !== 'number' || uraian === '') continue;

      const debet = Number(r[cfg.debetCol] || 0);
      const kredit = Number(r[cfg.kreditCol] || 0);
      const rawCoa = String(r[cfg.coaCol] || r[cfg.coaCol - 1] || '').trim();
      const trxDate = serialToDate(dateSerial);

      const uUpper = uraian.toUpperCase();
      const coaUpper = rawCoa.toUpperCase();

      let trxType: WalletTrxType = 'EXPENSE';
      let category = rawCoa || 'Beban Operasional';
      let amount = 0;
      let note = uraian;

      if (debet > 0) {
        amount = Math.round(debet);
        if (uUpper.includes('SALDO AWAL')) {
          trxType = 'MODAL_MASUK';
          category = 'Saldo Awal';
          note = `Saldo Awal ${cfg.name}`;
        } else if (
          coaUpper.includes('MUTASI KAS') ||
          coaUpper.includes('PETTYCASH') ||
          uUpper.includes('TARIK SALDO') ||
          uUpper.includes('TAMBAHAN SALDO') ||
          uUpper.includes('PETTY CASH') ||
          uUpper.includes('TARIK TUNAI') ||
          uUpper.includes('CICIL SEWA KANTOR') ||
          uUpper.includes('GAJI & PRIVE')
        ) {
          trxType = 'TRANSFER';
          category = 'Mutasi Kas';
        } else {
          trxType = 'OTHER_INCOME';
          category = rawCoa || 'Pendapatan Lain-lain';
        }
      } else if (kredit > 0) {
        amount = -Math.round(kredit);
        if (uUpper.includes('VENDOR') || uUpper.includes('PEMBAYARAN JYF KE ARADA')) {
          trxType = 'VENDOR_PAYMENT';
          category = 'Bayar Vendor';

          // Find matching vendor
          const matchedVd = VENDOR_DEFS.find(vd => vd.match.test(uraian));
          if (matchedVd) {
            const v = vendorMap.get(matchedVd.code)!;
            await prisma.vendorPayment.create({
              data: {
                paymentNumber: `VP-${cfg.name.replace(/\s+/g, '')}-${no}`,
                paymentDate: trxDate,
                vendorId: v.id,
                vendorName: v.name,
                walletId: cfg.wallet.id,
                walletName: cfg.wallet.name,
                amount: Math.round(kredit),
                paymentType: VendorPaymentType.PELUNASAN,
                status: VendorPaymentStatus.COMPLETED,
                note: uraian,
                createdBy: 'import-transaksi',
              },
            });
            totalVendorPayments++;
          }
        } else if (/shodaqoh|shodaq|infaq|sedekah|zakat/i.test(uUpper) || /zakat|sumbangan/i.test(coaUpper)) {
          trxType = 'EXPENSE';
          category = 'Shodaqoh & Infaq';
          totalShodaqoh += Math.abs(amount);
        } else if (uUpper.includes('PRIVE') || coaUpper === 'PRIVE') {
          trxType = 'PRIVE';
          category = 'Prive';
        } else if (
          coaUpper.includes('MUTASI KAS') ||
          coaUpper.includes('PETTYCASH') ||
          uUpper.includes('TARIK SALDO') ||
          uUpper.includes('TAMBAHAN SALDO') ||
          uUpper.includes('PETTY CASH') ||
          uUpper.includes('TARIK TUNAI') ||
          uUpper.includes('CICIL SEWA KANTOR') ||
          uUpper.includes('GAJI & PRIVE')
        ) {
          trxType = 'TRANSFER';
          category = 'Mutasi Kas';
        } else if (uUpper.includes('REVISI') && uUpper.includes('INDRA')) {
          trxType = 'OTHER_INCOME';
          category = 'Pengembalian Dana Salah Transfer';
        } else {
          trxType = 'EXPENSE';
          category = rawCoa || 'Beban Operasional';
        }
      } else {
        continue;
      }

      await prisma.walletLedger.create({
        data: {
          walletId: cfg.wallet.id,
          trxDate,
          trxType,
          category,
          amount,
          note,
          createdBy: 'import-transaksi',
        },
      });
      totalLedgerInserts++;
    }
  }

  console.log('\n--- 4. Import Results ---');
  console.log(`Total Wallet Ledger entries inserted: ${totalLedgerInserts}`);
  console.log(`Total Vendor Payments created: ${totalVendorPayments}`);
  console.log(`Total Shodaqoh & Infaq recorded: Rp ${totalShodaqoh.toLocaleString()}`);

  // Summary of balances per wallet
  const balances = await prisma.walletLedger.groupBy({
    by: ['walletId'],
    _sum: { amount: true },
  });
  console.log('\nWallet Balances:');
  for (const b of balances) {
    const w = await prisma.wallet.findUnique({ where: { id: b.walletId } });
    console.log(` - ${w?.name}: Rp ${(b._sum.amount ?? 0).toLocaleString()}`);
  }
}

main()
  .catch(err => {
    console.error('Error running import-transaksi:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
