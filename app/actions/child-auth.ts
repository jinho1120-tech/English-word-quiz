"use server"

import { revokeCurrentChildDeviceSession } from "@/lib/child-auth"

export async function logoutChildDevice() {
  await revokeCurrentChildDeviceSession()
}
