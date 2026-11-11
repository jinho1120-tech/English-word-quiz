import "server-only"

import { pool } from "@/lib/db"

export type ServiceUsageProvider = "gemini" | "azure_speech"

const GEMINI_ACTIONS = new Set([
  "ai-meaning-grading",
  "ai-word-image-scan",
  "ai-context-quiz",
  "ai-speaking-coach",
  "image-scan",
  "context-quiz",
  "speaking-coach",
  "meaning-grade",
  "script-image-extract",
  "script-translate",
])

function providerForAction(action: string): ServiceUsageProvider | null {
  if (action === "azure-speech-token") return "azure_speech"
  return GEMINI_ACTIONS.has(action) ? "gemini" : null
}

/**
 * Records one logical provider request after the existing per-user rate limiter
 * has accepted it. Limits are monthly and are enforced atomically by locking
 * the configured global/family limit rows before counting and inserting.
 *
 * Missing ops tables are deliberately fail-open until the one-time additive
 * migration has been applied; the existing hourly rate limits remain active.
 */
export async function recordServiceUsageRequest(userId: string, action: string): Promise<void> {
  const provider = providerForAction(action)
  if (!provider) return

  const client = await pool.connect()
  let inTransaction = false
  try {
    await client.query("BEGIN")
    inTransaction = true

    const familyResult = await client.query<{ id: string }>(
      `SELECT f.id::text AS id
       FROM families f
       LEFT JOIN family_members fm ON fm.family_id = f.id
       WHERE f.owner_user_id = $1 OR fm.user_id = $1
       ORDER BY CASE WHEN f.owner_user_id = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [userId],
    )
    const familyId = familyResult.rows[0]?.id ?? null

    const limits = await client.query<{
      family_id: string | null
      monthly_request_limit: number | string | null
      enabled: boolean
    }>(
      `SELECT family_id::text AS family_id, monthly_request_limit, enabled
       FROM service_usage_limits
       WHERE provider = $1 AND (family_id IS NULL OR family_id = $2)
       ORDER BY family_id NULLS FIRST
       FOR UPDATE`,
      [provider, familyId],
    )

    for (const limit of limits.rows) {
      if (!limit.enabled || limit.monthly_request_limit == null) continue
      const countResult = limit.family_id == null
        ? await client.query<{ used: number }>(
            `SELECT count(*)::int AS used
             FROM service_usage_events
             WHERE provider = $1
               AND created_at >= (date_trunc('month', timezone('Asia/Seoul', now())) AT TIME ZONE 'Asia/Seoul')`,
            [provider],
          )
        : await client.query<{ used: number }>(
            `SELECT count(*)::int AS used
             FROM service_usage_events
             WHERE provider = $1 AND family_id = $2
               AND created_at >= (date_trunc('month', timezone('Asia/Seoul', now())) AT TIME ZONE 'Asia/Seoul')`,
            [provider, limit.family_id],
          )
      const used = Number(countResult.rows[0]?.used ?? 0)
      const maximum = Number(limit.monthly_request_limit)
      if (used >= maximum) {
        const scope = limit.family_id == null ? "서비스 전체" : "가족"
        const service = provider === "gemini" ? "AI" : "음성"
        throw new Error(`${scope}의 이번 달 ${service} 사용 한도(${maximum.toLocaleString("ko-KR")}회)에 도달했습니다. 운영자에게 문의해 주세요.`)
      }
    }

    await client.query(
      `INSERT INTO service_usage_events
        (provider, family_id, actor_user_id, action, request_count, status)
       VALUES ($1, $2, $3, $4, 1, 'recorded')`,
      [provider, familyId, userId, action],
    )
    await client.query("COMMIT")
    inTransaction = false
  } catch (error) {
    if (inTransaction) {
      try { await client.query("ROLLBACK") } catch { /* preserve the original error */ }
    }
    const code = (error as { code?: string })?.code
    if (code === "42P01") {
      console.warn("[service usage] ops migration is not applied yet; existing rate limits remain active.")
      return
    }
    throw error
  } finally {
    client.release()
  }
}
