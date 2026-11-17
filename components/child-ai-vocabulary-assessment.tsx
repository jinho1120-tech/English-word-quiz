"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { HapticButton } from "@/components/haptic-button"
import { answerChildAiVocabularyAssessment, startChildAiVocabularyCombinedAssessment } from "@/app/actions/child-words"

type LexicalType = "word" | "idiom"
type AssessmentSummary = {
  wordLevel: string
  idiomLevel: string
  latestWordAssessment: {
    assignedLevel: string
    questionCount: number
    correctCount: number
    confidence: string
    completedAt: Date | null
  } | null
  latestIdiomAssessment: {
    assignedLevel: string
    questionCount: number
    correctCount: number
    confidence: string
    completedAt: Date | null
  } | null
}
type Question = {
  number: number
  total: number
  expression: string
  options: { id: string; label: string }[]
}
type Result = {
  level: string
  confidence: string
  correctCount: number
  questionCount: number
}
type AssessmentState = {
  assessmentId: string
  question: Question | null
  result: Result | null
}
type CombinedSession = {
  word: AssessmentState
  idiom: AssessmentState
}

const LEVEL_LABELS: Record<string, string> = {
  L1: "입문",
  L2: "초급",
  L3: "초중급",
  L4: "중급",
  L5: "중상급",
  L6: "고급",
}

function AssessmentResult({ label, result }: { label: string; result: AssessmentSummary["latestWordAssessment"] }) {
  if (!result) return <p className="text-xs text-muted-foreground">아직 진단 기록이 없어요.</p>
  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-sm font-black">{result.assignedLevel} {LEVEL_LABELS[result.assignedLevel] ?? ""}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {result.correctCount}/{result.questionCount} 정답 · 신뢰도 {result.confidence === "high" ? "높음" : result.confidence === "medium" ? "보통" : "낮음"} · {result.completedAt ? new Date(result.completedAt).toLocaleDateString("ko-KR") : "날짜 정보 없음"}
      </p>
    </div>
  )
}

function ResultCard({ label, result }: { label: string; result: Result }) {
  return (
    <div className="rounded-xl bg-muted/50 p-3 text-left">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="text-lg font-black">{result.level} <span className="text-xs font-semibold">{LEVEL_LABELS[result.level] ?? ""}</span></span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {result.correctCount}/{result.questionCount} 정답 · 신뢰도 {result.confidence === "high" ? "높음" : result.confidence === "medium" ? "보통" : "낮음"}
      </p>
    </div>
  )
}

