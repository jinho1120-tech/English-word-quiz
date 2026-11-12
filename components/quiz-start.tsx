import { Play, Ghost, BookOpen, Headphones } from "lucide-react"
import { HapticButton } from "./haptic-button"
import { cn } from "@/lib/utils"
import type { QuizWord, QuizType } from "./word-quiz"

interface Props {
  words: QuizWord[]
  accent: string
  quizType: QuizType
  setQuizType: (t: QuizType) => void
  isGenerating: boolean
  onBegin: () => void
  isMonsterMode?: boolean
  childMode?: boolean
}

export function QuizStart({ words, accent, quizType, setQuizType, isGenerating, onBegin, isMonsterMode = false, childMode = false }: Props) {
  return (
    <div className={cn("flex flex-col items-center text-center", childMode ? "px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-5" : "px-5 py-4")}>
      <div className={cn("mb-3 flex items-center justify-center rounded-2xl shadow-sm", childMode ? "size-12 sm:size-14" : "size-10")} style={{ backgroundColor: accent, color: "var(--child-accent-foreground, var(--primary-foreground, #FFFFFF))" }}>
        {isMonsterMode ? <Ghost className={childMode ? "size-6 sm:size-7 animate-monster-idle" : "size-5"} /> : <Play className={childMode ? "size-6 sm:size-7" : "size-5"} fill="currentColor"/>}
      </div>

      <h2 className={cn("font-black text-foreground", childMode ? "mb-1 text-lg sm:text-xl lg:text-2xl" : "mb-0.5 text-base")}>{isMonsterMode ? "몬스터 퇴치" : "단어 퀴즈"}</h2>
      <p className={cn("text-muted-foreground", childMode ? "mb-3 text-xs sm:text-sm" : "mb-3 text-xs leading-relaxed")}>
        {isMonsterMode ? `틀린 단어 ${words.length}개를 다시 연습해요!` : `${words.length}개의 단어가 준비되어 있어요.`}
      </p>

      {childMode ? (
        <div className="mb-3 grid w-full grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          <HapticButton
            hapticLabel="뜻 보고 쓰기 모드"
            onClick={() => setQuizType("standard")}
            wrapperClassName="relative flex w-full"
            className={cn("flex min-h-[68px] w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all sm:min-h-[76px] sm:px-4 sm:py-3", quizType === "standard" ? "bg-background shadow-md" : "border-border bg-muted/40")}
            style={quizType === "standard" ? { borderColor: accent, backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)` } : undefined}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-2xl sm:size-11" style={{ backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)` }}>📖</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-black text-foreground sm:text-base">뜻 보고 영어 쓰기</span>
              <span className="text-[11px] font-medium leading-snug text-muted-foreground sm:text-xs">우리말 뜻을 보고 영어 단어를 입력해요</span>
            </span>
          </HapticButton>

          <HapticButton
            hapticLabel="듣고 영단어와 뜻 쓰기 모드"
            onClick={() => setQuizType("listening")}
            wrapperClassName="relative flex w-full"
            className={cn("flex min-h-[68px] w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-all sm:min-h-[76px] sm:px-4 sm:py-3", quizType === "listening" ? "bg-background shadow-md" : "border-border bg-muted/40")}
            style={quizType === "listening" ? { borderColor: accent, backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)` } : undefined}
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl text-2xl sm:size-11" style={{ backgroundColor: `color-mix(in srgb, ${accent} 10%, transparent)` }}>🎧</span>
            <span className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-black text-foreground sm:text-base">듣고 영어와 뜻 쓰기</span>
              <span className="text-[11px] font-medium leading-snug text-muted-foreground sm:text-xs">발음을 듣고 영어 단어와 우리말 뜻을 입력해요</span>
            </span>
          </HapticButton>
        </div>
      ) : (
        <div className="mb-4 flex w-full flex-col gap-1.5 rounded-xl bg-muted p-1.5">
          <div className="flex gap-1.5">
            <HapticButton hapticLabel="뜻 보고 쓰기 모드" onClick={() => setQuizType("standard")} wrapperClassName="relative flex flex-1" className={cn("w-full rounded-lg py-2 text-[13px] font-bold transition-all", quizType === "standard" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted-foreground/10")}>📖 뜻 보고 쓰기</HapticButton>
            <HapticButton hapticLabel="듣고 영+한 쓰기 모드" onClick={() => setQuizType("listening")} wrapperClassName="relative flex flex-1" className={cn("w-full rounded-lg py-2 text-[13px] font-bold transition-all", quizType === "listening" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted-foreground/10")} style={quizType === "listening" ? { boxShadow: `0 0 0 1.5px ${accent} inset` } : undefined}>🎧 듣고 영+한 쓰기</HapticButton>
          </div>
          <HapticButton hapticLabel="AI 실전 문장 퀴즈 모드" onClick={() => setQuizType("context")} wrapperClassName="relative flex w-full" className={cn("w-full rounded-lg py-2 text-[13px] font-bold transition-all", quizType === "context" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted-foreground/10")}>🤖 AI 실전 문장 퀴즈</HapticButton>
          <HapticButton hapticLabel="AI 문장 말하기 훈련 모드" onClick={() => setQuizType("speaking")} wrapperClassName="relative flex w-full" className={cn("w-full rounded-lg py-2 text-[13px] font-bold transition-all", quizType === "speaking" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-muted-foreground/10")} style={quizType === "speaking" ? { boxShadow: `0 0 0 1.5px ${accent} inset` } : undefined}>🗣️ AI 문장 말하기 훈련</HapticButton>
        </div>
      )}

      <HapticButton
        hapticLabel="퀴즈 시작하기"
        onClick={onBegin}
        disabled={isGenerating}
        wrapperClassName="relative flex w-full"
        className={cn("w-full rounded-2xl font-bold shadow-md transition-opacity hover:opacity-90 active:opacity-80 disabled:opacity-70 disabled:cursor-wait", childMode ? "min-h-[52px] py-3 text-base sm:min-h-[56px] sm:text-lg" : "py-3 text-base")}
        style={{ backgroundColor: accent, color: "var(--child-accent-foreground, var(--primary-foreground, #FFFFFF))" }}
      >
        {isGenerating ? "문제를 준비하고 있어요..." : (isMonsterMode ? "몬스터 무찌르기 시작!" : "퀴즈 시작하기")}
      </HapticButton>
    </div>
  )
}
