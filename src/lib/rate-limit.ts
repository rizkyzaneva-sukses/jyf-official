/**
 * Simple in-memory rate limiter untuk API routes.
 * 
 * Production: pertimbangkan pakai Redis-backed rate limiter
 * (misal @upstash/ratelimit) untuk multi-instance deployment.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Cleanup expired entries setiap 5 menit
setInterval(() => {
  const now = Date.now()
  for (const key of Array.from(store.keys())) {
    const entry = store.get(key)!
    if (now > entry.resetAt) store.delete(key)
  }
}, 5 * 60 * 1000)

interface RateLimitOptions {
  /** Maks request dalam window */
  maxRequests: number
  /** Window duration dalam detik */
  windowSeconds: number
}

/**
 * Check rate limit untuk key tertentu.
 * 
 * @returns `{ allowed: true }` atau `{ allowed: false, retryAfterSeconds }`
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const now = Date.now()
  const windowMs = options.windowSeconds * 1000

  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  if (entry.count >= options.maxRequests) {
    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000)
    return { allowed: false, retryAfterSeconds }
  }

  entry.count++
  return { allowed: true }
}

/**
 * Get client identifier dari request.
 * Pakai X-Forwarded-For (proxy) atau fallback ke 'unknown'.
 */
export function getClientId(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  
  // Telegram webhook: pakai bot token hash sebagai key
  const botToken = request.headers.get('x-telegram-bot-token')
  if (botToken) return `telegram:${botToken.slice(-8)}`
  
  return 'unknown'
}

/**
 * Predefined rate limit configs untuk common use cases.
 */
export const RATE_LIMITS = {
  /** Login: 5 attempts per menit per IP */
  LOGIN: { maxRequests: 5, windowSeconds: 60 },
  /** Telegram webhook: 30 messages per menit */
  TELEGRAM: { maxRequests: 30, windowSeconds: 60 },
  /** General API: 100 requests per menit */
  GENERAL: { maxRequests: 100, windowSeconds: 60 },
} as const
