"use client"

import { HapticButton } from "@/components/haptic-button"

import { useState, useTransition } from "react"
import { QRCodeSVG } from "qrcode.react"
import { createCouponUseRequest } from "@/app/actions/coupons"

type Reward = { id: string; title: string; description: string | null; status: string; couponKind: string | null; earnedAt: Date; redeemedAt: Date | null }

export function ChildCouponWallet({ rewards, maxStoredCoupons }: { rewards: Reward[]; maxStoredCoupons: number }) {
  const [request, setRequest] = useState<{ rewardId: string; title: string; description: string | null; url: string; expiresAt: Date } | null>(null)
  const [error, setError] = useState("")
  const [isOpen, setIsOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const availableCount = rewards.filter((reward) => reward.status === "earned" || reward.status === "blank").length

  // 발급된 쿠폰이 하나도 없으면 쿠폰함 아이콘 자체를 표시하지 않습니다.
  if (rewards.length === 0) return null

  function showQr(reward: Reward) {
    setError("")
    startTransition(async () => {
      try {
        const result = await createCouponUseRequest(reward.id)
        setRequest({ rewardId: reward.id, title: reward.title, description: result.description, url: result.url, expiresAt: result.expiresAt })
      } catch (err) {
        setError(err instanceof Error ? err.message : "쿠폰 QR을 만들지 못했습니다.")
      }
    })
  }

  return (
    <div className="relative">
      <HapticButton type="button" onClick={() => setIsOpen((value) => !value)} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 shadow-sm">
        🎁 쿠폰함 <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px]">{availableCount}/{maxStoredCoupons}</span>
      </HapticButton>
      {isOpen && <div className="absolute right-0 top-full z-40 mt-2 max-h-[65vh] w-[min(88vw,340px)] overflow-y-auto rounded-2xl border border-border bg-background p-3 shadow-xl">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="font-bold">내 쿠폰 보관함</h2><p className="text-xs text-muted-foreground">보관 중 {availableCount}개 / 최대 {maxStoredCoupons}개</p></div><HapticButton type="button" onClick={() => setIsOpen(false)} className="rounded-lg px-2 py-1 text-xs text-muted-foreground">닫기</HapticButton></div>
        {rewards.length === 0 ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">아직 받은 쿠폰이 없어요. 퀴즈 보상을 받아 보세요!</p> : <div className="space-y-2">{rewards.map((reward) => (
          <article key={reward.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1"><p className="font-semibold">{reward.couponKind === "blank" ? "💥" : "🎁"} {reward.title}</p><p className="text-xs text-muted-foreground">{new Date(reward.earnedAt).toLocaleDateString("ko-KR")} 발급 · {reward.status === "redeemed" ? (reward.couponKind === "blank" ? "꽝 쿠폰 · 사용 완료" : "사용 완료") : reward.couponKind === "blank" ? "꽝 쿠폰 · 사용 대기" : "사용 대기"}</p></div>
            {(reward.status === "earned" || reward.status === "blank") && <HapticButton disabled={pending} onClick={() => showQr(reward)} className="shrink-0 rounded-lg bg-foreground px-3 py-2 text-xs font-bold text-background disabled:opacity-50">사용하기</HapticButton>}
          </article>
        ))}</div>}
        {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      </div>}
      {request && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
        <div className="w-full max-w-sm space-y-3 rounded-2xl bg-background p-5 text-center shadow-xl">
          <h3 className="text-lg font-black">부모님께 쿠폰을 보여주세요</h3>
          <p className="font-semibold">{request.title}</p>{request.description && <p className="text-sm text-muted-foreground">{request.description}</p>}
          <div className="mx-auto flex w-fit rounded-xl bg-white p-3"><QRCodeSVG value={request.url} size={220} level="M" /></div>
          <p className="text-xs text-muted-foreground">부모님이 QR을 스캔해 승인하면 쿠폰이 보관함에서 삭제돼요. 꽝 쿠폰도 같은 방식으로 사용하며, QR은 5분 후 만료됩니다.</p>
          <HapticButton onClick={() => setRequest(null)} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold">닫기</HapticButton>
        </div>
      </div>}
    </div>
  )
}
