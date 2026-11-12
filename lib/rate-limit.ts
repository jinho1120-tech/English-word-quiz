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

export type RateLimitReservation = { key: string; action: string }
export type RateLimitReservationResult = {
  allowed: boolean
  count: number
  retryAfterSeconds: number
  reservation?: RateLimitReservation
}

/**
 * Reserve one attempt using a unique row per request. A transaction-scoped
 * advisory lock serializes reservations for the same IP/action window. This
 * makes refunds request-specific instead of decrementing another request's
 * counter. Successful authentication deletes only its own reservation.
 */
export async function consumeRateLimit(
  key: string,
  action: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitReservationResult> {
  const client = await pool.connect()
  const reservationAction = `${action}:${randomUUID()}`
  try {
    await client.query("BEGIN")
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [key, action])
    const result = await client.query<{ count: string; retry_after: number | null }>(
      `SELECT COUNT(*)::text AS count,
         GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
           MIN(window_started_at) + ($3 * INTERVAL '1 second') - NOW()
         ))))::int AS retry_after
       FROM rate_limits
       WHERE user_id = $1 AND action LIKE $2 AND window_started_at > NOW() - ($3 * INTERVAL '1 second')`,
      [key, `${action}:%`, windowSeconds],
    )
    const count = Number(result.rows[0]?.count ?? 0)
    const retryAfterSeconds = Number(result.rows[0]?.retry_after ?? windowSeconds)
    if (count >= limit) {
      await client.query("COMMIT")
      return { allowed: false, count, retryAfterSeconds }
    }
    await client.query(
      "INSERT INTO rate_limits (user_id, action, window_started_at, request_count) VALUES ($1, $2, NOW(), 1)",
      [key, reservationAction],
    )
    await client.query("COMMIT")
    return {
      allowed: true,
      count: count + 1,
      retryAfterSeconds,
      reservation: { key, action: reservationAction },
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

/** Release exactly the reservation created by this request. */
export async function refundRateLimit(reservation?: RateLimitReservation): Promise<void> {
  if (!reservation) return
  await pool.query(
    "DELETE FROM rate_limits WHERE user_id = $1 AND action = $2",
    [reservation.key, reservation.action],
  )
}

export async function maybePurgeChildAuthRateLimits(): Promise<void> {
  if (Math.random() >= 0.01) return
  await pool.query(
    "DELETE FROM rate_limits WHERE user_id LIKE 'ip:%' AND window_started_at < NOW() - INTERVAL '2 days'",
  )
}
