import "server-only"

import { desc, eq, ilike, or, sql } from "drizzle-orm"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { db, pool } from "@/lib/db"
import { childProfiles, families, familyMembers, user } from "@/lib/db/schema"

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

  const audit = await pool.query(
    "select id, actor_email, action, target_record_id, details, created_at from super_admin_audit_logs where target_family_id = $1 order by created_at desc limit 30",
    [familyId],
  )
  return { family, members, children, audit: audit.rows as Array<{ id: string; actor_email: string; action: string; target_record_id: string | null; details: Record<string, unknown>; created_at: Date }> }
}

export async function writeSuperAdminAudit(
  actor: { id: string; email: string },
  familyId: string,
  recordId: string,
  action: string,
  details: Record<string, unknown>,
) {
  await pool.query(
    "insert into super_admin_audit_logs (actor_user_id, actor_email, action, target_family_id, target_record_id, details) values ($1, $2, $3, $4, $5, $6::jsonb)",
    [actor.id, actor.email, action, familyId, recordId, JSON.stringify(details)],
  )
}
