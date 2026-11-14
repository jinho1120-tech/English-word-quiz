import "server-only"

import { desc, eq, ilike, or, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db, pool } from "@/lib/db"
import { childProfiles, families, familyMembers, superAdminAuditLogs, user } from "@/lib/db/schema"

export async function requireSuperAdmin() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id || !session.user.email) throw new Error("운영자 로그인이 필요합니다.")

  const allowedEmails = (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)

  if (!allowedEmails.includes(session.user.email.trim().toLowerCase())) {
    throw new Error("슈퍼 관리자 권한이 없습니다.")
  }
  return session.user
}

export async function getSuperAdminFamilies(query = "") {
  await requireSuperAdmin()
  const trimmed = query.trim().slice(0, 120)
  const pattern = `%${trimmed}%`
  const filters = trimmed
    ? or(ilike(user.name, pattern), ilike(user.email, pattern), sql`${families.id}::text ilike ${pattern}`)
    : undefined

  return db.select({
    id: families.id,
    createdAt: families.createdAt,
    ownerUserId: families.ownerUserId,
    ownerName: user.name,
    ownerEmail: user.email,
    childCount: sql<number>`count(distinct ${childProfiles.id})::int`,
    adminCount: sql<number>`count(distinct ${familyMembers.id})::int`,
  })
    .from(families)
    .leftJoin(user, eq(user.id, families.ownerUserId))
    .leftJoin(childProfiles, eq(childProfiles.familyId, families.id))
    .leftJoin(familyMembers, eq(familyMembers.familyId, families.id))
    .where(filters)
    .groupBy(families.id, user.name, user.email)
    .orderBy(desc(families.createdAt))
    .limit(200)
}

export async function getSuperAdminFamilyDetail(familyId: string) {
  await requireSuperAdmin()
  const [family] = await db.select({
    id: families.id,
    createdAt: families.createdAt,
    ownerUserId: families.ownerUserId,
    ownerName: user.name,
    ownerEmail: user.email,
  }).from(families)
    .leftJoin(user, eq(user.id, families.ownerUserId))
    .where(eq(families.id, familyId))
    .limit(1)
  if (!family) return null

  const members = await db.select({
    userId: familyMembers.userId,
    name: user.name,
    email: user.email,
    role: familyMembers.role,
    joinedAt: familyMembers.createdAt,
  }).from(familyMembers)
    .innerJoin(user, eq(user.id, familyMembers.userId))
    .where(eq(familyMembers.familyId, familyId))
    .orderBy(desc(familyMembers.createdAt))

  const children = await db.select({
    id: childProfiles.id,
    displayName: childProfiles.displayName,
    isActive: childProfiles.isActive,
    createdAt: childProfiles.createdAt,
  }).from(childProfiles)
    .where(eq(childProfiles.familyId, familyId))
    .orderBy(desc(childProfiles.createdAt))

  const audit = await db.select({
    id: superAdminAuditLogs.id,
    actorEmail: superAdminAuditLogs.actorEmail,
    action: superAdminAuditLogs.action,
    details: superAdminAuditLogs.details,
    createdAt: superAdminAuditLogs.createdAt,
  }).from(superAdminAuditLogs)
    .where(eq(superAdminAuditLogs.targetFamilyId, familyId))
    .orderBy(desc(superAdminAuditLogs.createdAt))
    .limit(30)
  return { family, members, children, audit }
}


