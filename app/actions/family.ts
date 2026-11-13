"use server"

import { randomBytes } from "node:crypto"
import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm"
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
  childCouponSettings,
  families,
  familySettings,
  familyMembers,
  familyInvitations,
  familyArcadeSettings,
  childGamePlays,
  user,
} from "@/lib/db/schema"
import {
  createChildDeviceSession,
  hashChildAccessCode,
  issueChildAccessCode,
  hashChildPin,
  hashOpaqueToken,
  normalizeChildAccessCode,
} from "@/lib/child-auth"
import { getClientRateLimitKey } from "@/lib/client-ip"
import { consumeRateLimit, maybePurgeChildAuthRateLimits, runWithFailureRateLimit } from "@/lib/rate-limit"

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

  const [account] = await db.select({ guardianType: user.guardianType }).from(user)
    .where(eq(user.id, session.user.id)).limit(1)
  const guardianType = account?.guardianType === "parent" ? "parent" : "guardian"

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
          { familyId: family.id, title: "함께하는 놀이 시간 🎲", description: "보호자와 함께 즐거운 놀이 시간을 보내요.", couponKind: "regular", drawWeight: 15 },
          { familyId: family.id, title: "좋아하는 간식 선택권 🍎", description: "오늘 먹고 싶은 간식을 골라요.", couponKind: "regular", drawWeight: 20 },
          { familyId: family.id, title: "특별한 활동 선택권 ✨", description: "가족과 함께하고 싶은 활동을 골라요.", couponKind: "regular", drawWeight: 25 },
          { familyId: family.id, title: "칭찬 듬뿍 받기 🌟", description: "보호자에게 칭찬을 들어요.", couponKind: "regular", drawWeight: 20 },
          { familyId: family.id, title: "꽝 쿠폰: 다음 기회에! 🍀", description: "아쉬워요. 다음 도전을 응원할게요.", couponKind: "blank", drawWeight: 1 },
          { familyId: family.id, title: "꽝 쿠폰: 서로 칭찬 한마디 💬", description: "서로에게 따뜻한 칭찬을 한마디 전해요.", couponKind: "blank", drawWeight: 1 },
          { familyId: family.id, title: "꽝 쿠폰: 응원 메시지 보내기 🫶", description: "가족에게 응원 메시지를 보내요.", couponKind: "blank", drawWeight: 1 },
        ])
      }
    }
  })
  return { userId: session.user.id, family, role, email: session.user.email, guardianType }
}

export async function getFamilyDisplayTerms() {
  const { guardianType } = await requireParentFamily()
  return guardianType === "parent"
    ? { guardian: "부모", child: "자녀" }
    : { guardian: "보호자", child: "자녀" }
}

