"use client"

import { Trophy, RotateCcw, Mic, Gift } from "lucide-react"
import { useEffect, useRef, useState, type PointerEvent } from "react"
import { HapticButton } from "./haptic-button"
import { cn } from "@/lib/utils"
import type { QuizWord } from "./word-quiz"


function ScratchCouponCard({ outcome, title, onReveal }: { outcome: "won" | "blank" | null; title: string | null; onReveal: () => Promise<void> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const triggeredRef = useRef(false)
  const [revealing, setRevealing] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    canvas.width = 640
    canvas.height = 240
    const gradient = ctx.createLinearGradient(0, 0, 640, 240)
    gradient.addColorStop(0, "#d1d5db")
    gradient.addColorStop(0.5, "#9ca3af")
    gradient.addColorStop(1, "#e5e7eb")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = "#374151"
    ctx.font = "bold 34px sans-serif"
    ctx.textAlign = "center"
    ctx.fillText("여기를 긁어서 확인하세요!", 320, 130)
    ctx.font = "24px sans-serif"
    ctx.fillText("손가락이나 마우스로 문질러 주세요", 320, 175)
  }, [])

  async function finishScratch() {
    if (triggeredRef.current) return
    triggeredRef.current = true
    setRevealing(true)
    try {
      await onReveal()
    } catch {
      triggeredRef.current = false
      setRevealing(false)
    }
  }

  function scratch(event: PointerEvent<HTMLCanvasElement>) {
    if (outcome || revealing) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (canvas.width / rect.width)
    const y = (event.clientY - rect.top) * (canvas.height / rect.height)
    ctx.globalCompositeOperation = "destination-out"
    ctx.beginPath()
    ctx.arc(x, y, 34, 0, Math.PI * 2)
    ctx.fill()
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let transparent = 0
    let sampled = 0
    for (let i = 3; i < pixels.length; i += 64) {
      sampled++
      if (pixels[i] < 24) transparent++
    }
    if (transparent / sampled > 0.36) void finishScratch()
  }

  return (
    <div className="mt-5 overflow-hidden rounded-2xl border border-amber-300/70 bg-amber-50 p-3 text-center">
      <div className="mb-3 flex items-center justify-center gap-2 font-black text-amber-900">
        <Gift className="size-5" /> 오늘의 행운 스크래치 카드
      </div>
      <div className="relative h-36 overflow-hidden rounded-xl bg-white sm:h-40">
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3">
          {outcome === "won" ? (
            <>
              <p className="text-xl font-black text-amber-700">🎉 축하해요!</p>
              <p className="mt-2 text-base font-bold text-foreground">「{title}」 쿠폰 당첨!</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">내 쿠폰함에서 확인해 보세요.</p>
            </>
          ) : outcome === "blank" ? (
            <>
              <p className="text-xl font-black text-slate-700">🥲 아쉬워요!</p>
              <p className="mt-2 text-sm font-bold text-foreground">이번 카드는 꽝이에요.</p>
              <p className="mt-1 text-xs font-medium text-muted-foreground">다음 도전을 응원할게요!</p>
            </>
          ) : (
            <>
              <p className="text-lg font-black text-amber-700">두근두근…</p>
              <p className="mt-2 text-sm font-semibold text-muted-foreground">어떤 결과가 기다리고 있을까요?</p>
            </>
          )}
        </div>
        {!outcome && (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full touch-none"
            style={{ cursor: "crosshair" }}
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); scratch(event) }}
            onPointerMove={(event) => { if (event.buttons > 0 || event.pressure > 0) scratch(event) }}
            aria-label="스크래치 카드를 긁어 쿠폰 결과 확인하기"
          />
        )}
      </div>
      {!outcome && <p className="mt-2 text-xs font-semibold text-amber-800">{revealing ? "결과를 확인하고 있어요…" : "카드 표면을 문질러 긁어 주세요."}</p>}
    </div>
  )
}

interface Props {
  score: number; correctCount: number; total: number; bestStreak: number;
  wrongWords: QuizWord[]; accent: string; usedHint?: boolean; rewardTitle?: string | null; rewardChecked?: boolean; couponConfigured?: boolean;
  couponEligible?: boolean; couponOutcome?: "won" | "blank" | null; onRevealCoupon?: () => Promise<void>; quizType?: string;
  onRetryWrong: () => void; onRetryAll: () => void;
}

