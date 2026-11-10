"use server"

import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { families, familyMembers, notificationPreferences, parentNotifications, pushSubscriptions } from "@/lib/db/schema"

async function requireParent() {
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
  return { userId: session.user.id, family }
}

export async function getParentNotificationData() {
  const { userId, family } = await requireParent()
  const notifications = await db.select({
    id: parentNotifications.id,
    type: parentNotifications.type,
    title: parentNotifications.title,
    message: parentNotifications.message,
    href: parentNotifications.href,
    readAt: parentNotifications.readAt,
    createdAt: parentNotifications.createdAt,
  }).from(parentNotifications)
    .where(eq(parentNotifications.recipientUserId, userId))
    .orderBy(desc(parentNotifications.createdAt))
    .limit(40)
  const [{ unreadCount }] = await db.select({ unreadCount: count() }).from(parentNotifications)
    .where(and(eq(parentNotifications.recipientUserId, userId), isNull(parentNotifications.readAt)))
  const [stored] = await db.select().from(notificationPreferences)
    .where(and(eq(notificationPreferences.familyId, family.id), eq(notificationPreferences.userId, userId))).limit(1)
  const preferences = stored ? {
    pushEnabled: stored.pushEnabled,
    couponIssued: stored.couponIssued,
    couponUseRequested: stored.couponUseRequested,
    penaltyIssued: stored.penaltyIssued,
    penaltyCompleted: stored.penaltyCompleted,
    deviceRegistered: stored.deviceRegistered,
  } : {
    pushEnabled: true,
    couponIssued: true,
    couponUseRequested: true,
    penaltyIssued: true,
    penaltyCompleted: true,
    deviceRegistered: false,
  }
  const hasPushSubscription = (await db.select({ id: pushSubscriptions.id }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).limit(1)).length > 0
  return { notifications, unreadCount, preferences, hasPushSubscription }
}

export async function markParentNotificationRead(id: string) {
  const { userId } = await requireParent()
  if (typeof id !== "string" || !id) throw new Error("알림 정보가 올바르지 않습니다.")
  await db.update(parentNotifications).set({ readAt: new Date() })
    .where(and(eq(parentNotifications.id, id), eq(parentNotifications.recipientUserId, userId), isNull(parentNotifications.readAt)))
  revalidatePath("/parent")
  return { success: true }
}

export async function markAllParentNotificationsRead() {
  const { userId } = await requireParent()
  await db.update(parentNotifications).set({ readAt: new Date() })
    .where(and(eq(parentNotifications.recipientUserId, userId), isNull(parentNotifications.readAt)))
  revalidatePath("/parent")
  return { success: true }
}

export async function deleteParentNotification(id: string) {
  const { userId } = await requireParent()
  if (typeof id !== "string" || !id) throw new Error("알림 정보가 올바르지 않습니다.")
  await db.delete(parentNotifications).where(and(
    eq(parentNotifications.id, id),
    eq(parentNotifications.recipientUserId, userId),
    isNotNull(parentNotifications.readAt),
  ))
  revalidatePath("/parent")
  return { success: true }
}

export async function deleteAllReadParentNotifications() {
  const { userId } = await requireParent()
  await db.delete(parentNotifications).where(and(
    eq(parentNotifications.recipientUserId, userId),
    isNotNull(parentNotifications.readAt),
  ))
  revalidatePath("/parent")
  return { success: true }
}

export async function getPushPublicKey() {
  await requireParent()
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null
}

export async function saveParentPushSubscription(input: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  const { userId } = await requireParent()
  if (!input || typeof input.endpoint !== "string" || !input.endpoint.startsWith("https://") ||
      typeof input.keys?.p256dh !== "string" || typeof input.keys?.auth !== "string" ||
      input.endpoint.length > 2048 || input.keys.p256dh.length > 256 || input.keys.auth.length > 256) {
    throw new Error("푸시 구독 정보가 올바르지 않습니다.")
  }
  await db.insert(pushSubscriptions).values({
    userId,
    endpoint: input.endpoint,
    p256dh: input.keys.p256dh,
    auth: input.keys.auth,
  }).onConflictDoUpdate({
    target: pushSubscriptions.endpoint,
    set: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth, updatedAt: new Date() },
  })
  return { success: true }
}

export async function removeParentPushSubscription(endpoint: string) {
  const { userId } = await requireParent()
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) throw new Error("푸시 구독 정보가 올바르지 않습니다.")
  await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
  return { success: true }
}

export async function saveParentNotificationPreferences(input: {
  pushEnabled: boolean
  couponIssued: boolean
  couponUseRequested: boolean
  penaltyIssued: boolean
  penaltyCompleted: boolean
  deviceRegistered: boolean
}) {
  const { userId, family } = await requireParent()
  if (!input || Object.values(input).some((value) => typeof value !== "boolean")) throw new Error("알림 설정값이 올바르지 않습니다.")
  await db.insert(notificationPreferences).values({
    familyId: family.id,
    userId,
    ...input,
  }).onConflictDoUpdate({
    target: [notificationPreferences.familyId, notificationPreferences.userId],
    set: { ...input, updatedAt: new Date() },
  })
  revalidatePath("/parent")
  return { success: true }
}
