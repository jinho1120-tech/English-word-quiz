import { NextRequest, NextResponse } from "next/server"
import { and, eq, gt, isNull } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { familyInvitations, familyMembers, families } from "@/lib/db/schema"
import { hashOpaqueToken } from "@/lib/child-auth"

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

  const email = session.user.email.trim().toLowerCase()
  const tokenHash = hashOpaqueToken(token)
  const now = new Date()

  const [invitation] = await db.select({
    id: familyInvitations.id,
    familyId: familyInvitations.familyId,
    email: familyInvitations.email,
  }).from(familyInvitations).where(and(
    eq(familyInvitations.tokenHash, tokenHash),
    eq(familyInvitations.email, email),
    isNull(familyInvitations.acceptedAt),
    isNull(familyInvitations.revokedAt),
    gt(familyInvitations.expiresAt, now),
  )).limit(1)

  if (!invitation) {
    return NextResponse.redirect(new URL("/login?invite_error=expired_or_email_mismatch", request.url))
  }

  const [existingOwnedFamily] = await db.select({ id: families.id })
    .from(families).where(eq(families.ownerUserId, session.user.id)).limit(1)
  if (existingOwnedFamily && existingOwnedFamily.id !== invitation.familyId) {
    return NextResponse.redirect(new URL("/login?invite_error=already_has_family", request.url))
  }

  await db.insert(familyMembers).values({
    familyId: invitation.familyId,
    userId: session.user.id,
    email,
    role: "admin",
    invitedByUserId: "invitation",
  }).onConflictDoNothing()

  await db.update(familyInvitations).set({ acceptedAt: now })
    .where(and(
      eq(familyInvitations.id, invitation.id),
      isNull(familyInvitations.acceptedAt),
      isNull(familyInvitations.revokedAt),
      gt(familyInvitations.expiresAt, now),
    ))

  return NextResponse.redirect(new URL("/parent?invited=success", request.url))
}