export async function getParentFamilyDashboard() {
  const { family, role, userId, guardianType } = await requireParentFamily()
  const [settings] = await db.select({
    couponsEnabled: familySettings.couponsEnabled,
    rewardMinScore: familySettings.rewardMinScore,
    rewardMinQuestions: familySettings.rewardMinQuestions,
    requireNoHint: familySettings.requireNoHint,
    blankCouponProbability: familySettings.blankCouponProbability,
  }).from(familySettings).where(eq(familySettings.familyId, family.id)).limit(1)

  const [arcadeSettings] = await db.select({
    pacmanEnabled: familyArcadeSettings.pacmanEnabled,
    pacmanDailyPlayLimit: familyArcadeSettings.pacmanDailyPlayLimit,
    pacmanMinDailyQuestions: familyArcadeSettings.pacmanMinDailyQuestions,
    pacmanRequireNoWrongWords: familyArcadeSettings.pacmanRequireNoWrongWords,
  }).from(familyArcadeSettings).where(eq(familyArcadeSettings.familyId, family.id)).limit(1)

  const children = await db.select({
    id: childProfiles.id,
    displayName: childProfiles.displayName,
    isActive: childProfiles.isActive,
    showPacman: childProfiles.showPacman,
    showWordDefense: childProfiles.showWordDefense,
    createdAt: childProfiles.createdAt,
  }).from(childProfiles)
    .where(eq(childProfiles.familyId, family.id))
    .orderBy(asc(childProfiles.createdAt))

  const couponSettings = await db.select({
    childProfileId: childCouponSettings.childProfileId,
    couponsEnabled: childCouponSettings.couponsEnabled,
    rewardMinScore: childCouponSettings.rewardMinScore,
    rewardMinQuestions: childCouponSettings.rewardMinQuestions,
    requireNoHint: childCouponSettings.requireNoHint,
    blankCouponProbability: childCouponSettings.blankCouponProbability,
    maxStoredCoupons: childCouponSettings.maxStoredCoupons,
  }).from(childCouponSettings)
    .innerJoin(childProfiles, eq(childCouponSettings.childProfileId, childProfiles.id))
    .where(eq(childProfiles.familyId, family.id))

  const coupons = await db.select({
    id: couponTypes.id,
    childProfileId: couponTypes.childProfileId,
    title: couponTypes.title,
    description: couponTypes.description,
    isActive: couponTypes.isActive,
    couponKind: couponTypes.couponKind,
    drawWeight: couponTypes.drawWeight,
  }).from(couponTypes)
    .innerJoin(childProfiles, eq(couponTypes.childProfileId, childProfiles.id))
    .where(eq(childProfiles.familyId, family.id))
    .orderBy(asc(couponTypes.createdAt))

  const rewards = await db.select({
    id: couponRewards.id,
    childProfileId: couponRewards.childProfileId,
    childName: childProfiles.displayName,
    title: couponRewards.couponTitleSnapshot,
    status: couponRewards.status,
    couponKind: couponTypes.couponKind,
    earnedAt: couponRewards.earnedAt,
    notifiedAt: couponRewards.notifiedAt,
  }).from(couponRewards)
    .innerJoin(childProfiles, eq(couponRewards.childProfileId, childProfiles.id))
    .leftJoin(couponTypes, eq(couponRewards.couponTypeId, couponTypes.id))
    .where(and(eq(childProfiles.familyId, family.id), or(eq(couponRewards.status, "earned"), eq(couponRewards.status, "blank"))))
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

  const gameUsage = await db.select({ childProfileId: childGamePlays.childProfileId, game: childGamePlays.game, total: sql<number>`count(*)::int` }).from(childGamePlays).innerJoin(childProfiles, eq(childGamePlays.childProfileId, childProfiles.id)).where(eq(childProfiles.familyId, family.id)).groupBy(childGamePlays.childProfileId, childGamePlays.game)

  const members = await db.select({ userId: familyMembers.userId, email: familyMembers.email, role: familyMembers.role, createdAt: familyMembers.createdAt })
    .from(familyMembers).where(eq(familyMembers.familyId, family.id))
  const invitations = await db.select({ id: familyInvitations.id, email: familyInvitations.email, expiresAt: familyInvitations.expiresAt, createdAt: familyInvitations.createdAt })
    .from(familyInvitations).where(and(eq(familyInvitations.familyId, family.id), isNull(familyInvitations.acceptedAt), isNull(familyInvitations.revokedAt), gt(familyInvitations.expiresAt, new Date())))
  const familyTerms = guardianType === "parent"
    ? { guardian: "부모", child: "자녀" }
    : { guardian: "보호자", child: "자녀" }
  return { familyId: family.id, settings: settings ?? null, couponSettings, arcadeSettings: arcadeSettings ?? { pacmanEnabled: false, pacmanDailyPlayLimit: 1, pacmanMinDailyQuestions: 10, pacmanRequireNoWrongWords: true }, children, gameUsage, coupons, rewards, devices, members, invitations, parentRole: role, currentUserId: userId, ownerUserId: family.ownerUserId, familyTerms }
}


