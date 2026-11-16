"use client"

import { useState, useTransition } from "react"
import { BookPlus, Search } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"
import { lookupAndStageVocabularyCandidate } from "@/app/actions/ai-vocabulary"

type LookupResult =
  | { status: "found"; word: string; sensesFound: number; added: number; alreadyExists: number; sourceUrl: string; licenseName: string; licenseUrl: string }
  | { status: "not_found"; word: string }
  | { status: "unavailable"; word: string; reason: "rate_limited" | "timeout" | "upstream_error" }

export function VocabularyCandidateImporter() {
  const [expression, setExpression] = useState("")
  const [lexicalType, setLexicalType] = useState<"word" | "idiom" | "phrasal_verb" | "collocation">("word")
  const [result, setResult] = useState<LookupResult | null>(null)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function search() {
    if (!expression.trim()) {
      setError("조회할 영어 표현을 입력해 주세요.")
      return
    }
    setError("")
    setResult(null)
    startTransition(async () => {
      try {
        const response = await lookupAndStageVocabularyCandidate(expression, lexicalType)
        setResult(response)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "사전 조회를 완료하지 못했어요.")
      }
    })
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><BookPlus className="size-5" /> 공용 어휘 후보 등록</h2>
        <p className="mt-1 text-sm text-muted-foreground">영어 표현을 사전에서 조회해 공용 후보 풀에 쌓습니다. 단어와 숙어는 따로 분류해 주세요.</p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
        <input value={expression} onChange={(event) => setExpression(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !isPending) search() }} maxLength={100} placeholder="예: take into account" className="min-w-0 rounded-xl border border-border bg-background px-3 py-3 text-sm" />
        <select value={lexicalType} onChange={(event) => setLexicalType(event.target.value as typeof lexicalType)} aria-label="표현 유형" className="max-w-32 rounded-xl border border-border bg-background px-2 py-3 text-xs">
          <option value="word">단어</option>
          <option value="idiom">숙어</option>
          <option value="phrasal_verb">구동사</option>
          <option value="collocation">연어</option>
        </select>
      </div>
      <HapticButton type="button" disabled={isPending || !expression.trim()} onClick={search} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
        <Search className="size-4" /> {isPending ? "사전 확인 중…" : "사전 조회 및 후보 등록"}
      </HapticButton>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {result?.status === "found" && (
        <div role="status" className="space-y-2 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">사전에서 {result.sensesFound}개 의미를 확인했어요.</p>
          <p>신규 후보 {result.added}개 · 이미 등록된 의미 {result.alreadyExists}개</p>
          <p className="text-xs leading-relaxed text-muted-foreground">뜻(한국어)과 난이도는 아직 검증되지 않았어요. 사전 조회 성공만으로 학습 후보에 자동 추천되지는 않습니다.</p>
          <p className="text-xs text-muted-foreground">출처: <a className="underline underline-offset-2" href="https://freedictionaryapi.com/" target="_blank" rel="noreferrer">FreeDictionaryAPI.com</a> · <a className="underline underline-offset-2 break-all" href={result.sourceUrl} target="_blank" rel="noreferrer">원문 Wiktionary</a> · {result.licenseName}</p>
        </div>
      )}
      {result?.status === "not_found" && (
        <p role="status" className="rounded-xl bg-muted/50 p-3 text-sm">사전에서 “{result.word}” 표현을 확인하지 못했어요. 잘못된 단어라고 확정한 것은 아니며, 공용 후보로 등록하지 않았습니다.</p>
      )}
      {result?.status === "unavailable" && (
        <p role="status" className="rounded-xl bg-muted/50 p-3 text-sm">사전 확인을 완료하지 못했어요 ({result.reason === "rate_limited" ? "요청 한도" : result.reason === "timeout" ? "응답 시간 초과" : "사전 서버 오류"}). 표현이 잘못되었다고 처리하지 않았으니 나중에 다시 시도해 주세요.</p>
      )}
    </section>
  )
}
