import { randomUUID } from "node:crypto"
import { pool } from "@/lib/db"
import { recordServiceUsageRequest } from "@/lib/service-usage"

/**
 * Atomic, database-backed per-user fixed-window limiter.
 * One row per user/action keeps storage bounded; concurrent requests are serialized
 * by PostgreSQL's unique-key conflict handling.
 */
export async function consumeUserRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  const result = await pool.query<{ request_count: number }>(
    `INSERT INTO rate_limits (user_id, action, window_started_at, request_count)
     VALUES ($1, $2, NOW(), 1)
     ON CONFLICT (user_id, action) DO UPDATE SET
       window_started_at = CASE
         WHEN rate_limits.window_started_at <= NOW() - ($3 * INTERVAL '1 second')
         THEN NOW() ELSE rate_limits.window_started_at END,
       request_count = CASE
         WHEN rate_limits.window_started_at <= NOW() - ($3 * INTERVAL '1 second')
         THEN 1 ELSE rate_limits.request_count + 1 END
     RETURNING request_count`,
    [userId, action, windowSeconds],
  )

  const allowed = Number(result.rows[0]?.request_count ?? limit + 1) <= limit
  if (allowed) await recordServiceUsageRequest(userId, action)
  return allowed
}

export async function maybePurgeChildAuthRateLimits(): Promise<void> {
  if (Math.random() >= 0.01) return
  await pool.query(
    "DELETE FROM rate_limits WHERE (user_id LIKE 'ip:%' OR user_id = 'global') AND window_started_at < NOW() - INTERVAL '2 days'",
  )
}


export type FailureRateLimitResult<T> =
  | { limited: true; retryAfterSeconds: number }
  | { limited: false; value: T }

/**
 * Serialize the complete authentication attempt per IP/action. Only failed
 * attempts are written to rate_limits; successful requests never consume a
 * slot. The transaction-scoped advisory lock stays held while the callback
 * checks credentials and creates the device session, so concurrent successes
 * cannot temporarily exhaust the failure budget.
 *
 * The callback may use the shared Drizzle pool; the pool must retain at least
 * two connections (the default pg Pool configuration does).
 */
export async function runWithFailureRateLimit<T>(
  key: string,
  action: string,
  shortLimit: number,
  shortWindowSeconds: number,
  dailyLimit: number,
  dailyWindowSeconds: number,
  operation: () => Promise<{ success: boolean; value: T }>,
): Promise<FailureRateLimitResult<T>> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [key, action])

    const short = await client.query<{ count: number; retry_after: number | null }>(
      `SELECT COUNT(*)::int AS count,
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
           MIN(window_started_at) + ($3 * INTERVAL '1 second') - NOW()
         ))))::int AS retry_after
       FROM rate_limits
       WHERE user_id = $1 AND action LIKE $2 AND window_started_at > NOW() - ($3 * INTERVAL '1 second')`,
      [key, `${action}:15m:%`, shortWindowSeconds],
    )
    const shortCount = Number(short.rows[0]?.count ?? 0)
    const shortRetry = Number(short.rows[0]?.retry_after ?? shortWindowSeconds)
    if (shortCount >= shortLimit) {
      await client.query("COMMIT")
      return { limited: true, retryAfterSeconds: shortRetry }
    }

    const daily = await client.query<{ count: number; retry_after: number | null }>(
      `SELECT COUNT(*)::int AS count,
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
           MIN(window_started_at) + ($3 * INTERVAL '1 second') - NOW()
         ))))::int AS retry_after
       FROM rate_limits
       WHERE user_id = $1 AND action LIKE $2 AND window_started_at > NOW() - ($3 * INTERVAL '1 second')`,
      [key, `${action}:1d:%`, dailyWindowSeconds],
    )
    const dailyCount = Number(daily.rows[0]?.count ?? 0)
    const dailyRetry = Number(daily.rows[0]?.retry_after ?? dailyWindowSeconds)
    if (dailyCount >= dailyLimit) {
      await client.query("COMMIT")
      return { limited: true, retryAfterSeconds: dailyRetry }
    }

    const outcome = await operation()
    if (!outcome.success) {
      const requestId = randomUUID()
      await client.query(
        `INSERT INTO rate_limits (user_id, action, window_started_at, request_count)
         VALUES ($1, $2, NOW(), 1), ($1, $3, NOW(), 1)`,
        [key, `${action}:15m:${requestId}`, `${action}:1d:${requestId}`],
      )
    }
    await client.query("COMMIT")
    return { limited: false, value: outcome.value }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