export async function createChildProfile(input: { displayName: string }) {
  const { family } = await requireParentFamily()
  if (typeof input?.displayName !== "string") throw new Error("자녀 이름을 입력해 주세요.")
  const displayName = input.displayName.trim()
  if (!displayName || displayName.length > 40) throw new Error("자녀 이름은 1~40자로 입력해 주세요.")
  // Keep the legacy non-null PIN hash column populated; children no longer use a PIN.
  const internalPinHash = await hashChildPin(randomBytes(16).toString("hex"))
  const [arcadeSettings] = await db.select({ enabled: familyArcadeSettings.pacmanEnabled }).from(familyArcadeSettings).where(eq(familyArcadeSettings.familyId, family.id)).limit(1)
  const defaultGameVisibility = arcadeSettings?.enabled ?? false
  let accessCode = ""
  let child: { id: string; displayName: string } | undefined
  for (let attempt = 0; attempt < 3 && !child; attempt += 1) {
    const issued = issueChildAccessCode()
    const [inserted] = await db.insert(childProfiles).values({
      familyId: family.id,
      displayName,
      pinHash: internalPinHash,
      accessCodeHash: issued.hash,
      showPacman: defaultGameVisibility,
      showWordDefense: defaultGameVisibility,
    }).onConflictDoNothing({ target: childProfiles.accessCodeHash })
      .returning({ id: childProfiles.id, displayName: childProfiles.displayName })
    if (inserted) {
      child = inserted
      accessCode = issued.code
    }
  }
  if (!child) throw new Error("접속 코드 발급에 실패했습니다. 다시 시도해 주세요.")

  await db.insert(childSubjects).values({
    childProfileId: child.id,
    name: "단어",
    sortOrder: 0,
  })

  const [familyRewardDefaults] = await db.select().from(familySettings)
    .where(eq(familySettings.familyId, family.id)).limit(1)
  await db.insert(childCouponSettings).values({
    childProfileId: child.id,
    couponsEnabled: familyRewardDefaults?.couponsEnabled ?? false,
    rewardMinScore: familyRewardDefaults?.rewardMinScore ?? 100,
    rewardMinQuestions: familyRewardDefaults?.rewardMinQuestions ?? 10,
    requireNoHint: familyRewardDefaults?.requireNoHint ?? true,
    blankCouponProbability: familyRewardDefaults?.blankCouponProbability ?? 20,
  }).onConflictDoNothing()
  const legacyCouponDefaults = await db.select({
    title: couponTypes.title,
    description: couponTypes.description,
    couponKind: couponTypes.couponKind,
    drawWeight: couponTypes.drawWeight,
    isActive: couponTypes.isActive,
  }).from(couponTypes).where(and(eq(couponTypes.familyId, family.id), isNull(couponTypes.childProfileId)))
  if (legacyCouponDefaults.length) {
    await db.insert(couponTypes).values(legacyCouponDefaults.map((coupon) => ({
      familyId: family.id,
      childProfileId: child.id,
      ...coupon,
    })))
  }

  revalidatePath("/parent")
  return { ...child, accessCode }
}


export async function updateChildProfileName(input: { childProfileId: string; displayName: string }) {
  const { family } = await requireParentFamily()
  const childLabel = "자녀"
  if (typeof input?.childProfileId !== "string" || !input.childProfileId || typeof input.displayName !== "string") {
    throw new Error(`${childLabel} 이름 정보가 올바르지 않습니다.`)
  }

  const displayName = input.displayName.trim()
  if (!displayName || displayName.length > 40) {
    throw new Error("이름은 1~40자로 입력해 주세요.")
  }

  const [duplicate] = await db.select({ id: childProfiles.id })
    .from(childProfiles)
    .where(and(
      eq(childProfiles.familyId, family.id),
      eq(childProfiles.displayName, displayName),
      ne(childProfiles.id, input.childProfileId),
    ))
    .limit(1)
  if (duplicate) throw new Error(`이미 이 가족의 다른 ${childLabel}가 사용 중인 이름입니다.`)

  const [updated] = await db.update(childProfiles)
    .set({ displayName, updatedAt: new Date() })
    .where(and(
      eq(childProfiles.id, input.childProfileId),
      eq(childProfiles.familyId, family.id),
    ))
    .returning({ id: childProfiles.id, displayName: childProfiles.displayName })

  if (!updated) throw new Error(`수정할 ${childLabel} 프로필을 찾을 수 없습니다.`)
  revalidatePath("/parent")
  revalidatePath("/child")
  return { success: true, displayName: updated.displayName }
}

