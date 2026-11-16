"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { HapticButton } from "@/components/haptic-button"
import { answerChildAiVocabularyAssessment, startChildAiVocabularyAssessment } from "@/app/actions/child-words"

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

export function ChildAiVocabularyAssessment({ summary }: { summary: AssessmentSummary | null }) {
  const router = useRouter()
  const [assessmentId, setAssessmentId] = useState("")
  const [lexicalType, setLexicalType] = useState<LexicalType>("word")
  const [question, setQuestion] = useState<Question | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  if (!summary) return null

  function start(type: LexicalType) {
    setError("")
    setResult(null)
    setQuestion(null)
    setLastAnswerCorrect(null)
    setLexicalType(type)
    startTransition(async () => {
      try {
        const response = await startChildAiVocabularyAssessment(type)
        setAssessmentId(response.assessmentId)
        setQuestion(response.question)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "레벨 진단을 시작하지 못했어요.")
      }
    })
  }

  function answer(optionId: string) {
    if (!assessmentId || !question || isPending) return
    setError("")
    startTransition(async () => {
      try {
        const response = await answerChildAiVocabularyAssessment(assessmentId, optionId)
        setLastAnswerCorrect(response.correct)
        if (response.complete) {
          setQuestion(null)
          setResult(response.result)
          router.refresh()
        } else {
          setQuestion(response.question)
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "답안을 저장하지 못했어요.")
      }
    })
  }

  function reset() {
    setAssessmentId("")
    setQuestion(null)
    setResult(null)
    setLastAnswerCorrect(null)
    setError("")
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="text-base font-bold">AI 추천 학습 레벨 진단</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          단어와 숙어 실력을 따로 확인해요. 문제는 정답에 따라 쉬워지거나 어려워지며, 진단 결과가 매일 추천 난이도에 반영돼요.
        </p>
      </div>

      {!question && !result && (
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
          <div className="grid grid-cols-2 gap-2">
            <HapticButton type="button" disabled={isPending} onClick={() => start("word")} className="rounded-xl bg-primary px-3 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {isPending && lexicalType === "word" ? "준비 중…" : "단어 진단"}
            </HapticButton>
            <HapticButton type="button" disabled={isPending} onClick={() => start("idiom")} className="rounded-xl bg-primary px-3 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
              {isPending && lexicalType === "idiom" ? "준비 중…" : "숙어 진단"}
            </HapticButton>
          </div>
          <p className="text-[11px] text-muted-foreground">각 진단은 최대 18문항이며, 중간에 나가도 다음에 이어서 할 수 있어요.</p>
        </>
      )}

      {question && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{lexicalType === "word" ? "단어" : "숙어"} 진단</span>
            <span>{question.number} / {question.total}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: ((question.number - 1) / question.total * 100) + "%" }} />
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

      {result && (
        <div className="space-y-3 rounded-xl bg-muted/40 p-4 text-center">
          <p className="text-sm font-semibold">진단을 마쳤어요!</p>
          <p className="text-3xl font-black">{result.level}</p>
          <p className="text-sm font-semibold">{LEVEL_LABELS[result.level] ?? ""}</p>
          <p className="text-sm text-muted-foreground">{result.correctCount} / {result.questionCount} 정답 · 신뢰도 {result.confidence === "high" ? "높음" : result.confidence === "medium" ? "보통" : "낮음"}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">새 레벨이 추천 학습 설정에 반영됐어요. 부모님은 관리 화면에서 결과를 확인하고 레벨을 직접 조정할 수 있어요.</p>
          <HapticButton type="button" onClick={reset} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">다른 진단 하기</HapticButton>
        </div>
      )}

      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    </section>
  )
}
