"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { redeemCouponWithToken } from "@/app/actions/coupons"

export function CouponRedeemConfirmation({ token, childName, title, description, expiresAt }: { token: string; childName: string; title: string; description: string | null; expiresAt: Date }) {
  const router = useRouter()
  const [error, setError] = useState("")
  const [done, setDone] = useState(false)
  const [pending, startTransition] = useTransition()
  function approve() {
    setError("")
    startTransition(async () => {
      try { await redeemCouponWithToken(token); setDone(true); router.refresh() }
      catch (err) { setError(err instanceof Error ? err.message : "쿠폰을 사용 처리하지 못했습니다.") }
    })
  }
  if (done) return <section className="rounded-2xl border border-green-300 bg-green-50 p-5 text-center text-green-900"><p className="text-2xl">✓</p><h2 className="mt-2 text-xl font-black">쿠폰 사용 완료</h2><p className="mt-1 text-sm">{childName} · {title}</p><p className="mt-2 text-xs">자녀 쿠폰함에도 사용 완료로 표시됩니다.</p></section>
  return <section className="space-y-4 rounded-2xl border border-border p-5">
    <div className="text-center"><p className="text-sm text-muted-foreground">쿠폰 사용 확인</p><h1 className="mt-1 text-2xl font-black">{title}</h1>{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}<p className="mt-2 text-sm">{childName} 자녀가 제시한 쿠폰입니다.</p><p className="mt-1 text-xs text-muted-foreground">QR 만료: {new Date(expiresAt).toLocaleTimeString("ko-KR")}</p></div>
    <p className="rounded-xl bg-muted p-3 text-sm">실제로 쿠폰을 사용하도록 승인할 때만 아래 버튼을 눌러 주세요. 승인 후에는 다시 사용할 수 없습니다.</p>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button disabled={pending} onClick={approve} className="w-full rounded-xl bg-foreground px-4 py-3 font-bold text-background disabled:opacity-50">{pending ? "처리 중..." : "쿠폰 사용 승인"}</button>
  </section>
}
