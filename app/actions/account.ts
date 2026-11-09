"use server"

import { and, eq } from "drizzle-orm"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  families,
  familyMembers,
  parentNotifications,
  pushSubscriptions,
  notificationPreferences,
  rateLimits,
  wordEntries,
  user,
  verification,
} from "@/lib/db/schema"

/**
 * Permanently deletes the signed-in parent account.
 * An owner can withdraw only after removing all co-admins, because deleting
 * the owner family also deletes every child profile and all family learning data.
 */
export async function withdrawParentAccount() {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  const userId = session?.user?.id
  const email = session?.user?.email
  if (!userId || !email) throw new Error("로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.")

  const ownedFamilies = await db.select({ id: families.id })
    .from(families)
    .where(eq(families.ownerUserId, userId))

  for (const family of ownedFamilies) {
    const otherMembers = await db.select({ userId: familyMembers.userId })
      .from(familyMembers)
      .where(eq(familyMembers.familyId, family.id))
      .limit(1)
    if (otherMembers.length > 0) {
      throw new Error("공동 관리자가 남아 있어 탈퇴할 수 없습니다. 먼저 부모 공동관리자 관리에서 다른 관리자를 해제한 뒤 다시 시도해 주세요.")
    }
  }

  // Clear the current browser session before removing its account record.
  await auth.api.signOut({ headers: requestHeaders })

  await db.transaction(async (tx) => {
    // Remove records that intentionally do not have user foreign keys.
    await tx.delete(parentNotifications).where(eq(parentNotifications.recipientUserId, userId))
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
    await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId))
    await tx.delete(rateLimits).where(eq(rateLimits.userId, userId))
    await tx.delete(wordEntries).where(eq(wordEntries.userId, userId))

    // Remove any family memberships held by this parent.
    await tx.delete(familyMembers).where(eq(familyMembers.userId, userId))

    // Deleting an owned family cascades to child profiles, subjects, words,
    // quiz history, coupons, rewards, invitations, devices, and family settings.
    await tx.delete(families).where(eq(families.ownerUserId, userId))

    await tx.delete(verification).where(eq(verification.identifier, email))
    await tx.delete(user).where(eq(user.id, userId))
  })

  redirect("/login?withdrawn=1")
}
