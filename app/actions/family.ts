"use server"

import { randomBytes } from "node:crypto"
import { and, asc, desc, eq, gt, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  childDeviceEnrollments,
  childDeviceSessions,
  childProfiles,
  childSubjects,
  couponTypes,
  couponRewards,
  families,
  familySettings,
  familyMembers,
  familyInvitations,
  user,
} from "@/lib/db/schema"
import {
  createChildDeviceSession,
  generateChildAccessCode,
  hashChildPin,
  hashOpaqueToken,
  normalizeChildAccessCode,
} from "@/lib/child-auth"

async function requireParentFamily() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("부모 계정 로그인이 필요합니다.")

  let [family] = await db.select().from(families).where(eq(families.ownerUserId, session.user.id)).limit(1)
  let role: "owner" | "admin" = "owner"
  if (!family) {
    const [membership] = await db.select({ family: families, role: familyMembers.role })
      .from(familyMembers).innerJoin(families, eq(familyMembers.familyId, families.id))
      .where(eq(familyMembers.userId, session.user.id)).limit(1)
    if (membership) { family = membership.family; role = "admin" }
  }
  if (!family) {
    const [created] = await db.insert(families).values({ ownerUserId: session.user.id }).onConflictDoNothing().returning()
    family = created ?? (await db.select().from(families).where(eq(families.ownerUserId, session.user.id)).limit(1))[0]
    role = "owner"
  }
  if (!family) throw new Error("가족 공간을 찾거나 만들지 못했습니다.")
  await db.insert(familySettings).values({ familyId: family.id }).onConflictDoNothing()

  // Seed the family defaults once, using the representative parent's signup role.
  // An invited co-admin must never determine the family's default coupon wording.
  const [familyOwner] = await db.select({ name: user.name }).from(user)
    .where(eq(user.id, family.ownerUserId)).limit(1)
  const guardian = familyOwner?.name?.trim() || "보호자"
  const lastSyllable = guardian.charCodeAt(guardian.length - 1)
  const hasFinalConsonant = lastSyllable >= 0xac00 && lastSyllable <= 0xd7a3 && (lastSyllable - 0xac00) % 28 !== 0
  const guardianSubject = guardian + (hasFinalConsonant ? "이" : "가")

  // Keep the flag and inserted rows atomic so a failed seed can safely retry.
  await db.transaction(async (tx) => {
    const [seedClaim] = await tx.update(familySettings)
      .set({ couponDefaultsSeeded: true, updatedAt: new Date() })
      .where(and(eq(familySettings.familyId, family.id), eq(familySettings.couponDefaultsSeeded, false)))
      .returning({ familyId: familySettings.familyId })
    if (seedClaim) {
      const existing = await tx.select({ id: couponTypes.id }).from(couponTypes)
        .where(eq(couponTypes.familyId, family.id)).limit(1)
      if (existing.length === 0) {
        await tx.insert(couponTypes).values([
          { familyId: family.id, title: `${guardian}의 엉덩이 춤 관람권 🕺`, description: `${guardian}의 신나는 엉덩이 춤을 관람해요.`, couponKind: "regular", drawWeight: 15 },
          { familyId: family.id, title: "인간 놀이기구 탑승권 ✈️", description: `${guardianSubject} 안전하게 태워주는 인간 놀이기구를 즐겨요.`, couponKind: "regular", drawWeight: 20 },
          { familyId: family.id, title: "침대까지 어부바 특급열차 🚂", description: `${guardian} 등에 업혀 침대까지 이동해요.`, couponKind: "regular", drawWeight: 25 },
          { familyId: family.id, title: `${guardian}의 특급 안마 3분 💆‍♀️`, description: `${guardian}에게 3분 동안 안마를 받아요.`, couponKind: "regular", drawWeight: 20 },
          { familyId: family.id, title: `꽝 쿠폰: ${guardian} 볼에 뽀뽀 3번 하기 😘`, description: `꽝 쿠폰 미션: ${guardian} 볼에 뽀뽀 3번 하기`, couponKind: "blank", drawWeight: 1 },
          { familyId: family.id, title: `꽝 쿠폰: ${guardian}에게 하트 날리며 사랑해요 외치기 🫶`, description: `꽝 쿠폰 미션: ${guardian}에게 사랑한다고 표현하기`, couponKind: "blank", drawWeight: 1 },
          { familyId: family.id, title: `꽝 쿠폰: ${guardian} 어깨 1분 주물러주기 💆‍♂️`, description: `꽝 쿠폰 미션: ${guardian} 어깨 1분 주물러주기`, couponKind: "blank", drawWeight: 1 },
        ])
      }
    }
  })
  return { userId: session.user.id, family, role, email: session.user.email }
}

