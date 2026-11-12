import "server-only"

import { pool } from "@/lib/db"
import { requireSuperAdmin } from "@/lib/super-admin"

function isMissingOperationsTables(error: unknown) {
  return (error as { code?: string })?.code === "42P01"
}

function currentKoreaMonth() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
  }).format(new Date())
}

export async function getSuperAdminOperationsOverview() {
  await requireSuperAdmin()
  const metrics = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM families) AS families,
      (SELECT count(*)::int FROM child_profiles WHERE is_active = true) AS active_children,
      (SELECT count(*)::int FROM word_entries) AS words,
      (SELECT count(*)::int FROM child_quiz_attempts WHERE answered_at >= now() - interval '30 days') AS quiz_attempts_30d,
      (SELECT count(*)::int FROM child_game_plays WHERE started_at >= now() - interval '30 days') AS game_plays_30d
  `)

  let usageReady = true
  let usage: { provider: string; requests: number }[] = []
  try {
    const result = await pool.query(
      `SELECT provider, count(*)::int AS requests
       FROM service_usage_events
       WHERE created_at >= (date_trunc('month', timezone('Asia/Seoul', now())) AT TIME ZONE 'Asia/Seoul')
       GROUP BY provider ORDER BY provider`,
    )
    usage = result.rows
  } catch (error) {
    if (!isMissingOperationsTables(error)) throw error
    usageReady = false
  }

  return {
    month: currentKoreaMonth(),
    metrics: metrics.rows[0],
    usageReady,
    usage,
  }
}

export async function getSuperAdminGameUsageReport(period: "all" | "7d" | "30d" | "month" = "all") {
  await requireSuperAdmin()
  if (!["all", "7d", "30d", "month"].includes(period)) throw new Error("조회 기간이 올바르지 않습니다.")

  const filter = `AND (
    $1 = 'all'
    OR ($1 = '7d' AND p.started_at >= now() - interval '7 days')
    OR ($1 = '30d' AND p.started_at >= now() - interval '30 days')
    OR ($1 = 'month' AND p.started_at >= (date_trunc('month', timezone('Asia/Seoul', now())) AT TIME ZONE 'Asia/Seoul'))
  )`

  const [totals, families] = await Promise.all([
    pool.query(
      `SELECT p.game, count(*)::int AS plays
       FROM child_game_plays p
       WHERE true ${filter}
       GROUP BY p.game
       ORDER BY plays DESC, p.game`,
      [period],
    ),
    pool.query(
      `SELECT f.id::text AS family_id,
              coalesce(u.name, '이름 없음') AS owner_name,
              coalesce(u.email, '') AS owner_email,
              p.game,
              count(*)::int AS plays
       FROM child_game_plays p
       INNER JOIN child_profiles c ON c.id = p.child_profile_id
       INNER JOIN families f ON f.id = c.family_id
       LEFT JOIN "user" u ON u.id = f.owner_user_id
       WHERE true ${filter}
       GROUP BY f.id, u.name, u.email, p.game
       ORDER BY plays DESC, owner_name, p.game`,
      [period],
    ),
  ])

  return { period, totals: totals.rows as { game: string; plays: number }[], families: families.rows as { family_id: string; owner_name: string; owner_email: string; game: string; plays: number }[] }
}

export async function getSuperAdminUsageReport(month: string) {
  await requireSuperAdmin()
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("조회 월 형식이 올바르지 않습니다.")

  try {
    const [providerRows, familyRows, actionRows, costRows] = await Promise.all([
      pool.query(
        `SELECT provider,
                count(*)::int AS requests,
                count(*) FILTER (WHERE status = 'recorded')::int AS recorded
         FROM service_usage_events
         WHERE created_at >= (to_date($1, 'YYYY-MM')::timestamp AT TIME ZONE 'Asia/Seoul')
           AND created_at < ((to_date($1, 'YYYY-MM') + interval '1 month')::timestamp AT TIME ZONE 'Asia/Seoul')
         GROUP BY provider ORDER BY provider`,
        [month],
      ),
      pool.query(
        `SELECT e.family_id::text AS family_id,
                coalesce(u.name, '가족 정보 없음') AS owner_name,
                coalesce(u.email, '') AS owner_email,
                e.provider,
                count(*)::int AS requests
         FROM service_usage_events e
         LEFT JOIN families f ON f.id = e.family_id
         LEFT JOIN "user" u ON u.id = f.owner_user_id
         WHERE e.created_at >= (to_date($1, 'YYYY-MM')::timestamp AT TIME ZONE 'Asia/Seoul')
           AND e.created_at < ((to_date($1, 'YYYY-MM') + interval '1 month')::timestamp AT TIME ZONE 'Asia/Seoul')
         GROUP BY e.family_id, u.name, u.email, e.provider
         ORDER BY requests DESC, owner_name
         LIMIT 100`,
        [month],
      ),
      pool.query(
        `SELECT provider, action, count(*)::int AS requests
         FROM service_usage_events
         WHERE created_at >= (to_date($1, 'YYYY-MM')::timestamp AT TIME ZONE 'Asia/Seoul')
           AND created_at < ((to_date($1, 'YYYY-MM') + interval '1 month')::timestamp AT TIME ZONE 'Asia/Seoul')
         GROUP BY provider, action ORDER BY requests DESC, provider, action`,
        [month],
      ),
      pool.query(
        `SELECT provider, amount::text AS amount, currency, note, updated_by_email,
                updated_at::text AS updated_at
         FROM provider_monthly_costs
         WHERE billing_month = to_date($1 || '-01', 'YYYY-MM-DD')
         ORDER BY provider`,
        [month],
      ),
    ])

    return {
      ready: true,
      month,
      providers: providerRows.rows,
      families: familyRows.rows,
      actions: actionRows.rows,
      costs: costRows.rows,
    }
  } catch (error) {
    if (isMissingOperationsTables(error)) {
      return { ready: false, month, providers: [], families: [], actions: [], costs: [] }
    }
    throw error
  }
}

export async function getSuperAdminUsageLimits() {
  await requireSuperAdmin()
  try {
    const [globalRows, familyRows, families] = await Promise.all([
      pool.query(
        `SELECT provider, monthly_request_limit, enabled, updated_at::text AS updated_at
         FROM service_usage_limits WHERE family_id IS NULL ORDER BY provider`,
      ),
      pool.query(
        `SELECT l.provider, l.family_id::text AS family_id, l.monthly_request_limit, l.enabled,
                l.updated_at::text AS updated_at,
                coalesce(u.name, '가족 정보 없음') AS owner_name,
                coalesce(u.email, '') AS owner_email
         FROM service_usage_limits l
         LEFT JOIN families f ON f.id = l.family_id
         LEFT JOIN "user" u ON u.id = f.owner_user_id
         WHERE l.family_id IS NOT NULL
         ORDER BY l.updated_at DESC`,
      ),
      pool.query(
        `SELECT f.id::text AS id, coalesce(u.name, '이름 없음') AS owner_name,
                coalesce(u.email, '') AS owner_email
         FROM families f LEFT JOIN "user" u ON u.id = f.owner_user_id
         ORDER BY f.created_at DESC LIMIT 500`,
      ),
    ])
    return { ready: true, globalLimits: globalRows.rows, familyLimits: familyRows.rows, families: families.rows }
  } catch (error) {
    if (isMissingOperationsTables(error)) {
      return { ready: false, globalLimits: [], familyLimits: [], families: [] }
    }
    throw error
  }
}

export async function getSuperAdminAuditReport() {
  await requireSuperAdmin()
  try {
    const result = await pool.query(
      `SELECT id::text AS id, actor_email, action, details,
              created_at::text AS created_at, target_family_id::text AS target,
              'family' AS scope
       FROM super_admin_audit_logs
       UNION ALL
       SELECT id::text AS id, actor_email, action, details,
              created_at::text AS created_at,
              concat(target_type, CASE WHEN target_id IS NOT NULL THEN ': ' || target_id ELSE '' END) AS target,
              'system' AS scope
       FROM super_admin_system_audit_logs
       ORDER BY created_at DESC LIMIT 200`,
    )
    return { ready: true, entries: result.rows }
  } catch (error) {
    if (!isMissingOperationsTables(error)) throw error
    const result = await pool.query(
      `SELECT id::text AS id, actor_email, action, details,
              created_at::text AS created_at, target_family_id::text AS target,
              'family' AS scope
       FROM super_admin_audit_logs
       ORDER BY created_at DESC LIMIT 200`,
    )
    return { ready: false, entries: result.rows }
  }
}
