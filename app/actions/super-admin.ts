"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { db } from "@/lib/db"
import { childProfiles, families, familyMembers, user } from "@/lib/db/schema"
import { requireSuperAdmin, writeSuperAdminAudit } from "@/lib/super-admin"

function readText(formData: FormData, key: string, maxLength: number) {
  const value = formData.get(key)
  if (typeof value !== "string") throw new Error("입력값이 올바르지 않습니다.")
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > maxLength) throw new Error(`내용은 1~${maxLength}자로 입력해 주세요.`)
  return trimmed
}

function readFamilyId(formData: FormData) {
  const value = formData.get("familyId")
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new Error("가족 정보가 올바르지 않습니다.")
  return value
}

export async function updateSuperAdminOwnerName(formData: FormData) {
  const actor = await requireSuperAdmin()
  const familyId = readFamilyId(formData)
  const name = readText(formData, "name", 80)
  const [family] = await db.select({ ownerUserId: families.ownerUserId }).from(families).where(eq(families.id, familyId)).limit(1)
  if (!family) throw new Error("가족을 찾을 수 없습니다.")
  const [before] = await db.select({ name: user.name }).from(user).where(eq(user.id, family.ownerUserId)).limit(1)
  const [updated] = await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, family.ownerUserId)).returning({ id: user.id })
  if (!updated) throw new Error("가족 대표 계정을 찾을 수 없습니다.")
  await writeSuperAdminAudit(actor, familyId, updated.id, "owner_name_updated", { oldName: before?.name ?? null, newName: name })
  revalidatePath("/super-admin")
  redirect(`/super-admin?family=${familyId}&updated=1`)
}

export async function updateSuperAdminMemberName(formData: FormData) {
  const actor = await requireSuperAdmin()
  const familyId = readFamilyId(formData)
  const userId = readText(formData, "userId", 200)
  const name = readText(formData, "name", 80)
  const [member] = await db.select({ userId: familyMembers.userId }).from(familyMembers)
    .where(and(eq(familyMembers.familyId, familyId), eq(familyMembers.userId, userId)))
    .limit(1)
  if (!member) throw new Error("해당 가족의 공동관리자를 찾을 수 없습니다.")
  const [before] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId)).limit(1)
  const [updated] = await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, userId)).returning({ id: user.id })
  if (!updated) throw new Error("관리자 계정을 찾을 수 없습니다.")
  await writeSuperAdminAudit(actor, familyId, updated.id, "member_name_updated", { oldName: before?.name ?? null, newName: name })
  revalidatePath("/super-admin")
  redirect(`/super-admin?family=${familyId}&updated=1`)
}

export async function updateSuperAdminChildName(formData: FormData) {
  const actor = await requireSuperAdmin()
  const familyId = readFamilyId(formData)
  const childId = readText(formData, "childId", 100)
  const name = readText(formData, "name", 40)
  const [before] = await db.select({ displayName: childProfiles.displayName }).from(childProfiles)
    .where(and(eq(childProfiles.id, childId), eq(childProfiles.familyId, familyId)))
    .limit(1)
  if (!before) throw new Error("해당 가족의 아이 프로필을 찾을 수 없습니다.")
  const [updated] = await db.update(childProfiles).set({ displayName: name, updatedAt: new Date() })
    .where(and(eq(childProfiles.id, childId), eq(childProfiles.familyId, familyId)))
    .returning({ id: childProfiles.id })
  if (!updated) throw new Error("아이 프로필을 수정하지 못했습니다.")
  await writeSuperAdminAudit(actor, familyId, updated.id, "child_name_updated", { oldName: before.displayName, newName: name })
  revalidatePath("/super-admin")
  redirect(`/super-admin?family=${familyId}&updated=1`)
}