export async function regenerateChildAccessCode(childProfileId: string) {
  const { family } = await requireParentFamily()
  if (typeof childProfileId !== "string" || !childProfileId) throw new Error("자녀 정보가 올바르지 않습니다.")
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const issued = issueChildAccessCode()
    try {
      const [updated] = await db.update(childProfiles).set({
        accessCodeHash: issued.hash,
        updatedAt: new Date(),
      }).where(and(eq(childProfiles.id, childProfileId), eq(childProfiles.familyId, family.id), eq(childProfiles.isActive, true)))
        .returning({ id: childProfiles.id, displayName: childProfiles.displayName })
      if (!updated) throw new Error("활성 상태의 자녀 프로필을 찾을 수 없습니다.")
      revalidatePath("/parent")
      return { ...updated, accessCode: issued.code }
    } catch (error) {
      const cause = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } }
      const code = cause.code ?? cause.cause?.code
      const constraint = cause.constraint ?? cause.cause?.constraint
      if (code !== "23505" || (constraint && constraint !== "child_profiles_access_code_hash_unique") || attempt === 2) throw error
    }
  }
  throw new Error("접속 코드 발급에 실패했습니다. 다시 시도해 주세요.")
}

export async function setChildProfileActive(input: { childProfileId: string; isActive: boolean }) {
  const { family } = await requireParentFamily()
  if (typeof input?.childProfileId !== "string" || typeof input.isActive !== "boolean") throw new Error("자녀 상태 정보가 올바르지 않습니다.")
  let accessCode: string | null = null
  let updated: { id: string; displayName: string } | undefined
  const attempts = input.isActive ? 3 : 1
  for (let attempt = 0; attempt < attempts && !updated; attempt += 1) {
    const issued = input.isActive ? issueChildAccessCode() : null
    try {
      const [result] = await db.update(childProfiles).set({
        isActive: input.isActive,
        ...(issued ? { accessCodeHash: issued.hash } : {}),
        updatedAt: new Date(),
      }).where(and(eq(childProfiles.id, input.childProfileId), eq(childProfiles.familyId, family.id)))
        .returning({ id: childProfiles.id, displayName: childProfiles.displayName })
      updated = result
      accessCode = issued?.code ?? null
    } catch (error) {
      const cause = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } }
      const code = cause.code ?? cause.cause?.code
      const constraint = cause.constraint ?? cause.cause?.constraint
      if (code !== "23505" || (constraint && constraint !== "child_profiles_access_code_hash_unique") || attempt === attempts - 1) throw error
    }
  }
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

type ChildAuthResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" }
  | { ok: false; reason: "rate_limited"; retryAfterSeconds: number }

async function recordChildLoginFailure(): Promise<void> {
  const result = await consumeRateLimit("global", "child-login-fail:10m", Number.MAX_SAFE_INTEGER, 600)
  if (result.count === 500) {
    console.error(JSON.stringify({ event: "child_login_failure_spike", count: result.count }))
  }
  await maybePurgeChildAuthRateLimits()
}

