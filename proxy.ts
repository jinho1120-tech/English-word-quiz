import { NextRequest, NextResponse } from "next/server"

const CHILD_SESSION_COOKIE = "ewq_child_session"
const COOKIE_MAX_AGE = 400 * 24 * 60 * 60

/**
 * Browser cookies have practical maximum lifetimes. Refresh the persistent
 * child cookie on every app request so an active device remains connected.
 * The database session itself has no expiry and is revoked explicitly.
 */
export function proxy(request: NextRequest) {
  const token = request.cookies.get(CHILD_SESSION_COOKIE)?.value
  const response = NextResponse.next()

  if (token) {
    response.cookies.set(CHILD_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    })
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
