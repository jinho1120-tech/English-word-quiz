import { NextRequest, NextResponse } from "next/server"
import { and, eq, gt, isNull } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { familyInvitations, familyMembers, families } from "@/lib/db/schema"
import { hashOpaqueToken } from "@/lib/child-auth"

function inviteLoginUrl(request: NextRequest, token: string, error: string) {
  const url = new URL("/login", request.url)
  url.searchParams.set("invite", token)
  url.searchParams.set("invite_error", error)
  return url
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || ""
  if (token.length < 30 || token.length > 200) {
    return NextResponse.redirect(new URL("/login?invite_error=invalid", request.url))
  }

  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user?.id || !session.user.email) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("invite", token)
    return NextResponse.redirect(loginUrl)
  }

  const tokenHash = hashOpaqueToken(token)
  const [invitation] = await db.select({
    id: familyInvitations.id,
    familyId: familyInvitations.familyId,
    email: familyInvitations.email,
    invitedByUserId: familyInvitations.invitedByUserId,
    expiresAt: familyInvitations.expiresAt,
    acceptedAt: familyInvitations.acceptedAt,
    revokedAt: familyInvitations.revokedAt,
  }).from(familyInvitations).where(eq(familyInvitations.tokenHash, tokenHash)).limit(1)

  if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    return NextResponse.redirect(inviteLoginUrl(request, token, "expired"))
  }

  const email = session.user.email.trim().toLowerCase()
  if (email !== invitation.email) {
    return NextResponse.redirect(inviteLoginUrl(request, token, "email_mismatch"))
  }

  const [existingOwnedFamily] = await db.select({ id: families.id })
    .from(families).where(eq(families.ownerUserId, session.user.id)).limit(1)
  const [existingMembership] = await db.select({ familyId: familyMembers.familyId })
    .from(familyMembers).where(eq(familyMembers.userId, session.user.id)).limit(1)

  if ((existingMembership && existingMembership.familyId !== invitation.familyId) ||
      (existingOwnedFamily && existingOwnedFamily.id !== invitation.familyId)) {
    return NextResponse.redirect(inviteLoginUrl(request, token, "already_has_family"))
  }

  if ((existingMembership && existingMembership.familyId === invitation.familyId) ||
      (existingOwnedFamily && existingOwnedFamily.id === invitation.familyId)) {
    await db.update(familyInvitations).set({ acceptedAt: new Date() })
      .where(and(eq(familyInvitations.id, invitation.id), isNull(familyInvitations.acceptedAt)))
    return NextResponse.redirect(inviteLoginUrl(request, token, "already_member"))
  }

  await db.insert(familyMembers).values({
    familyId: invitation.familyId,
    userId: session.user.id,
    email,
    role: "admin",
    invitedByUserId: invitation.invitedByUserId,
  }).onConflictDoNothing()

  await db.update(familyInvitations).set({ acceptedAt: new Date() })
    .where(and(
      eq(familyInvitations.id, invitation.id),
      isNull(familyInvitations.acceptedAt),
      isNull(familyInvitations.revokedAt),
      gt(familyInvitations.expiresAt, new Date()),
    ))

  return NextResponse.redirect(new URL("/parent?invited=success", request.url))
}