export async function loginChildWithAccessCode(input: { accessCode?: unknown; deviceLabel?: string }): Promise<ChildAuthResult> {
  const client = await getClientRateLimitKey()
  const multiplier = client.unknown ? 10 : 1
  const result = await runWithFailureRateLimit<ChildAuthResult>(
    client.key,
    "child-login",
    10 * multiplier,
    900,
    50 * multiplier,
    86400,
    async (dbClient) => {
      if (typeof input?.accessCode !== "string" || input.accessCode.length > 64) {
        return { success: false, value: { ok: false, reason: "invalid" } as const }
      }
      const normalized = normalizeChildAccessCode(input.accessCode)
      if (!/^[A-F0-9]{10}$/.test(normalized)) {
        return { success: false, value: { ok: false, reason: "invalid" } as const }
      }

      const { current, legacy } = hashChildAccessCode(normalized)
      const candidates = process.env.ACCEPT_LEGACY_ACCESS_CODE_HASH === "false" ? [current] : [current, legacy]
      const childResult = await dbClient.query<{ id: string; is_active: boolean }>(
        "SELECT id, is_active FROM child_profiles WHERE access_code_hash = ANY($1::text[]) LIMIT 1",
        [candidates],
      )
      const child = childResult.rows[0]

      if (!child || !child.is_active) {
        return { success: false, value: { ok: false, reason: "invalid" } as const }
      }

      await createChildDeviceSession(child.id, input.deviceLabel, dbClient)
      return { success: true, value: { ok: true } as const }
    },
  )
  if (result.limited) return { ok: false, reason: "rate_limited", retryAfterSeconds: result.retryAfterSeconds }
  if (!result.value.ok) await recordChildLoginFailure()
  return result.value
}

export async function completeChildQrEnrollment(input: { token?: unknown; deviceLabel?: string }): Promise<ChildAuthResult> {
  const client = await getClientRateLimitKey()
  const multiplier = client.unknown ? 10 : 1
  const result = await runWithFailureRateLimit<ChildAuthResult>(
    client.key,
    "child-enroll",
    30 * multiplier,
    900,
    200 * multiplier,
    86400,
    async (dbClient) => {
      if (typeof input?.token !== "string" || input.token.length < 30 || input.token.length > 200) {
        return { success: false, value: { ok: false, reason: "expired" } as const }
      }
      const tokenHash = hashOpaqueToken(input.token)
      const now = new Date()
      const enrollmentResult = await dbClient.query<{ id: string; child_profile_id: string }>(
        `SELECT e.id, e.child_profile_id
         FROM child_device_enrollments e
         INNER JOIN child_profiles p ON p.id = e.child_profile_id
         WHERE e.token_hash = $1 AND e.consumed_at IS NULL
           AND e.expires_at > NOW() AND p.is_active = TRUE
         LIMIT 1`,
        [tokenHash],
      )
      const enrollment = enrollmentResult.rows[0]

      if (!enrollment) {
        return { success: false, value: { ok: false, reason: "expired" } as const }
      }

      const consumedResult = await dbClient.query<{ id: string }>(
        `UPDATE child_device_enrollments SET consumed_at = $2
         WHERE id = $1 AND consumed_at IS NULL AND expires_at > NOW()
         RETURNING id`,
        [enrollment.id, now],
      )
      const consumed = consumedResult.rows[0]

      if (!consumed) {
        return { success: false, value: { ok: false, reason: "expired" } as const }
      }

      await createChildDeviceSession(enrollment.child_profile_id, input.deviceLabel, dbClient)
      return { success: true, value: { ok: true } as const }
    },
  )
  if (result.limited) return { ok: false, reason: "rate_limited", retryAfterSeconds: result.retryAfterSeconds }
  if (!result.value.ok) await maybePurgeChildAuthRateLimits()
  return result.value
}