function validatePin(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN은 숫자 4~8자리로 입력해 주세요.")
}


export async function getParentFamilyDashboard() {
  const { family, role, userId } = await requireParentFamily()
  const [settings] = await db.select({
    couponsEnabled: familySettings.couponsEnabled,
    rewardMinScore: familySettings.rewardMinScore,
    rewardMinQuestions: familySettings.rewardMinQuestions,
    requireNoHint: familySettings.requireNoHint,
    blankCouponProbability: familySettings.blankCouponProbability,
  }).from(familySettings).where(eq(familySettings.familyId, family.id)).limit(1)

  const children = await db.select({
    id: childProfiles.id,
    displayName: childProfiles.displayName,
    isActive: childProfiles.isActive,
    createdAt: childProfiles.createdAt,
  }).from(childProfiles)
    .where(eq(childProfiles.familyId, family.id))
    .orderBy(asc(childProfiles.createdAt))

  const coupons = await db.select({
    id: couponTypes.id,
    title: couponTypes.title,
    description: couponTypes.description,
    isActive: couponTypes.isActive,
    couponKind: couponTypes.couponKind,
    drawWeight: couponTypes.drawWeight,
  }).from(couponTypes)
    .where(eq(couponTypes.familyId, family.id))
    .orderBy(asc(couponTypes.createdAt))

  const rewards = await db.select({
    id: couponRewards.id,
    childName: childProfiles.displayName,
    title: couponRewards.couponTitleSnapshot,
    status: couponRewards.status,
    earnedAt: couponRewards.earnedAt,
    notifiedAt: couponRewards.notifiedAt,
  }).from(couponRewards)
    .innerJoin(childProfiles, eq(couponRewards.childProfileId, childProfiles.id))
    .where(eq(childProfiles.familyId, family.id))
    .orderBy(desc(couponRewards.earnedAt))
    .limit(30)

  const devices = await db.select({
    id: childDeviceSessions.id,
    childProfileId: childProfiles.id,
    childName: childProfiles.displayName,
    deviceLabel: childDeviceSessions.deviceLabel,
    lastSeenAt: childDeviceSessions.lastSeenAt,
    createdAt: childDeviceSessions.createdAt,
  }).from(childDeviceSessions)
    .innerJoin(childProfiles, eq(childDeviceSessions.childProfileId, childProfiles.id))
    .where(and(eq(childProfiles.familyId, family.id), isNull(childDeviceSessions.revokedAt)))
    .orderBy(asc(childProfiles.displayName), asc(childDeviceSessions.createdAt))

  const members = await db.select({ userId: familyMembers.userId, email: familyMembers.email, role: familyMembers.role, createdAt: familyMembers.createdAt })
    .from(familyMembers).where(eq(familyMembers.familyId, family.id))
  const invitations = await db.select({ id: familyInvitations.id, email: familyInvitations.email, expiresAt: familyInvitations.expiresAt, createdAt: familyInvitations.createdAt })
    .from(familyInvitations).where(and(eq(familyInvitations.familyId, family.id), isNull(familyInvitations.acceptedAt), isNull(familyInvitations.revokedAt), gt(familyInvitations.expiresAt, new Date())))
  return { familyId: family.id, settings: settings ?? null, children, coupons, rewards, devices, members, invitations, parentRole: role, currentUserId: userId, ownerUserId: family.ownerUserId }
}


export async function createChildProfile(input: { displayName: string }) {
  const { family } = await requireParentFamily()
  if (typeof input?.displayName !== "string") throw new Error("자녀 이름을 입력해 주세요.")
  const displayName = input.displayName.trim()
  if (!displayName || displayName.length > 40) throw new Error("자녀 이름은 1~40자로 입력해 주세요.")
  // Keep the legacy non-null PIN hash column populated; children no longer use a PIN.
  const internalPinHash = await hashChildPin(randomBytes(16).toString("hex"))
  const accessCode = generateChildAccessCode()
  const [child] = await db.insert(childProfiles).values({
    familyId: family.id,
    displayName,
    pinHash: internalPinHash,
    accessCodeHash: hashOpaqueToken(normalizeChildAccessCode(accessCode)),
  }).returning({ id: childProfiles.id, displayName: childProfiles.displayName })

  await db.insert(childSubjects).values({
    childProfileId: child.id,
    name: "단어",
    sortOrder: 0,
  })

  revalidatePath("/parent")
  return { ...child, accessCode }
}

