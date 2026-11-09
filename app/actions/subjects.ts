"use server"

import { and, asc, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { childProfiles, childSubjects, families, familyMembers } from "@/lib/db/schema"

async function requireParentFamily(childProfileId: string) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("로그인이 필요합니다.")

  // Resolve the same family for both the representative parent and invited co-parents.
  let [family] = await db.select({ id: families.id })
    .from(families)
    .where(eq(families.ownerUserId, session.user.id))
    .limit(1)

  if (!family) {
    const [membership] = await db.select({ familyId: familyMembers.familyId })
      .from(familyMembers)
      .where(eq(familyMembers.userId, session.user.id))
      .limit(1)
    if (membership) {
      [family] = await db.select({ id: families.id })
        .from(families)
        .where(eq(families.id, membership.familyId))
        .limit(1)
    }
  }

  if (!family) {
    await db.insert(families).values({ ownerUserId: session.user.id }).onConflictDoNothing()
    ;[family] = await db.select({ id: families.id })
      .from(families)
      .where(eq(families.ownerUserId, session.user.id))
      .limit(1)
  }
  if (!family) throw new Error("가족 정보를 확인할 수 없습니다.")

  const [child] = await db.select({ id: childProfiles.id })
    .from(childProfiles)
    .where(and(eq(childProfiles.id, childProfileId), eq(childProfiles.familyId, family.id), eq(childProfiles.isActive, true)))
    .limit(1)
  if (!child) throw new Error("해당 자녀를 관리할 권한이 없습니다.")
  return { familyId: family.id, childProfileId: child.id }
}

function validateSubjectName(name: string) {
  if (typeof name !== "string") throw new Error("과목 이름을 입력해 주세요.")
  const normalized = name.trim()
  if (!normalized || normalized.length > 60) throw new Error("과목 이름은 1~60자여야 합니다.")
  return normalized
}

export async function getChildSubjects(childProfileId: string) {
  const scope = await requireParentFamily(childProfileId)
  return db.select().from(childSubjects)
    .where(and(eq(childSubjects.childProfileId, scope.childProfileId), eq(childSubjects.isArchived, false)))
    .orderBy(asc(childSubjects.sortOrder), asc(childSubjects.createdAt))
}

export async function createChildSubject(childProfileId: string, name: string) {
  const scope = await requireParentFamily(childProfileId)
  const normalized = validateSubjectName(name)
  const existing = await db.select({ id: childSubjects.id })
    .from(childSubjects)
    .where(and(eq(childSubjects.childProfileId, scope.childProfileId), eq(childSubjects.name, normalized)))
    .limit(1)
  if (existing.length) throw new Error("이미 등록된 과목 이름입니다.")

  const current = await db.select({ sortOrder: childSubjects.sortOrder })
    .from(childSubjects)
    .where(eq(childSubjects.childProfileId, scope.childProfileId))
    .orderBy(asc(childSubjects.sortOrder))
  const nextOrder = current.reduce((max, item) => Math.max(max, item.sortOrder), -1) + 1

  const [created] = await db.insert(childSubjects).values({
    childProfileId: scope.childProfileId,
    name: normalized,
    sortOrder: nextOrder,
  }).returning()
  revalidatePath("/")
  return created
}

export async function renameChildSubject(childProfileId: string, subjectId: string, name: string) {
  const scope = await requireParentFamily(childProfileId)
  const normalized = validateSubjectName(name)
  const [updated] = await db.update(childSubjects)
    .set({ name: normalized, updatedAt: new Date() })
    .where(and(eq(childSubjects.id, subjectId), eq(childSubjects.childProfileId, scope.childProfileId)))
    .returning()
  if (!updated) throw new Error("과목을 찾을 수 없습니다.")
  revalidatePath("/")
  return updated
}

export async function archiveChildSubject(childProfileId: string, subjectId: string) {
  const scope = await requireParentFamily(childProfileId)
  const [updated] = await db.update(childSubjects)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(childSubjects.id, subjectId), eq(childSubjects.childProfileId, scope.childProfileId)))
    .returning()
  if (!updated) throw new Error("과목을 찾을 수 없습니다.")
  revalidatePath("/")
}

export async function deleteChildSubject(childProfileId: string, subjectId: string) {
  const scope = await requireParentFamily(childProfileId)
  const [deleted] = await db.delete(childSubjects)
    .where(and(eq(childSubjects.id, subjectId), eq(childSubjects.childProfileId, scope.childProfileId)))
    .returning({ id: childSubjects.id })
  if (!deleted) throw new Error("과목을 찾을 수 없습니다.")
  // word_entries.subject_id and child_quiz_attempts.subject_id use ON DELETE SET NULL:
  // words and immutable quiz history remain, while the deleted subject association is cleared.
  revalidatePath("/")
}

export async function reorderChildSubjects(childProfileId: string, subjectIds: string[]) {
  const scope = await requireParentFamily(childProfileId)
  if (!Array.isArray(subjectIds) || subjectIds.length > 100 || subjectIds.some((id) => typeof id !== "string")) {
    throw new Error("과목 순서 정보가 올바르지 않습니다.")
  }
  const owned = await db.select({ id: childSubjects.id }).from(childSubjects)
    .where(and(eq(childSubjects.childProfileId, scope.childProfileId), eq(childSubjects.isArchived, false)))
  const ownedIds = new Set(owned.map((item) => item.id))
  if (subjectIds.length !== ownedIds.size || new Set(subjectIds).size !== subjectIds.length || subjectIds.some((id) => !ownedIds.has(id))) {
    throw new Error("과목 목록이 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
  }
  await db.transaction(async (tx) => {
    for (const [index, id] of subjectIds.entries()) {
      await tx.update(childSubjects).set({ sortOrder: index, updatedAt: new Date() })
        .where(and(eq(childSubjects.id, id), eq(childSubjects.childProfileId, scope.childProfileId)))
    }
  })
  revalidatePath("/")
}
