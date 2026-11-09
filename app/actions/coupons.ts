"use server"

import { randomBytes } from "node:crypto"
import { and, desc, eq, gt, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { childProfiles, couponRedemptionTokens, couponRewards, families, familyMembers } from "@/lib/db/schema"
import { getChildDeviceSession, hashOpaqueToken } from "@/lib/child-auth"

async function requireParentFamily() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) throw new Error("부모 계정 로그인이 필요합니다.")
  let [family] = await db.select().from(families).where(eq(families.ownerUserId, session.user.id)).limit(1)
  if (!family) {
    const [membership] = await db.select({ family: families }).from(familyMembers)
      .innerJoin(families, eq(familyMembers.familyId, families.id))
      .where(eq(familyMembers.userId, session.user.id)).limit(1)
    family = membership?.family
  }
  if (!family) throw new Error("가족 공간을 찾을 수 없습니다.")
  return { family, userId: session.user.id }
}

export async function getChildCouponWallet() {
  const child = await getChildDeviceSession()
  if (!child) throw new Error("자녀 기기 로그인이 필요합니다.")
  const rewards = await db.select({
    id: couponRewards.id,
    title: couponRewards.couponTitleSnapshot,
    status: couponRewards.status,
    earnedAt: couponRewards.earnedAt,
    redeemedAt: couponRewards.redeemedAt,
  }).from(couponRewards)
    .where(eq(couponRewards.childProfileId, child.childProfileId))
    .orderBy(desc(couponRewards.earnedAt))
    .limit(100)
  return rewards
}

export async function createCouponUseRequest(rewardId: string) {
  const child = await getChildDeviceSession()
  if (!child) throw new Error("자녀 기기 로그인이 필요합니다.")
  if (typeof rewardId !== "string" || !rewardId) throw new Error("쿠폰 정보가 올바르지 않습니다.")
  const [reward] = await db.select({ id: couponRewards.id, status: couponRewards.status })
    .from(couponRewards).where(and(eq(couponRewards.id, rewardId), eq(couponRewards.childProfileId, child.childProfileId))).limit(1)
  if (!reward || reward.status !== "earned") throw new Error("사용할 수 있는 쿠폰이 아닙니다.")
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000)
  await db.insert(couponRedemptionTokens).values({ rewardId, tokenHash: hashOpaqueToken(token), expiresAt })
  const baseUrl = process.env.BETTER_AUTH_URL
  if (!baseUrl) throw new Error("서비스 주소가 설정되지 않았습니다.")
  return { url: baseUrl.replace(/\/$/, "") + "/parent/coupons/redeem?token=" + encodeURIComponent(token), expiresAt }
}

export async function getCouponRedemptionDetails(token: string) {
  const { family } = await requireParentFamily()
  if (typeof token !== "string" || token.length < 20 || token.length > 200) throw new Error("QR 정보가 올바르지 않습니다.")
  const now = new Date()
  const [record] = await db.select({
    tokenId: couponRedemptionTokens.id,
    expiresAt: couponRedemptionTokens.expiresAt,
    rewardId: couponRewards.id,
    title: couponRewards.couponTitleSnapshot,
    status: couponRewards.status,
    childName: childProfiles.displayName,
  }).from(couponRedemptionTokens)
    .innerJoin(couponRewards, eq(couponRedemptionTokens.rewardId, couponRewards.id))
    .innerJoin(childProfiles, eq(couponRewards.childProfileId, childProfiles.id))
    .where(and(
      eq(couponRedemptionTokens.tokenHash, hashOpaqueToken(token)),
      isNull(couponRedemptionTokens.consumedAt),
      gt(couponRedemptionTokens.expiresAt, now),
      eq(childProfiles.familyId, family.id),
      eq(couponRewards.status, "earned"),
    )).limit(1)
  if (!record) throw new Error("QR이 만료되었거나 이미 사용되었거나, 이 가족의 쿠폰이 아닙니다.")
  return { childName: record.childName, title: record.title, expiresAt: record.expiresAt }
}

export async function redeemCouponWithToken(token: string) {
  const { family } = await requireParentFamily()
  if (typeof token !== "string" || token.length < 20 || token.length > 200) throw new Error("QR 정보가 올바르지 않습니다.")
  const now = new Date()
  await db.transaction(async (tx) => {
    const [record] = await tx.select({
      tokenId: couponRedemptionTokens.id,
      rewardId: couponRewards.id,
    }).from(couponRedemptionTokens)
      .innerJoin(couponRewards, eq(couponRedemptionTokens.rewardId, couponRewards.id))
      .innerJoin(childProfiles, eq(couponRewards.childProfileId, childProfiles.id))
      .where(and(
        eq(couponRedemptionTokens.tokenHash, hashOpaqueToken(token)),
        isNull(couponRedemptionTokens.consumedAt),
        gt(couponRedemptionTokens.expiresAt, now),
        eq(childProfiles.familyId, family.id),
        eq(couponRewards.status, "earned"),
      )).limit(1)
    if (!record) throw new Error("이미 사용되었거나 만료된 QR입니다. 자녀에게 새 QR을 요청해 주세요.")
    const [consumed] = await tx.update(couponRedemptionTokens)
      .set({ consumedAt: now })
      .where(and(eq(couponRedemptionTokens.id, record.tokenId), isNull(couponRedemptionTokens.consumedAt), gt(couponRedemptionTokens.expiresAt, now)))
      .returning({ id: couponRedemptionTokens.id })
    if (!consumed) throw new Error("이미 처리된 QR입니다.")
    const [updated] = await tx.update(couponRewards)
      .set({ status: "redeemed", redeemedAt: now })
      .where(and(eq(couponRewards.id, record.rewardId), eq(couponRewards.status, "earned")))
      .returning({ id: couponRewards.id })
    if (!updated) throw new Error("쿠폰이 이미 사용 처리되었습니다.")
  })
  revalidatePath("/parent")
  revalidatePath("/child")
  return { success: true }
}
