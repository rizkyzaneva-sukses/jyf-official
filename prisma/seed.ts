import { PrismaClient, UserRole, MasterCategoryType } from '@prisma/client'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding essential data...')

  // ── 1. Default OWNER user ──────────────────────────────
  // Use ADMIN_PASSWORD env var, or generate a random one
  const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('hex')
  const passwordHash = await bcrypt.hash(adminPassword, 12)

  const existingAdmin = await prisma.appUser.findUnique({ where: { username: 'admin' } })
  
  if (existingAdmin) {
    console.log('   ℹ️  Admin user already exists — skipping password reset')
  } else {
    await prisma.appUser.create({
      data: {
        username: 'admin',
        passwordHash,
        userRole: UserRole.OWNER,
        fullName: 'Administrator',
        isActive: true,
      },
    })
    if (process.env.ADMIN_PASSWORD) {
      console.log('   ✅ Admin user created (password from ADMIN_PASSWORD env)')
    } else {
      console.log(`   ⚠️  Admin user created with RANDOM password: ${adminPassword}`)
      console.log('      Save this! Set ADMIN_PASSWORD env to use a fixed password.')
    }
  }

  // ── 2. Default Wallets ─────────────────────────────────
  const walletNames = [
    'Kas Utama',
    'BCA Bisnis',
    'BRI Bisnis',
    'TikTok Shop Wallet',
    'Shopee Wallet',
  ]
  for (const name of walletNames) {
    await prisma.wallet.upsert({ where: { name }, update: {}, create: { name } })
  }
  console.log(`   ✅ ${walletNames.length} wallets ensured`)

  // ── 3. Default Expense Categories ──────────────────────
  const categories = [
    { categoryType: MasterCategoryType.OTHER_INCOME, name: 'Penjualan Marketplace' },
    { categoryType: MasterCategoryType.OTHER_INCOME, name: 'Refund Platform' },
    { categoryType: MasterCategoryType.EXPENSE_BEBAN, name: 'Pembelian Stok' },
    { categoryType: MasterCategoryType.EXPENSE_BEBAN, name: 'Biaya Operasional' },
    { categoryType: MasterCategoryType.EXPENSE_BEBAN, name: 'Gaji Karyawan' },
    { categoryType: MasterCategoryType.EXPENSE_NON_BEBAN, name: 'Investasi' },
    { categoryType: MasterCategoryType.EXPENSE_NON_BEBAN, name: 'Prive' },
  ]
  for (const c of categories) {
    await prisma.masterCategory.upsert({
      where: { id: c.name }, // fallback — will catch if not found
      update: {},
      create: c,
    }).catch(async () => {
      const existing = await prisma.masterCategory.findFirst({ where: { name: c.name } })
      if (!existing) await prisma.masterCategory.create({ data: c })
    })
  }
  console.log(`   ✅ ${categories.length} expense categories ensured`)

  // ── 4. Default Product Categories ──────────────────────
  const productCats = [
    { categoryName: 'Atasan' },
    { categoryName: 'Bawahan' },
    { categoryName: 'Outwear' },
  ]
  for (const pc of productCats) {
    const existing = await prisma.productCategory.findFirst({ where: { categoryName: pc.categoryName } })
    if (!existing) {
      await prisma.productCategory.create({ data: pc })
    }
  }
  console.log(`   ✅ ${productCats.length} product categories ensured`)

  console.log('')
  console.log('🎉 Essential seed complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
