import { prisma } from '@/lib/prisma'

/**
 * GET /api/health
 * 
 * Health check endpoint untuk monitoring & uptime checks.
 * Returns:
 * - status: "healthy" | "degraded" | "unhealthy"
 * - database: connectivity check
 * - uptime: process uptime in seconds
 * - timestamp: ISO timestamp
 */
export async function GET() {
  const startTime = Date.now()
  const timestamp = new Date().toISOString()
  const uptimeSeconds = Math.floor(process.uptime())

  // Test database connectivity
  let dbStatus: 'connected' | 'error' = 'connected'
  let dbLatencyMs = 0
  try {
    const dbStart = Date.now()
    await prisma.$queryRaw`SELECT 1`
    dbLatencyMs = Date.now() - dbStart
  } catch {
    dbStatus = 'error'
  }

  const overallStatus = dbStatus === 'connected' ? 'healthy' : 'unhealthy'

  return Response.json(
    {
      status: overallStatus,
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      uptime: uptimeSeconds,
      timestamp,
      version: process.env.npm_package_version || '0.1.0',
    },
    {
      status: overallStatus === 'healthy' ? 200 : 503,
    }
  )
}