export async function resetChildCredentials(input: { childProfileId: string; pin: string }) {
  const { family } = await requireParentFamily()
  if (typeof input?.childProfileId !== "string" || typeof input.pin !== "string") throw new Error("입력값이 올바르지 않습니다.")
  validatePin(input.pin)
  const accessCode = generateChildAccessCode()
  const [updated] = await db.update(childProfiles).set({
    pinHash: await hashChildPin(input.pin),
    accessCodeHash: hashOpaqueToken(normalizeChildAccessCode(accessCode)),
    updatedAt: new Date(),
  }).where(and(
    eq(childProfiles.id, input.childProfileId),
    eq(childProfiles.familyId, family.id),
  )).returning({ id: childProfiles.id, displayName: childProfiles.displayName })

  if (!updated) throw new Error("자녀 프로필을 찾을 수 없습니다.")
  await db.update(childDeviceSessions).set({ revokedAt: new Date() })
    .where(and(eq(childDeviceSessions.childProfileId, updated.id), isNull(childDeviceSessions.revokedAt)))
  revalidatePath("/parent")
  return { ...updated, accessCode }
}


export async function regenerateChildAccessCode(childProfileId: string) {
  const { family } = await requireParentFamily()
  if (typeof childProfileId !== "string" || !childProfileId) throw new Error("자녀 정보가 올바르지 않습니다.")
  const accessCode = generateChildAccessCode()
  const [updated] = await db.update(childProfiles).set({
    accessCodeHash: hashOpaqueToken(normalizeChildAccessCode(accessCode)),
    updatedAt: new Date(),
  }).where(and(eq(childProfiles.id, childProfileId), eq(childProfiles.familyId, family.id), eq(childProfiles.isActive, true)))
    .returning({ id: childProfiles.id, displayName: childProfiles.displayName })
  if (!updated) throw new Error("활성 상태의 자녀 프로필을 찾을 수 없습니다.")
  revalidatePath("/parent")
  return { ...updated, accessCode }
}

export async function setChildProfileActive(input: { childProfileId: string; isActive: boolean }) {
  const { family } = await requireParentFamily()
  if (typeof input?.childProfileId !== "string" || typeof input.isActive !== "boolean") throw new Error("자녀 상태 정보가 올바르지 않습니다.")
  const accessCode = input.isActive ? generateChildAccessCode() : null
  const [updated] = await db.update(childProfiles).set({
    isActive: input.isActive,
    ...(accessCode ? { accessCodeHash: hashOpaqueToken(normalizeChildAccessCode(accessCode)) } : {}),
    updatedAt: new Date(),
  }).where(and(eq(childProfiles.id, input.childProfileId), eq(childProfiles.familyId, family.id)))
    .returning({ id: childProfiles.id, displayName: childProfiles.displayName })
  if (!updated) throw new Error("자녀 프로필을 찾을 수 없습니다.")
  if (!input.isActive) {
    await db.update(childDeviceSessions).set({ revokedAt: new Date() })
      .where(and(eq(childDeviceSessions.childProfileId, updated.id), isNull(childDeviceSessions.revokedAt)))
  }
  revalidatePath("/parent")
  return { success: true, accessCode, displayName: updated.displayName }
}

export async function deleteChildProfile(childProfileId: string) {
  const { family } = await requireParentFamily()
  if (typeof childProfileId !== "string" || !childProfileId) throw new Error("자녀 정보가 올바르지 않습니다.")
  const [deleted] = await db.delete(childProfiles).where(and(
    eq(childProfiles.id, childProfileId),
    eq(childProfiles.familyId, family.id),
  )).returning({ id: childProfiles.id })
  if (!deleted) throw new Error("삭제할 자녀 프로필을 찾을 수 없습니다.")
  // Related subjects, words, learning history, rewards, QR links and device sessions
  // are removed by the database's ON DELETE CASCADE constraints.
  revalidatePath("/parent")
  return { success: true }
}

