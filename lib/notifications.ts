import webpush from "web-push"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { families, familyMembers, notificationPreferences, parentNotifications, pushSubscriptions } from "@/lib/db/schema"

export type ParentNotificationType = "coupon_issued" | "coupon_use_requested" | "penalty_issued" | "penalty_completed" | "device_registered"

const preferenceKey: Record<ParentNotificationType, keyof Pick<typeof notificationPreferences.$inferSelect, "couponIssued" | "couponUseRequested" | "penaltyIssued" | "penaltyCompleted" | "deviceRegistered">> = {
  coupon_issued: "couponIssued",
  coupon_use_requested: "couponUseRequested",
  penalty_issued: "penaltyIssued",
  penalty_completed: "penaltyCompleted",
  device_registered: "deviceRegistered",
}

export async function notifyFamilyParents(input: {
  familyId: string
  childProfileId?: string | null
  type: ParentNotificationType
  title: string
  message: string
  href?: string
}) {
  try {
    const [family] = await db.select({ ownerUserId: families.ownerUserId })
      .from(families).where(eq(families.id, input.familyId)).limit(1)
    if (!family) return
    const members = await db.select({ userId: familyMembers.userId })
      .from(familyMembers).where(eq(familyMembers.familyId, input.familyId))
    const userIds = Array.from(new Set([family.ownerUserId, ...members.map((item) => item.userId)]))
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY
    const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@localhost"

    for (const userId of userIds) {
      const [preference] = await db.select().from(notificationPreferences)
        .where(and(eq(notificationPreferences.familyId, input.familyId), eq(notificationPreferences.userId, userId))).limit(1)
      const enabled = preference ? preference[preferenceKey[input.type]] : input.type !== "device_registered"
      if (!enabled) continue
      await db.insert(parentNotifications).values({
        familyId: input.familyId,
        recipientUserId: userId,
        childProfileId: input.childProfileId ?? null,
        type: input.type,
        title: input.title.slice(0, 120),
        message: input.message.slice(0, 1000),
        href: input.href || "/parent",
      })
      if (!preference?.pushEnabled || !vapidPublic || !vapidPrivate) continue
      const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
      if (!subscriptions.length) continue
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
      } catch (error) {
        console.error("VAPID 설정 오류:", error)
        continue
      }
      await Promise.all(subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, JSON.stringify({
            title: input.title,
            body: input.message,
            url: input.href || "/parent",
          }), { TTL: 3600 })
        } catch (error) {
          const statusCode = typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: unknown }).statusCode) : 0
          if (statusCode === 404 || statusCode === 410) {
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, subscription.id))
          } else {
            console.error("부모 푸시 알림 전송 오류:", error)
          }
        }
      }))
    }
  } catch (error) {
    // A notification outage must never interrupt quiz grading or coupon redemption.
    console.error("부모 알림 저장 오류:", error)
  }
}
