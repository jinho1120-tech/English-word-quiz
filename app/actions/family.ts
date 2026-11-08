"use server"

import { randomBytes } from "node:crypto"
import { and, asc, eq, gt, isNull } from "drizzle-orm"
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
  families,
  familySettings,
} from "@/lib/db/schema"
import {
  createChildDeviceSession,
  generateChildAccessCode,
  hashChildPin,
  hashOpaqueToken,
  normalizeChildAccessCode,
  verifyChildPin,
} from "@/lib/child-auth"

async function requireParentFamily() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("부모 계정 로그인이 필요합니다.")

  let [family] = await db.select().from(families)
    .where(eq(families.ownerUserId, session.user.id))
    .limit(1)

  if (!family) {
    const [created] = await db.insert(families)
      .values({ ownerUserId: session.user.id })
      .onConflictDoNothing()
      .returning()
    family = created ?? (await db.select().from(families)
      .where(eq(families.ownerUserId, session.user.id)).limit(1))[0]
  }

  if (!family) throw new Error("가족 공간을 만들지 못했습니다.")

  await db.insert(familySettings)
    .values({ familyId: family.id })
    .onConflictDoNothing()

  return { userId: session.user.id, family }
}

function validatePin(pin: string) {
  if (!/^\d{4,8}$/.test(pin)) throw new Error("PIN은 숫자 4~8자리로 입력해 주세요.")
}

function validatePhone(phone: string | null) {
  if (phone !== null && phone.trim() && !/^\+?[0-9 ()-]{8,25}$/.test(phone.trim())) {
    throw new Error("전화번호 형식을 확인해 주세요.")
  }
}

export async function getParentFamilyDashboard() {
  const { family } = await requireParentFamily()
  const [settings] = await db.select({
    couponsEnabled: familySettings.couponsEnabled,
    parentPhone: familySettings.parentPhone,
    rewardMinScore: familySettings.rewardMinScore,
    rewardMinQuestions: familySettings.rewardMinQuestions,
    requireNoHint: familySettings.requireNoHint,
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
  }).from(couponTypes)
    .where(eq(couponTypes.familyId, family.id))
    .orderBy(asc(couponTypes.createdAt))

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

  return { familyId: family.id, settings: settings ?? null, children, coupons, devices }
}

export async function createChildProfile(input: { displayName: string; pin: string }) {
  const { family } = await requireParentFamily()
  if (typeof input?.displayName !== "string") throw new Error("자녀 이름을 입력해 주세요.")
  const displayName = input.displayName.trim()
  if (!displayName || displayName.length > 40) throw new Error("자녀 이름은 1~40자로 입력해 주세요.")
  if (typeof input.pin !== "string") throw new Error("PIN을 입력해 주세요.")
  validatePin(input.pin)

  const accessCode = generateChildAccessCode()
  const [child] = await db.insert(childProfiles).values({
    familyId: family.id,
    displayName,
    pinHash: await hashChildPin(input.pin),
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

export async function loginChildWithAccessCode(input: { accessCode: string; pin: string; deviceLabel?: string }) {
  if (typeof input?.accessCode !== "string" || typeof input.pin !== "string") throw new Error("접속 코드와 PIN을 입력해 주세요.")
  validatePin(input.pin)
  const normalized = normalizeChildAccessCode(input.accessCode)
  if (!/^[A-F0-9]{10}$/.test(normalized)) throw new Error("접속 코드 형식을 확인해 주세요.")

  const [child] = await db.select({
    id: childProfiles.id,
    pinHash: childProfiles.pinHash,
    isActive: childProfiles.isActive,
  }).from(childProfiles)
    .where(eq(childProfiles.accessCodeHash, hashOpaqueToken(normalized)))
    .limit(1)

  if (!child || !child.isActive || !(await verifyChildPin(input.pin, child.pinHash))) {
    throw new Error("접속 코드 또는 PIN이 올바르지 않습니다.")
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
  parentPhone: string
  rewardMinScore: number
  rewardMinQuestions: number
  requireNoHint: boolean
}) {
  const { family } = await requireParentFamily()
  if (typeof input?.couponsEnabled !== "boolean" || typeof input.requireNoHint !== "boolean") throw new Error("쿠폰 설정값이 올바르지 않습니다.")
  if (typeof input.parentPhone !== "string") throw new Error("전화번호를 입력해 주세요.")
  const parentPhone = input.parentPhone.trim()
  validatePhone(parentPhone || null)
  if (!Number.isInteger(input.rewardMinScore) || input.rewardMinScore < 1 || input.rewardMinScore > 100) throw new Error("보상 점수는 1~100점이어야 합니다.")
  if (!Number.isInteger(input.rewardMinQuestions) || input.rewardMinQuestions < 1 || input.rewardMinQuestions > 100) throw new Error("보상 최소 문제 수는 1~100개여야 합니다.")

  await db.update(familySettings).set({
    couponsEnabled: input.couponsEnabled,
    parentPhone: parentPhone || null,
    rewardMinScore: input.rewardMinScore,
    rewardMinQuestions: input.rewardMinQuestions,
    requireNoHint: input.requireNoHint,
    updatedAt: new Date(),
  }).where(eq(familySettings.familyId, family.id))
  revalidatePath("/parent")
  return { success: true }
}

export async function createCouponType(input: { title: string; description?: string }) {
  const { family } = await requireParentFamily()
  if (typeof input?.title !== "string") throw new Error("쿠폰 이름을 입력해 주세요.")
  const title = input.title.trim()
  const description = typeof input.description === "string" ? input.description.trim() : ""
  if (!title || title.length > 80 || description.length > 1000) throw new Error("쿠폰 이름은 1~80자, 설명은 1,000자 이내로 입력해 주세요.")
  const [coupon] = await db.insert(couponTypes).values({
    familyId: family.id,
    title,
    description: description || null,
  }).returning({ id: couponTypes.id, title: couponTypes.title, description: couponTypes.description, isActive: couponTypes.isActive })
  revalidatePath("/parent")
  return coupon
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