export async function createChildQrEnrollment(childProfileId: string) {
  const { family } = await requireParentFamily()
  const [child] = await db.select({ id: childProfiles.id })
    .from(childProfiles)
    .where(and(eq(childProfiles.id, childProfileId), eq(childProfiles.familyId, family.id), eq(childProfiles.isActive, true)))
    .limit(1)
  if (!child) throw new Error("자녀 프로필을 찾을 수 없습니다.")

  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
  await db.insert(childDeviceEnrollments).values({
    childProfileId,
    tokenHash: hashOpaqueToken(token),
    expiresAt,
  })

  const baseUrl = process.env.BETTER_AUTH_URL
  if (!baseUrl) throw new Error("서비스 기본 주소(BETTER_AUTH_URL)가 설정되지 않았습니다.")
  return { url: `${baseUrl.replace(/\/$/, "")}/child/enroll?token=${encodeURIComponent(token)}`, expiresAt }
}

export async function loginChildWithAccessCode(input: { accessCode: string; deviceLabel?: string }) {
  if (typeof input?.accessCode !== "string") throw new Error("접속 코드를 입력해 주세요.")
  const normalized = normalizeChildAccessCode(input.accessCode)
  if (!/^[A-F0-9]{10}$/.test(normalized)) throw new Error("접속 코드 형식을 확인해 주세요.")

  const [child] = await db.select({
    id: childProfiles.id,
    isActive: childProfiles.isActive,
  }).from(childProfiles)
    .where(eq(childProfiles.accessCodeHash, hashOpaqueToken(normalized)))
    .limit(1)

  if (!child || !child.isActive) {
    throw new Error("접속 코드가 올바르지 않거나 만료되었습니다.")
  }

  await createChildDeviceSession(child.id, input.deviceLabel)
  return { success: true }
}

export async function completeChildQrEnrollment(input: { token: string; deviceLabel?: string }) {
  if (typeof input?.token !== "string" || input.token.length < 30 || input.token.length > 200) {
    throw new Error("QR 등록 링크가 올바르지 않습니다.")
  }
  const tokenHash = hashOpaqueToken(input.token)
  const now = new Date()
  const [enrollment] = await db.select({
    id: childDeviceEnrollments.id,
    childProfileId: childDeviceEnrollments.childProfileId,
  }).from(childDeviceEnrollments)
    .innerJoin(childProfiles, eq(childDeviceEnrollments.childProfileId, childProfiles.id))
    .where(and(
      eq(childDeviceEnrollments.tokenHash, tokenHash),
      isNull(childDeviceEnrollments.consumedAt),
      gt(childDeviceEnrollments.expiresAt, now),
      eq(childProfiles.isActive, true),
    ))
    .limit(1)

  if (!enrollment) throw new Error("QR 등록 시간이 만료되었거나 이미 사용되었습니다.")

  const [consumed] = await db.update(childDeviceEnrollments)
    .set({ consumedAt: now })
    .where(and(
      eq(childDeviceEnrollments.id, enrollment.id),
      isNull(childDeviceEnrollments.consumedAt),
      gt(childDeviceEnrollments.expiresAt, now),
    ))
    .returning({ id: childDeviceEnrollments.id })

  if (!consumed) throw new Error("이미 사용된 QR 등록 링크입니다.")

  await createChildDeviceSession(enrollment.childProfileId, input.deviceLabel)
  return { success: true }
}

export async function updateFamilyRewardSettings(input: {
  couponsEnabled: boolean
  rewardMinScore: number
  rewardMinQuestions: number
  requireNoHint: boolean
  blankCouponProbability: number
}) {
  const { family } = await requireParentFamily()
  if (typeof input?.couponsEnabled !== "boolean" || typeof input.requireNoHint !== "boolean") throw new Error("쿠폰 설정값이 올바르지 않습니다.")
  if (!Number.isInteger(input.rewardMinScore) || input.rewardMinScore < 1 || input.rewardMinScore > 100) throw new Error("보상 점수는 1~100점이어야 합니다.")
  if (!Number.isInteger(input.rewardMinQuestions) || input.rewardMinQuestions < 1 || input.rewardMinQuestions > 100) throw new Error("보상 최소 문제 수는 1~100개여야 합니다.")
  if (!Number.isInteger(input.blankCouponProbability) || input.blankCouponProbability < 0 || input.blankCouponProbability > 100) throw new Error("꽝 쿠폰 확률은 0~100%여야 합니다.")

  await db.update(familySettings).set({
    couponsEnabled: input.couponsEnabled,
    rewardMinScore: input.rewardMinScore,
    rewardMinQuestions: input.rewardMinQuestions,
    requireNoHint: input.requireNoHint,
    blankCouponProbability: input.blankCouponProbability,
    updatedAt: new Date(),
  }).where(eq(familySettings.familyId, family.id))
  revalidatePath("/parent")
  return { success: true }
}

