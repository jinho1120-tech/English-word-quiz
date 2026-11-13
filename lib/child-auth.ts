import "server-only"

import { createHash, createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import type { PoolClient } from "pg"
import { and, eq, isNull } from "drizzle-orm"
import { db } from "@/lib/db"
import { childDeviceSessions, childProfiles, families } from "@/lib/db/schema"

const CHILD_SESSION_COOKIE = "ewq_child_session"
const CHILD_SESSION_COOKIE_MAX_AGE = 400 * 24 * 60 * 60

function scryptAsync(password: string, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, (error, derivedKey) => {
      if (error) reject(error)
      else resolve(derivedKey as Buffer)
    })
  })
}

export function hashOpaqueToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function hashChildPin(pin: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(pin, salt, 64)
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`
}

export async function verifyChildPin(pin: string, encodedHash: string): Promise<boolean> {
  const [algorithm, saltHex, expectedHex] = encodedHash.split(":")
  if (algorithm !== "scrypt" || !saltHex || !expectedHex || !/^[a-f0-9]{32}$/i.test(saltHex) || !/^[a-f0-9]{128}$/i.test(expectedHex)) return false
  const expected = Buffer.from(expectedHex, "hex")
  const actual = await scryptAsync(pin, Buffer.from(saltHex, "hex"), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

let warnedAboutDevelopmentPepper = false

function getChildAccessCodePepper(): string {
  const value = process.env.CHILD_ACCESS_CODE_PEPPER
  if (value && value.length >= 32) return value
  if (process.env.NODE_ENV === "production") {
    throw new Error("CHILD_ACCESS_CODE_PEPPER 환경변수가 필요합니다.")
  }
  if (!warnedAboutDevelopmentPepper) {
    console.warn("[child-auth] CHILD_ACCESS_CODE_PEPPER가 없어 개발 전용 pepper를 사용합니다.")
    warnedAboutDevelopmentPepper = true
  }
  return "dev-only-pepper-dev-only-pepper-00"
}

/** Legacy SHA-256 and peppered v2 hash for a normalized 10-character code. */
export function hashChildAuthRateLimitKey(value: string): string {
  return createHmac("sha256", getChildAccessCodePepper()).update(value).digest("hex").slice(0, 32)
}

export function hashChildAccessCode(normalized: string): { current: string; legacy: string } {
  const legacy = hashOpaqueToken(normalized)
  const current = "v2:" + createHmac("sha256", getChildAccessCodePepper()).update(legacy).digest("hex")
  return { current, legacy }
}

/** Generate the user-facing code and its server-only storage hash together. */
export function issueChildAccessCode(): { code: string; hash: string } {
  const code = generateChildAccessCode()
  return { code, hash: hashChildAccessCode(normalizeChildAccessCode(code)).current }
}

export function generateChildAccessCode(): string {
  const raw = randomBytes(5).toString("hex").toUpperCase()
  return `${raw.slice(0, 5)}-${raw.slice(5)}`
}

export function normalizeChildAccessCode(value: string): string {
  return value.replace(/[^a-f0-9]/gi, "").toUpperCase()
}

/**
 * Persist a device session and return its raw token. When a transaction client
 * is supplied, callers MUST set the cookie only after that transaction commits.
 */
export async function createChildDeviceSession(childProfileId: string, deviceLabel?: string, client?: PoolClient): Promise<string> {
  const token = randomBytes(32).toString("base64url")
  const tokenHash = hashOpaqueToken(token)
  const normalizedDeviceLabel = deviceLabel?.trim().slice(0, 100) || null
  if (client) {
    await client.query(
      "INSERT INTO child_device_sessions (child_profile_id, token_hash, device_label) VALUES ($1, $2, $3)",
      [childProfileId, tokenHash, normalizedDeviceLabel],
    )
  } else {
    await db.insert(childDeviceSessions).values({
      childProfileId,
      tokenHash,
      deviceLabel: normalizedDeviceLabel,
    })
  }
  return token
}

/** Set the browser cookie only after the corresponding session row is committed. */
export async function setChildDeviceSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(CHILD_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: CHILD_SESSION_COOKIE_MAX_AGE,
  })
}

export async function getChildDeviceSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(CHILD_SESSION_COOKIE)?.value
  if (!token) return null

  const now = new Date()
  const tokenHash = hashOpaqueToken(token)
  const [result] = await db
    .select({
      sessionId: childDeviceSessions.id,
      childProfileId: childProfiles.id,
      childName: childProfiles.displayName,
      familyId: families.id,
      ownerUserId: families.ownerUserId,
    })
    .from(childDeviceSessions)
    .innerJoin(childProfiles, eq(childDeviceSessions.childProfileId, childProfiles.id))
    .innerJoin(families, eq(childProfiles.familyId, families.id))
    .where(and(
      eq(childDeviceSessions.tokenHash, tokenHash),
      isNull(childDeviceSessions.revokedAt),
      eq(childProfiles.isActive, true),
    ))
    .limit(1)

  if (!result) return null

  await db.update(childDeviceSessions)
    .set({ lastSeenAt: now })
    .where(eq(childDeviceSessions.id, result.sessionId))

  return result
}

export async function revokeCurrentChildDeviceSession(): Promise<void> {
  const cookieStore = await cookies()
  const token = cookieStore.get(CHILD_SESSION_COOKIE)?.value
  if (token) {
    await db.update(childDeviceSessions)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(childDeviceSessions.tokenHash, hashOpaqueToken(token)),
        isNull(childDeviceSessions.revokedAt),
      ))
  }
  cookieStore.delete(CHILD_SESSION_COOKIE)
}

export async function clearChildSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(CHILD_SESSION_COOKIE)
}