export function QuizResult({ score, correctCount, total, bestStreak, wrongWords, accent, usedHint = false, rewardTitle = null, rewardChecked = false, couponConfigured = true, couponEligible = false, couponOutcome = null, onRevealCoupon = async () => {}, quizType, onRetryWrong, onRetryAll }: Props) {
  const isContextMode = quizType === "context"
  const isEligibleForReward = score === 100 && total >= 10 && !usedHint

  if (quizType === "speaking") {
    return (
      <div className="flex flex-col px-6 py-10 animate-in fade-in zoom-in-95 duration-500">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex size-16 items-center justify-center rounded-2xl text-white shadow-lg" style={{ backgroundColor: accent }}><Mic className="size-8" /></div>
          <h2 className="text-2xl font-black text-foreground">{score === 100 ? "원어민 같은 완벽한 발음!" : "말하기 훈련 완료!"}</h2>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">{score === 100 ? "정말 대단해요! 완벽하게 읽어냈어요." : "자신감 있게 말하는 모습이 아주 멋져요!"}</p>
        </div>

        <div className="mb-6 rounded-2xl bg-muted/50 p-6 text-center shadow-inner">
          <p className="mb-1 text-sm font-bold text-muted-foreground">성공한 문장</p>
          <div className="mb-4 flex items-baseline justify-center gap-1">
            <span className="text-6xl font-black" style={{ color: accent }}>{correctCount}</span>
            <span className="text-3xl font-bold text-muted-foreground">/ {total}</span>
          </div>
          <div className="flex justify-center text-sm text-muted-foreground">
            <span className="font-semibold">최고 연속 성공 <span className="font-bold text-foreground text-base ml-1">{bestStreak}</span>번</span>
          </div>
        </div>

        <div className="flex flex-col gap-3 mt-2">
          {wrongWords.length > 0 && (
            <HapticButton 
              hapticLabel="아쉬웠던 문장 다시 연습하기"
              onClick={onRetryWrong} 
              wrapperClassName="relative flex w-full"
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-md transition-opacity hover:opacity-90" 
              style={{ backgroundColor: accent }}
            >
              <RotateCcw className="size-5" /> 아쉬웠던 문장 다시 연습하기
            </HapticButton>
          )}
          <HapticButton 
            hapticLabel="처음부터 다시 연습하기"
            onClick={onRetryAll} 
            wrapperClassName="relative flex w-full"
            className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold transition-colors", wrongWords.length > 0 ? "border border-border text-foreground hover:bg-muted" : "text-white shadow-md hover:opacity-90")} 
            style={wrongWords.length > 0 ? undefined : { backgroundColor: accent }}
          >
            <RotateCcw className="size-5" /> 처음부터 다시 연습하기
          </HapticButton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col px-6 py-10 animate-in fade-in duration-500">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-3 flex size-16 items-center justify-center rounded-2xl text-white shadow-md" style={{ backgroundColor: accent }}><Trophy className="size-8" /></div>
        <h2 className="text-2xl font-black text-foreground">학습 완료!</h2>
      </div>

      <div className="mb-6 rounded-2xl bg-muted/50 p-6 text-center shadow-inner">
        <p className="mb-1 text-xs font-medium text-muted-foreground">최종 점수</p>
        <p className="text-5xl font-black" style={{ color: accent }}>{score}점</p>
        <div className="mt-4 flex justify-center gap-6 text-sm text-muted-foreground">
          <span>정답 <span className="font-bold text-foreground">{correctCount}</span>/{total}</span>
          <span>최고 연속 <span className="font-bold text-foreground">{bestStreak}</span></span>
        </div>
        
        {rewardChecked && couponEligible ? (
          <ScratchCouponCard outcome={couponOutcome} title={rewardTitle} onReveal={onRevealCoupon} />
        ) : rewardChecked && !couponConfigured ? (
          <p className="mt-5 rounded-xl border border-border bg-background px-4 py-3 text-center text-sm font-semibold text-foreground">{score === 100 ? "완벽해! 오늘의 단어를 모두 정복했어! 정말 대단해! 🌟" : "끝까지 도전한 네가 정말 멋져! 오늘 배운 단어가 하나 더 네 것이 됐어. 👏"}</p>
        ) : rewardChecked ? (
          <p className="mt-5 border-t border-border pt-4 text-center text-sm font-semibold text-muted-foreground">이번 퀴즈에서는 쿠폰 발행 조건을 충족하지 못했어요. 다음 도전도 응원할게요!</p>
        ) : isEligibleForReward ? (
          <p className="mt-5 border-t border-border pt-4 text-center text-sm font-semibold text-muted-foreground">쿠폰 조건을 확인하고 있어요…</p>
        ) : null}
      </div>
      
      {!isContextMode && wrongWords.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold text-foreground">틀린 단어 ({wrongWords.length})</p>
          <ul className="flex flex-col gap-1.5">
            {wrongWords.map((w) => (
              <li key={w.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm">
                <span className="font-bold text-foreground">{w.word}</span>
                <span className="text-muted-foreground">{w.meaning}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3 mt-2">
        {!isContextMode && wrongWords.length > 0 && (
          <HapticButton 
            hapticLabel="틀린 단어만 다시 풀기"
            onClick={onRetryWrong} 
            wrapperClassName="relative flex w-full"
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-md transition-opacity hover:opacity-90" 
            style={{ backgroundColor: accent }}
          >
            <RotateCcw className="size-5" /> 틀린 단어만 다시 풀기
          </HapticButton>
        )}
        <HapticButton 
          hapticLabel="처음부터 다시하기"
          onClick={onRetryAll} 
          wrapperClassName="relative flex w-full"
          className={cn("flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold transition-colors", (!isContextMode && wrongWords.length > 0) ? "border border-border text-foreground hover:bg-muted" : "text-white shadow-md hover:opacity-90")} 
          style={(!isContextMode && wrongWords.length > 0) ? undefined : { backgroundColor: accent }}
        >
          <RotateCcw className="size-5" /> {isContextMode ? "새로운 AI 문제 도전하기" : "처음부터 다시하기"}
        </HapticButton>
      </div>
    </div>
  )
}