export async function createCouponType(input: { title: string; description?: string; couponKind: "regular" | "blank"; drawWeight: number }) {
  const { family } = await requireParentFamily()
  if (typeof input?.title !== "string" || !["regular", "blank"].includes(input.couponKind) ||
      !Number.isInteger(input.drawWeight) || input.drawWeight < 1 || input.drawWeight > 1000) throw new Error("쿠폰 설정값이 올바르지 않습니다.")
  const title = input.title.trim()
  const description = typeof input.description === "string" ? input.description.trim() : ""
  if (!title || title.length > 80 || description.length > 1000) throw new Error("쿠폰 이름은 1~80자, 설명은 1,000자 이내로 입력해 주세요.")
  const [coupon] = await db.insert(couponTypes).values({
    familyId: family.id, title, description: description || null,
    couponKind: input.couponKind, drawWeight: input.drawWeight,
  }).returning({ id: couponTypes.id, title: couponTypes.title, description: couponTypes.description, isActive: couponTypes.isActive, couponKind: couponTypes.couponKind, drawWeight: couponTypes.drawWeight })
  revalidatePath("/parent")
  return coupon
}

export async function updateCouponType(input: { couponTypeId: string; title: string; description?: string; couponKind: "regular" | "blank"; drawWeight: number }) {
  const { family } = await requireParentFamily()
  if (typeof input?.couponTypeId !== "string" || typeof input.title !== "string" ||
      !["regular", "blank"].includes(input.couponKind) ||
      !Number.isInteger(input.drawWeight) || input.drawWeight < 1 || input.drawWeight > 1000) throw new Error("쿠폰 설정값이 올바르지 않습니다.")
  const title = input.title.trim()
  const description = typeof input.description === "string" ? input.description.trim() : ""
  if (!title || title.length > 80 || description.length > 1000) throw new Error("쿠폰 이름은 1~80자, 설명은 1,000자 이내로 입력해 주세요.")
  const [updated] = await db.update(couponTypes).set({
    title, description: description || null, couponKind: input.couponKind, drawWeight: input.drawWeight, updatedAt: new Date(),
  }).where(and(eq(couponTypes.id, input.couponTypeId), eq(couponTypes.familyId, family.id)))
    .returning({ id: couponTypes.id })
  if (!updated) throw new Error("쿠폰을 찾을 수 없습니다.")
  revalidatePath("/parent")
  return { success: true }
}

export async function deleteCouponType(couponTypeId: string) {
  const { family } = await requireParentFamily()
  if (typeof couponTypeId !== "string" || !couponTypeId) throw new Error("쿠폰 정보가 올바르지 않습니다.")
  const [deleted] = await db.delete(couponTypes)
    .where(and(eq(couponTypes.id, couponTypeId), eq(couponTypes.familyId, family.id)))
    .returning({ id: couponTypes.id })
  if (!deleted) throw new Error("쿠폰을 찾을 수 없습니다.")
  revalidatePath("/parent")
  return { success: true }
}

export async function setCouponTypeActive(input: { couponTypeId: string; isActive: boolean }) {
  const { family } = await requireParentFamily()
  if (typeof input?.couponTypeId !== "string" || typeof input.isActive !== "boolean") throw new Error("쿠폰 설정값이 올바르지 않습니다.")
  const [updated] = await db.update(couponTypes).set({ isActive: input.isActive, updatedAt: new Date() })
    .where(and(eq(couponTypes.id, input.couponTypeId), eq(couponTypes.familyId, family.id)))
    .returning({ id: couponTypes.id })
  if (!updated) throw new Error("쿠폰을 찾을 수 없습니다.")
  revalidatePath("/parent")
  return { success: true }
}

