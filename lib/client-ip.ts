import "server-only"

import { isIP } from "node:net"
import { headers } from "next/headers"
import { hashChildAuthRateLimitKey } from "@/lib/child-auth"

function normalizeIp(value: string): string | null {
  const candidate = value.trim().replace(/^\[|\]$/g, "")
  const version = isIP(candidate)
  if (version === 4) return candidate.split(".").map((part) => String(Number(part))).join(".")
  if (version !== 6) return null

  let address = candidate.toLowerCase()
  if (address.includes(".")) {
    const lastColon = address.lastIndexOf(":")
    const ipv4 = address.slice(lastColon + 1)
    const octets = ipv4.split(".").map(Number)
    const high = ((octets[0] << 8) | octets[1]).toString(16)
    const low = ((octets[2] << 8) | octets[3]).toString(16)
    address = address.slice(0, lastColon + 1) + high + ":" + low
  }

  const halves = address.split("::")
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(":") : []
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : []
  const missing = 8 - left.length - right.length
  const groups = halves.length === 2
    ? [...left, ...Array(Math.max(0, missing)).fill("0"), ...right]
    : left
  if (groups.length !== 8) return null
  const normalized = groups.map((group) => Number.parseInt(group || "0", 16).toString(16).padStart(4, "0"))
  // IPv4-mapped IPv6 addresses use the IPv4 bucket rather than sharing one /64.
  if (normalized.slice(0, 5).every((group) => group === "0000") && normalized[5] === "ffff") {
    const high = Number.parseInt(normalized[6], 16)
    const low = Number.parseInt(normalized[7], 16)
    return [high >> 8, high & 255, low >> 8, low & 255].join(".")
  }
  return normalized.slice(0, 4).join(":") + "::/64"
}

export type ClientRateLimitKey = { key: string; unknown: boolean }

export async function getClientRateLimitKey(): Promise<ClientRateLimitKey> {
  const requestHeaders = await headers()
  const candidates = [
    requestHeaders.get("x-real-ip"),
    requestHeaders.get("x-forwarded-for")?.split(",")[0],
  ]
  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = normalizeIp(candidate)
    if (normalized) return { key: "ip:" + hashChildAuthRateLimitKey("ip:" + normalized), unknown: false }
  }
  return { key: "unknown", unknown: true }
}
