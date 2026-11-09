"use client"

import { Trophy, RotateCcw, Mic } from "lucide-react"
import { HapticButton } from "./haptic-button"
import { cn } from "@/lib/utils"
import type { QuizWord } from "./word-quiz"


interface Props {
  score: number; correctCount: number; total: number; bestStreak: number;
  wrongWords: QuizWord[]; accent: string; usedHint?: boolean; rewardTitle?: string | null; rewardChecked?: boolean; quizType?: string;
  onRetryWrong: () => void; onRetryAll: () => void;
}

export function QuizResult({ score, correctCount, total, bestStreak, wrongWords, accent, usedHint = false, rewardTitle = null, rewardChecked = false, quizType, onRetryWrong, onRetryAll }: Props) {
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
        
        {rewardTitle ? <p className="mt-5 rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-800">🎉 축하해요! 「{rewardTitle}」 쿠폰을 받았어요. 내 쿠폰함을 확인해 보세요!</p> : rewardChecked ? <p className="mt-5 border-t border-border pt-4 text-center text-sm font-semibold text-muted-foreground">이번 퀴즈에서는 쿠폰 발행 조건을 충족하지 못했어요. 다음 도전도 응원할게요!</p> : isEligibleForReward && <p className="mt-5 border-t border-border pt-4 text-center text-sm font-semibold text-muted-foreground">쿠폰 발행 여부는 내 쿠폰함에서 확인할 수 있어요.</p>}
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
