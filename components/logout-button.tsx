"use client"

import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"

export function LogoutButton() {
  const router = useRouter()
  return <button onClick={async () => { await authClient.signOut(); router.replace("/login"); router.refresh() }} className="text-sm text-muted-foreground underline underline-offset-4">로그아웃</button>
}
