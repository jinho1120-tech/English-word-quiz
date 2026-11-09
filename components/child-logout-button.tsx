"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { logoutChildDevice } from "@/app/actions/child-auth"

export function ChildLogoutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function logout() {
    if (pending) return
    setPending(true)
    try {
      await logoutChildDevice()
      // Clear any parent Better Auth session that may exist in this child device's browser.
      await authClient.signOut()
      router.replace("/child/login")
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <button type="button" onClick={logout} disabled={pending} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50">
      {pending ? "로그아웃 중..." : "로그아웃"}
    </button>
  )
}