async function requireFamilyChild(childProfileId: string) {
  const { family } = await requireParentFamily()
  if (typeof childProfileId !== "string" || !childProfileId) throw new Error("자녀 정보가 올바르지 않습니다.")
  const [child] = await db.select({ id: childProfiles.id }).from(childProfiles)
    .where(and(eq(childProfiles.id, childProfileId), eq(childProfiles.familyId, family.id))).limit(1)
  if (!child) throw new Error("관리할 자녀 프로필을 찾을 수 없습니다.")
  await db.insert(childCouponSettings).values({ childProfileId }).onConflictDoNothing()
  return { family, child }
}

export async function updateFamilyRewardSettings(input: {
  childProfileId: string
  couponsEnabled: boolean
  rewardMinScore: number
  rewardMinQuestions: number
  requireNoHint: boolean
  blankCouponProbability: number
  maxStoredCoupons: number
}) {
  const { child } = await requireFamilyChild(input?.childProfileId)
  if (typeof input.couponsEnabled !== "boolean" || typeof input.requireNoHint !== "boolean") throw new Error("쿠폰 설정값이 올바르지 않습니다.")
  if (!Number.isInteger(input.rewardMinScore) || input.rewardMinScore < 1 || input.rewardMinScore > 100) throw new Error("보상 점수는 1~100점이어야 합니다.")
  if (!Number.isInteger(input.rewardMinQuestions) || input.rewardMinQuestions < 1 || input.rewardMinQuestions > 100) throw new Error("보상 최소 문제 수는 1~100개여야 합니다.")
  if (!Number.isInteger(input.blankCouponProbability) || input.blankCouponProbability < 0 || input.blankCouponProbability > 100) throw new Error("꽝 쿠폰 확률은 0~100%여야 합니다.")
  if (!Number.isInteger(input.maxStoredCoupons) || input.maxStoredCoupons < 1 || input.maxStoredCoupons > 100) throw new Error("쿠폰 최대 보관 개수는 1~100개여야 합니다.")
  await db.update(childCouponSettings).set({
    couponsEnabled: input.couponsEnabled,
    rewardMinScore: input.rewardMinScore,
    rewardMinQuestions: input.rewardMinQuestions,
    requireNoHint: input.requireNoHint,
    blankCouponProbability: input.blankCouponProbability,
    maxStoredCoupons: input.maxStoredCoupons,
    updatedAt: new Date(),
  }).where(eq(childCouponSettings.childProfileId, child.id))
  revalidatePath("/parent")
  return { success: true }
}

export async function createCouponType(input: { childProfileId: string; title: string; description?: string; couponKind: "regular" | "blank"; drawWeight: number }) {
  const { family, child } = await requireFamilyChild(input?.childProfileId)
  if (typeof input.title !== "string" || !["regular", "blank"].includes(input.couponKind) ||
      !Number.isInteger(input.drawWeight) || input.drawWeight < 1 || input.drawWeight > 1000) throw new Error("쿠폰 설정값이 올바르지 않습니다.")
  const title = input.title.trim()
  const description = typeof input.description === "string" ? input.description.trim() : ""
  if (!title || title.length > 80 || description.length > 1000) throw new Error("쿠폰 이름은 1~80자, 설명은 1,000자 이내로 입력해 주세요.")
  const [coupon] = await db.insert(couponTypes).values({
    familyId: family.id, childProfileId: child.id, title, description: description || null,
    couponKind: input.couponKind, drawWeight: input.drawWeight,
  }).returning({ id: couponTypes.id, title: couponTypes.title, description: couponTypes.description, isActive: couponTypes.isActive, couponKind: couponTypes.couponKind, drawWeight: couponTypes.drawWeight })
  revalidatePath("/parent")
  return coupon
}