export async function getSuperAdminFamilyActivity(familyId: string) {
  await requireSuperAdmin()
  if (!/^[0-9a-f-]{36}$/i.test(familyId)) throw new Error("가족 정보가 올바르지 않습니다.")

  const [quizSummary, quizRecent, gameSummary, gameRecent, wordSummary, wordRecent, couponSummary, couponRecent] = await Promise.all([
    pool.query(`
      SELECT cp.id::text AS child_id, cp.display_name AS child_name,
             count(q.id)::int AS attempts,
             count(q.id) FILTER (WHERE q.is_correct)::int AS correct,
             max(q.answered_at)::text AS last_activity
      FROM child_profiles cp
      LEFT JOIN child_quiz_attempts q ON q.child_profile_id = cp.id
      WHERE cp.family_id = $1
      GROUP BY cp.id, cp.display_name
      ORDER BY cp.display_name
    `, [familyId]),
    pool.query(`
      SELECT cp.display_name AS child_name, q.subject_name, q.word_snapshot,
             q.quiz_type, q.is_correct, q.hint_used, q.answered_at::text AS occurred_at
      FROM child_quiz_attempts q
      INNER JOIN child_profiles cp ON cp.id = q.child_profile_id
      WHERE cp.family_id = $1
      ORDER BY q.answered_at DESC LIMIT 100
    `, [familyId]),
    pool.query(`
      SELECT cp.id::text AS child_id, cp.display_name AS child_name,
             count(g.id)::int AS plays,
             count(g.id) FILTER (WHERE g.game = 'pacman')::int AS vocaman_plays,
             count(g.id) FILTER (WHERE g.game = 'word_defense')::int AS word_defense_plays,
             max(g.started_at)::text AS last_activity
      FROM child_profiles cp
      LEFT JOIN child_game_plays g ON g.child_profile_id = cp.id
      WHERE cp.family_id = $1
      GROUP BY cp.id, cp.display_name
      ORDER BY cp.display_name
    `, [familyId]),
    pool.query(`
      SELECT cp.display_name AS child_name, g.game, g.started_at::text AS occurred_at
      FROM child_game_plays g
      INNER JOIN child_profiles cp ON cp.id = g.child_profile_id
      WHERE cp.family_id = $1
      ORDER BY g.started_at DESC LIMIT 100
    `, [familyId]),
    pool.query(`
      SELECT cp.id::text AS child_id, cp.display_name AS child_name,
             count(w.id)::int AS current_words,
             count(w.id) FILTER (WHERE w.created_at >= now() - interval '30 days')::int AS words_added_30d,
             max(w.created_at)::text AS last_activity
      FROM child_profiles cp
      LEFT JOIN word_entries w ON w.child_profile_id = cp.id
      WHERE cp.family_id = $1
      GROUP BY cp.id, cp.display_name
      ORDER BY cp.display_name
    `, [familyId]),
    pool.query(`
      SELECT cp.display_name AS child_name, w.word, w.meaning, w.subject,
             w.assignment_date, w.created_at::text AS occurred_at
      FROM word_entries w
      INNER JOIN child_profiles cp ON cp.id = w.child_profile_id
      WHERE cp.family_id = $1
      ORDER BY w.created_at DESC LIMIT 100
    `, [familyId]),
    pool.query(`
      SELECT cp.id::text AS child_id, cp.display_name AS child_name,
             count(r.id)::int AS stored_coupons,
             count(r.id) FILTER (WHERE r.status = 'blank')::int AS blank_coupons,
             max(r.earned_at)::text AS last_issued
      FROM child_profiles cp
      LEFT JOIN coupon_rewards r ON r.child_profile_id = cp.id
      WHERE cp.family_id = $1
      GROUP BY cp.id, cp.display_name
      ORDER BY cp.display_name
    `, [familyId]),
    pool.query(`
      SELECT cp.display_name AS child_name, r.coupon_title_snapshot AS title,
             r.status, r.earned_at::text AS occurred_at
      FROM coupon_rewards r
      INNER JOIN child_profiles cp ON cp.id = r.child_profile_id
      WHERE cp.family_id = $1
      ORDER BY r.earned_at DESC LIMIT 100
    `, [familyId]),
  ])

  let couponEventsSummary: any[] = []
  let couponEventsRecent: any[] = []
  try {
    const [summary, recent] = await Promise.all([
      pool.query(`
        SELECT child_profile_id::text AS child_id, child_name,
               count(*) FILTER (WHERE event_type = 'issued')::int AS issued_count,
               count(*) FILTER (WHERE event_type = 'redeemed')::int AS redeemed_count,
               max(occurred_at)::text AS last_activity
        FROM coupon_activity_events
        WHERE family_id = $1
        GROUP BY child_profile_id, child_name
        ORDER BY child_name
      `, [familyId]),
      pool.query(`
        SELECT child_name, coupon_title, event_type, occurred_at::text AS occurred_at
        FROM coupon_activity_events
        WHERE family_id = $1
        ORDER BY occurred_at DESC LIMIT 100
      `, [familyId]),
    ])
    couponEventsSummary = summary.rows
    couponEventsRecent = recent.rows
  } catch (error) {
    if ((error as { code?: string })?.code !== "42P01") throw error
  }

  return {
    quizzes: { summary: quizSummary.rows, recent: quizRecent.rows },
    games: { summary: gameSummary.rows, recent: gameRecent.rows },
    words: { summary: wordSummary.rows, recent: wordRecent.rows },
    coupons: {
      summary: couponSummary.rows,
      recent: couponRecent.rows,
      eventsSummary: couponEventsSummary,
      eventsRecent: couponEventsRecent,
    },
  }
}


export async function getSuperAdminAnnouncementAudience() {
  await requireSuperAdmin()
  const result = await pool.query(`
    SELECT count(*)::int AS recipients
    FROM (
      SELECT lower(u.email) AS email
      FROM families f
      INNER JOIN "user" u ON u.id = f.owner_user_id
      WHERE u.email IS NOT NULL AND btrim(u.email) <> ''
      UNION
      SELECT lower(fm.email) AS email
      FROM family_members fm
      WHERE fm.email IS NOT NULL AND btrim(fm.email) <> ''
    ) audience
  `)
  return { recipients: Number(result.rows[0]?.recipients ?? 0) }
}