export async function logoutChildDevice() {
  const { revokeCurrentChildDeviceSession } = await import("@/lib/child-auth")
  await revokeCurrentChildDeviceSession()
}

export async function revokeChildDeviceSession(sessionId: string) {
  const { family } = await requireParentFamily()
  if (typeof sessionId !== "string" || !sessionId) throw new Error("기기 세션 정보가 올바르지 않습니다.")
  const [owned] = await db.select({ id: childDeviceSessions.id })
    .from(childDeviceSessions)
    .innerJoin(childProfiles, eq(childDeviceSessions.childProfileId, childProfiles.id))
    .where(and(
      eq(childDeviceSessions.id, sessionId),
      eq(childProfiles.familyId, family.id),
      isNull(childDeviceSessions.revokedAt),
    ))
    .limit(1)
  if (!owned) throw new Error("해당 기기를 관리할 권한이 없습니다.")
  await db.update(childDeviceSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(childDeviceSessions.id, sessionId), isNull(childDeviceSessions.revokedAt)))
  revalidatePath("/parent")
  return { success: true }
}

function normalizeEmail(email: string): string { return email.trim().toLowerCase() }

/** Only the family representative can invite or remove co-parent administrators. */
export async function createParentInvitation(emailInput: string) {
  const { family, userId, role, email: currentEmail } = await requireParentFamily()
  if (role !== "owner") throw new Error("가족 대표 부모만 다른 관리자를 초대할 수 있습니다.")
  if (typeof emailInput !== "string") throw new Error("초대할 부모의 이메일을 입력해 주세요.")
  const email = normalizeEmail(emailInput)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) throw new Error("이메일 주소를 확인해 주세요.")
  if (email === normalizeEmail(currentEmail || "")) throw new Error("본인 이메일은 초대할 수 없습니다.")
  const [existingMember] = await db.select({ id: familyMembers.id }).from(familyMembers).where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.email, email))).limit(1)
  if (existingMember) throw new Error("이미 가족 공동 관리자로 등록된 이메일입니다.")
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  await db.update(familyInvitations).set({ revokedAt: new Date() }).where(and(eq(familyInvitations.familyId, family.id), eq(familyInvitations.email, email), isNull(familyInvitations.acceptedAt), isNull(familyInvitations.revokedAt)))
  await db.insert(familyInvitations).values({ familyId: family.id, email, tokenHash: hashOpaqueToken(token), invitedByUserId: userId, expiresAt })
  const baseUrl = process.env.BETTER_AUTH_URL
  if (!baseUrl) throw new Error("서비스 기본 주소(BETTER_AUTH_URL)가 설정되지 않았습니다.")
  revalidatePath("/parent")
  return { email, inviteUrl: baseUrl.replace(/\/$/, "") + "/parent/invite/accept?token=" + encodeURIComponent(token), expiresAt }
}

export async function revokeParentInvitation(invitationId: string) {
  const { family, role } = await requireParentFamily()
  if (role !== "owner") throw new Error("가족 대표 부모만 초대를 취소할 수 있습니다.")
  if (typeof invitationId !== "string" || !invitationId) throw new Error("초대 정보가 올바르지 않습니다.")
  const [revoked] = await db.update(familyInvitations).set({ revokedAt: new Date() }).where(and(eq(familyInvitations.id, invitationId), eq(familyInvitations.familyId, family.id), isNull(familyInvitations.acceptedAt), isNull(familyInvitations.revokedAt))).returning({ id: familyInvitations.id })
  if (!revoked) throw new Error("취소할 초대를 찾을 수 없습니다.")
  revalidatePath("/parent")
  return { success: true }
}

export async function removeParentAdministrator(memberUserId: string) {
  const { family, role, userId } = await requireParentFamily()
  if (role !== "owner") throw new Error("가족 대표 부모만 공동 관리자를 해제할 수 있습니다.")
  if (typeof memberUserId !== "string" || !memberUserId || memberUserId === userId) throw new Error("관리자 정보가 올바르지 않습니다.")
  const [removed] = await db.delete(familyMembers).where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.userId, memberUserId), eq(familyMembers.role, "admin"))).returning({ userId: familyMembers.userId })
  if (!removed) throw new Error("해제할 공동 관리자를 찾을 수 없습니다.")
  revalidatePath("/parent")
  return { success: true }
}