export async function updateCouponType(input: { childProfileId: string; couponTypeId: string; title: string; description?: string; couponKind: "regular" | "blank"; drawWeight: number }) {
  const { family, child } = await requireFamilyChild(input?.childProfileId)
  if (typeof input.couponTypeId !== "string" || typeof input.title !== "string" ||
      !["regular", "blank"].includes(input.couponKind) ||
      !Number.isInteger(input.drawWeight) || input.drawWeight < 1 || input.drawWeight > 1000) throw new Error("쿠폰 설정값이 올바르지 않습니다.")
  const title = input.title.trim()
  const description = typeof input.description === "string" ? input.description.trim() : ""
  if (!title || title.length > 80 || description.length > 1000) throw new Error("쿠폰 이름은 1~80자, 설명은 1,000자 이내로 입력해 주세요.")
  const [updated] = await db.update(couponTypes).set({
    title, description: description || null, couponKind: input.couponKind, drawWeight: input.drawWeight, updatedAt: new Date(),
  }).where(and(eq(couponTypes.id, input.couponTypeId), eq(couponTypes.familyId, family.id), eq(couponTypes.childProfileId, child.id)))
    .returning({ id: couponTypes.id })
  if (!updated) throw new Error("쿠폰을 찾을 수 없습니다.")
  revalidatePath("/parent")
  return { success: true }
}

export async function deleteCouponType(input: { childProfileId: string; couponTypeId: string }) {
  const { family, child } = await requireFamilyChild(input?.childProfileId)
  if (typeof input.couponTypeId !== "string" || !input.couponTypeId) throw new Error("쿠폰 정보가 올바르지 않습니다.")
  const [deleted] = await db.delete(couponTypes)
    .where(and(eq(couponTypes.id, input.couponTypeId), eq(couponTypes.familyId, family.id), eq(couponTypes.childProfileId, child.id)))
    .returning({ id: couponTypes.id })
  if (!deleted) throw new Error("쿠폰을 찾을 수 없습니다.")
  revalidatePath("/parent")
  return { success: true }
}

export async function setCouponTypeActive(input: { childProfileId: string; couponTypeId: string; isActive: boolean }) {
  const { family, child } = await requireFamilyChild(input?.childProfileId)
  if (typeof input.couponTypeId !== "string" || typeof input.isActive !== "boolean") throw new Error("쿠폰 설정값이 올바르지 않습니다.")
  const [updated] = await db.update(couponTypes).set({ isActive: input.isActive, updatedAt: new Date() })
    .where(and(eq(couponTypes.id, input.couponTypeId), eq(couponTypes.familyId, family.id), eq(couponTypes.childProfileId, child.id)))
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
  if (role !== "owner") throw new Error("가족 대표 계정만 다른 공동관리자를 초대할 수 있습니다.")
  if (typeof emailInput !== "string") throw new Error("초대할 공동관리자의 이메일을 입력해 주세요.")
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
  if (role !== "owner") throw new Error("가족 대표 계정만 초대를 취소할 수 있습니다.")
  if (typeof invitationId !== "string" || !invitationId) throw new Error("초대 정보가 올바르지 않습니다.")
  const [revoked] = await db.update(familyInvitations).set({ revokedAt: new Date() }).where(and(eq(familyInvitations.id, invitationId), eq(familyInvitations.familyId, family.id), isNull(familyInvitations.acceptedAt), isNull(familyInvitations.revokedAt))).returning({ id: familyInvitations.id })
  if (!revoked) throw new Error("취소할 초대를 찾을 수 없습니다.")
  revalidatePath("/parent")
  return { success: true }
}

export async function removeParentAdministrator(memberUserId: string) {
  const { family, role, userId } = await requireParentFamily()
  if (role !== "owner") throw new Error("가족 대표 계정만 공동관리자를 해제할 수 있습니다.")
  if (typeof memberUserId !== "string" || !memberUserId || memberUserId === userId) throw new Error("관리자 정보가 올바르지 않습니다.")
  const [removed] = await db.delete(familyMembers).where(and(eq(familyMembers.familyId, family.id), eq(familyMembers.userId, memberUserId), eq(familyMembers.role, "admin"))).returning({ userId: familyMembers.userId })
  if (!removed) throw new Error("해제할 공동 관리자를 찾을 수 없습니다.")
  revalidatePath("/parent")
  return { success: true }
}

