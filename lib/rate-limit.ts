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
