import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('--- REVISING SEPTEMBER ORDERS REAL OMZET ---');
  const before = await prisma.order.aggregate({
    where: { createdBy: 'import-september' },
    _sum: { totalProductPrice: true, realOmzet: true },
    _count: { id: true },
  });
  console.log('Before update:', {
    ordersCount: before._count.id,
    totalProductPrice: before._sum.totalProductPrice,
    realOmzet: before._sum.realOmzet,
    deductedAdminFee: (before._sum.totalProductPrice ?? 0) - (before._sum.realOmzet ?? 0),
  });

  const updateResult = await prisma.$executeRawUnsafe(
    `UPDATE orders SET real_omzet = total_product_price WHERE created_by = 'import-september'`
  );
  console.log('Rows updated:', updateResult);

  const after = await prisma.order.aggregate({
    where: { createdBy: 'import-september' },
    _sum: { totalProductPrice: true, realOmzet: true },
    _count: { id: true },
  });
  console.log('After update:', {
    ordersCount: after._count.id,
    totalProductPrice: after._sum.totalProductPrice,
    realOmzet: after._sum.realOmzet,
    diff: (after._sum.totalProductPrice ?? 0) - (after._sum.realOmzet ?? 0),
  });

  // Verify status counts are untouched
  const statusSummary = await prisma.order.groupBy({
    by: ['platform', 'status'],
    where: { createdBy: 'import-september' },
    _count: { id: true },
  });
  console.table(statusSummary);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
