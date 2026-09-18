import { prisma } from '@/lib/prisma'
import { apiSuccess, apiError } from '@/lib/utils'
import { withAuth, withFinance } from '@/lib/api-helpers'

// GET /api/categories — any logged-in user can read
export const GET = withAuth(async (session) => {
  const categories = await prisma.productCategory.findMany({
    where: { isActive: true },
    orderBy: { categoryName: 'asc' },
  })
  return apiSuccess({ categories })
})

// POST /api/categories — only OWNER + FINANCE can create
export const POST = withFinance(async (session, request) => {
  const { categoryName, description } = await request.json()
  if (!categoryName) return apiError('Nama kategori wajib diisi')

  const cat = await prisma.productCategory.create({ data: { categoryName, description } })
  return apiSuccess(cat, 201)
})
