/**
 * withAuth — API route wrapper yang menghandle auth check + error handling.
 *
 * Usage:
 *   export const GET = withAuth(async (session, request) => {
 *     // session.isLoggedIn = true, session.userRole valid
 *     const data = await prisma.order.findMany(...)
 *     return apiSuccess(data)
 *   }, ['OWNER', 'FINANCE'])
 *
 * Roles:
 *   - withAuth(handler)                    → any logged-in user
 *   - withAuth(handler, ['OWNER'])         → OWNER only
 *   - withAuth(handler, ['OWNER','FINANCE']) → OWNER + FINANCE
 *   - withAuth(handler, ['OWNER','FINANCE','STAFF']) → all roles
 */

import { NextRequest } from 'next/server'
import { getSession, SessionData } from '@/lib/session'
import { apiError } from '@/lib/utils'

type Role = SessionData['userRole']

type AuthenticatedHandler = (
  session: SessionData,
  request: NextRequest,
  context?: Record<string, unknown>
) => Promise<Response>

/**
 * Wrap API handler dengan automatic auth + role check + try/catch.
 */
export function withAuth(
  handler: AuthenticatedHandler,
  allowedRoles?: Role[]
) {
  return async (request: NextRequest, context?: any) => {
    try {
      const session = await getSession()

      // Not logged in
      if (!session.isLoggedIn) {
        return apiError('Unauthorized', 401)
      }

      // Role check (if specified)
      if (allowedRoles && allowedRoles.length > 0) {
        if (!allowedRoles.includes(session.userRole)) {
          return apiError('Forbidden', 403)
        }
      }

      return await handler(session, request, context)
    } catch (err) {
      console.error(`[API Error] ${request.method} ${request.nextUrl.pathname}:`, err)
      const message = err instanceof Error ? err.message : 'Internal server error'
      return apiError(`Server error: ${message}`, 500)
    }
  }
}

/**
 * Shorthand wrappers untuk common role combinations.
 */
export const withOwnerOnly = (handler: AuthenticatedHandler) =>
  withAuth(handler, ['OWNER'])

export const withFinance = (handler: AuthenticatedHandler) =>
  withAuth(handler, ['OWNER', 'FINANCE'])

export const withStaff = (handler: AuthenticatedHandler) =>
  withAuth(handler, ['OWNER', 'FINANCE', 'STAFF'])