export async function updateFamilyPacmanSettings(input: { pacmanEnabled: boolean; pacmanDailyPlayLimit: number; pacmanUnlimitedPlays: boolean; pacmanMinDailyQuestions: number; pacmanRequireNoWrongWords: boolean }) {
  const { family } = await requireParentFamily()
  if (typeof input?.pacmanEnabled !== "boolean" || typeof input.pacmanUnlimitedPlays !== "boolean") throw new Error("게임 허용 또는 무제한 설정이 올바르지 않습니다.")
  if (!input.pacmanUnlimitedPlays && (!Number.isInteger(input.pacmanDailyPlayLimit) || input.pacmanDailyPlayLimit < 1 || input.pacmanDailyPlayLimit > 10)) {
    throw new Error("하루 게임 횟수는 1~10판으로 설정해 주세요.")
  }
  if (!Number.isInteger(input.pacmanMinDailyQuestions) || input.pacmanMinDailyQuestions < 1 || input.pacmanMinDailyQuestions > 100) throw new Error("하루 최소 문제 수는 1~100개로 설정해 주세요.")
  if (typeof input.pacmanRequireNoWrongWords !== "boolean") throw new Error("오답 정리 조건이 올바르지 않습니다.")
  const storedDailyPlayLimit = input.pacmanUnlimitedPlays ? 0 : input.pacmanDailyPlayLimit
  const updatedAt = new Date()

  await db.transaction(async (tx) => {
    await tx.insert(familyArcadeSettings).values({
      familyId: family.id,
      pacmanEnabled: input.pacmanEnabled,
      pacmanDailyPlayLimit: storedDailyPlayLimit,
      pacmanMinDailyQuestions: input.pacmanMinDailyQuestions,
      pacmanRequireNoWrongWords: input.pacmanRequireNoWrongWords,
      updatedAt,
    }).onConflictDoUpdate({
      target: familyArcadeSettings.familyId,
      set: {
        pacmanEnabled: input.pacmanEnabled,
        pacmanDailyPlayLimit: storedDailyPlayLimit,
        pacmanMinDailyQuestions: input.pacmanMinDailyQuestions,
        pacmanRequireNoWrongWords: input.pacmanRequireNoWrongWords,
        updatedAt,
      },
    })

    if (!input.pacmanEnabled) {
      await tx.update(childProfiles)
        .set({ showPacman: false, showWordDefense: false, updatedAt })
        .where(eq(childProfiles.familyId, family.id))
    }
  })

  revalidatePath("/parent")
  revalidatePath("/child")
  return { success: true }
}


export async function updateChildGameVisibility(input: { childProfileId: string; showPacman: boolean; showWordDefense: boolean }) {
 const { family } = await requireParentFamily()
 if (typeof input?.childProfileId !== "string" || typeof input.showPacman !== "boolean" || typeof input.showWordDefense !== "boolean") throw new Error("게임 노출 설정이 올바르지 않습니다.")
 const [settings] = await db.select({ enabled: familyArcadeSettings.pacmanEnabled }).from(familyArcadeSettings).where(eq(familyArcadeSettings.familyId, family.id)).limit(1)
 if (!settings?.enabled) throw new Error("게임 허용을 먼저 켜주세요.")
 const [updated] = await db.update(childProfiles).set({ showPacman: input.showPacman, showWordDefense: input.showWordDefense, updatedAt: new Date() }).where(and(eq(childProfiles.id, input.childProfileId), eq(childProfiles.familyId, family.id))).returning({ id: childProfiles.id })
 if (!updated) throw new Error("자녀 프로필을 찾을 수 없습니다.")
 revalidatePath("/parent"); revalidatePath("/child"); return { success: true }
}