export function ChildAiVocabularyAssessment({ summary }: { summary: AssessmentSummary | null }) {
  const router = useRouter()
  const [session, setSession] = useState<CombinedSession | null>(null)
  const [activeType, setActiveType] = useState<LexicalType>("word")
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  if (!summary) return null

  const active = session?.[activeType]
  const question = active?.question ?? null
  const wordDone = session?.word.result !== null && session?.word.result !== undefined
  const idiomDone = session?.idiom.result !== null && session?.idiom.result !== undefined
  const completed = Boolean(session && wordDone && idiomDone)
  const wordAnswered = session ? (session.word.result?.questionCount ?? (session.word.question ? session.word.question.number - 1 : 0)) : 0
  const idiomAnswered = session ? (session.idiom.result?.questionCount ?? (session.idiom.question ? session.idiom.question.number - 1 : 0)) : 0
  const overallNumber = wordAnswered + idiomAnswered + 1

  function start() {
    setError("")
    setLastAnswerCorrect(null)
    startTransition(async () => {
      try {
        const response = await startChildAiVocabularyCombinedAssessment()
        if (!response.success) {
          setError(response.error)
          return
        }
        setSession(response.session)
        setActiveType(response.session.word.question ? "word" : "idiom")
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "통합 레벨 진단을 시작하지 못했어요.")
      }
    })
  }

  function answer(optionId: string) {
    if (!session || !active || !question || isPending) return
    setError("")
    startTransition(async () => {
      try {
        const response = await answerChildAiVocabularyAssessment(active.assessmentId, optionId)
        setLastAnswerCorrect(response.correct)
        const updated: CombinedSession = {
          ...session,
          [activeType]: response.complete
            ? { ...active, question: null, result: response.result }
            : { ...active, question: response.question },
        }
        setSession(updated)
        const otherType: LexicalType = activeType === "word" ? "idiom" : "word"
        if (updated[otherType].question) setActiveType(otherType)
        else if (updated[activeType].question) setActiveType(activeType)
        else if (!updated[otherType].result) setActiveType(otherType)
        if (response.complete && updated.word.result && updated.idiom.result) router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "답안을 저장하지 못했어요.")
      }
    })
  }

  function reset() {
    setSession(null)
    setActiveType("word")
    setLastAnswerCorrect(null)
    setError("")
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="text-base font-bold">AI 추천 학습 레벨 진단</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          단어와 숙어 문제를 한 번에 번갈아 풀어요. 총 18문항을 마치면 단어와 숙어 레벨을 각각 산출해 추천 난이도에 반영해요.
        </p>
      </div>

      {!session && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">현재 단어 레벨</p>
              <p className="mt-1 text-lg font-black">{summary.wordLevel} <span className="text-sm font-semibold">{LEVEL_LABELS[summary.wordLevel] ?? ""}</span></p>
            </div>
            <div className="rounded-xl bg-muted/50 p-3">
              <p className="text-xs text-muted-foreground">현재 숙어 레벨</p>
              <p className="mt-1 text-lg font-black">{summary.idiomLevel} <span className="text-sm font-semibold">{LEVEL_LABELS[summary.idiomLevel] ?? ""}</span></p>
            </div>
          </div>
          <div className="space-y-2">
            <AssessmentResult label="최근 단어 진단" result={summary.latestWordAssessment} />
            <AssessmentResult label="최근 숙어 진단" result={summary.latestIdiomAssessment} />
          </div>
          <HapticButton type="button" disabled={isPending} onClick={start} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
            {isPending ? "진단 준비 중…" : "단어 + 숙어 통합 레벨테스트 시작"}
          </HapticButton>
          <p className="text-[11px] text-muted-foreground">단어 9문항과 숙어 9문항을 번갈아 풀어요. 중간에 나가도 다음에 이어서 할 수 있어요.</p>
        </>
      )}

      {session && !completed && question && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>통합 진단 · {activeType === "word" ? "단어" : "숙어"} 문제</span>
            <span>{overallNumber} / 18</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: ((overallNumber - 1) / 18 * 100) + "%" }} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className={`rounded-lg px-3 py-2 text-center text-xs font-semibold ${activeType === "word" ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"}`}>
              단어 {wordAnswered}/9 {wordDone ? "✓" : ""}
            </div>
            <div className={`rounded-lg px-3 py-2 text-center text-xs font-semibold ${activeType === "idiom" ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground"}`}>
              숙어 {idiomAnswered}/9 {idiomDone ? "✓" : ""}
            </div>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-7 text-center">
            <p className="text-xs text-muted-foreground">다음 영어 표현의 뜻을 골라 주세요.</p>
            <p className="mt-3 text-2xl font-black tracking-tight">{question.expression}</p>
          </div>
          <div className="grid gap-2">
            {question.options.map((option, index) => (
              <HapticButton key={option.id} type="button" disabled={isPending} onClick={() => answer(option.id)} className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left text-sm font-semibold disabled:opacity-50">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs">{index + 1}</span>
                <span>{option.label}</span>
              </HapticButton>
            ))}
          </div>
          {lastAnswerCorrect !== null && <p role="status" className="text-center text-sm font-semibold text-muted-foreground">{lastAnswerCorrect ? "정답이에요!" : "괜찮아요. 다음 문제로 넘어가요."}</p>}
        </div>
      )}

      {session && completed && (
        <div className="space-y-3 rounded-xl bg-muted/40 p-4 text-center">
          <p className="text-sm font-semibold">통합 레벨테스트를 마쳤어요!</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ResultCard label="단어 레벨" result={session.word.result!} />
            <ResultCard label="숙어 레벨" result={session.idiom.result!} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">두 결과가 각각 저장되어 추천 학습 난이도에 반영됐어요. 부모님은 관리 화면에서 각 레벨을 확인하고 직접 조정할 수 있어요.</p>
          <HapticButton type="button" onClick={reset} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">다시 진단하기</HapticButton>
        </div>
      )}

      {session && !completed && !question && (
        <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">다음 문제를 준비하고 있어요. 화면을 새로고침하거나 다시 시작해 주세요.</p>
      )}

      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    </section>
  )
}
