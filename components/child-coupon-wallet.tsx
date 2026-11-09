"use client"

import { useState, useTransition } from "react"
import { QRCodeSVG } from "qrcode.react"
import { createCouponUseRequest } from "@/app/actions/coupons"

type Reward = { id: string; title: string; status: string; earnedAt: Date; redeemedAt: Date | null }

export function ChildCouponWallet({ rewards }: { rewards: Reward[] }) {
  const [request, setRequest] = useState<{ rewardId: string; title: string; url: string; expiresAt: Date } | null>(null)
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function showQr(reward: Reward) {
    setError("")
    startTransition(async () => {
      try {
        const result = await createCouponUseRequest(reward.id)
        setRequest({ rewardId: reward.id, title: reward.title, url: result.url, expiresAt: result.expiresAt })
      } catch (err) {
        setError(err instanceof Error ? err.message : "쿠폰 QR을 만들지 못했습니다.")
      }
    })
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-center justify-between"><h2 className="font-bold">내 쿠폰함</h2><span className="text-xs text-muted-foreground">사용 전 {rewards.filter((r) => r.status === "earned").length}장</span></div>
      {rewards.length === 0 ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">아직 받은 쿠폰이 없어요. 퀴즈 보상을 받아 보세요!</p> : rewards.map((reward) => (
        <article key={reward.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
          <div className="min-w-0 flex-1"><p className="font-semibold">🎁 {reward.title}</p><p className="text-xs text-muted-foreground">{new Date(reward.earnedAt).toLocaleDateString("ko-KR")} 발급 · {reward.status === "redeemed" ? "사용 완료" : "사용 가능"}</p></div>
          {reward.status === "earned" && <button disabled={pending} onClick={() => showQr(reward)} className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background disabled:opacity-50">사용하기</button>}
        </article>
      ))}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {request && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-sm space-y-3 rounded-2xl bg-background p-5 text-center shadow-xl">
          <h3 className="text-lg font-black">부모님께 쿠폰을 보여주세요</h3>
          <p className="font-semibold">{request.title}</p>
          <div className="mx-auto flex w-fit rounded-xl bg-white p-3"><QRCodeSVG value={request.url} size={220} level="M" /></div>
          <p className="text-xs text-muted-foreground">부모님이 휴대폰 카메라로 QR을 스캔한 뒤 사용을 승인하면 쿠폰이 소진돼요. QR은 5분 후 만료됩니다.</p>
          <button onClick={() => setRequest(null)} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">닫기</button>
        </div>
      </div>}
    </section>
  )
}
