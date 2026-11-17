"use client"

import { useState, useTransition } from "react"
import { BookPlus, Search } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"
import { lookupAndStageVocabularyCandidates } from "@/app/actions/ai-vocabulary"

type LookupItem =
  | { input: string; status: "found"; word: string; sensesFound: number; added: number; alreadyExists: number; sourceUrl: string; licenseName: string }
  | { input: string; status: "not_found"; word: string }
  | { input: string; status: "unavailable"; word: string; reason: "rate_limited" | "timeout" | "upstream_error" }

const BATCH_SIZE = 5
const MAX_EXPRESSIONS = 100

function parseExpressions(value: string) {
  const unique = new Map<string, string>()
  for (const line of value.split(/\r?\n/)) {
    const expression = line.split("\t", 1)[0]
      .trim()
      .replace(/^(?:[-*•]\s*|\d+[.)]\s*)/, "")
      .replace(/\s+/g, " ")
    if (!expression) continue
    const key = expression.toLocaleLowerCase("en-US")
    if (!unique.has(key)) unique.set(key, expression)
  }
  return [...unique.values()]
}

export function VocabularyCandidateImporter() {
  const [expressions, setExpressions] = useState("")
  const [lexicalType, setLexicalType] = useState<"word" | "idiom" | "phrasal_verb" | "collocation">("word")
  const [results, setResults] = useState<LookupItem[]>([])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [progress, setProgress] = useState("")
  const [isPending, startTransition] = useTransition()

  function importExpressions() {
    const unique = parseExpressions(expressions)
    if (!unique.length) {
      setError("영어 표현을 한 줄에 하나씩 입력해 주세요.")
      return
    }
    if (unique.length > MAX_EXPRESSIONS) {
      setError("한 번에 최대 100개까지 입력할 수 있어요. 나누어 등록해 주세요.")
      return
    }

    setError("")
    setNotice("")
    setResults([])
    startTransition(async () => {
      const collected: LookupItem[] = []
      for (let offset = 0; offset < unique.length; offset += BATCH_SIZE) {
        const batch = unique.slice(offset, offset + BATCH_SIZE)
        setProgress("사전 조회 중 " + Math.min(offset + batch.length, unique.length) + " / " + unique.length)
        try {
          const response = await lookupAndStageVocabularyCandidates(batch, lexicalType)
          collected.push(...response.results)
          setResults([...collected])
          const retryInputs = response.results
            .filter((item) => item.status === "unavailable")
            .map((item) => item.input)
          if (retryInputs.length > 0) {
            const remaining = [...retryInputs, ...unique.slice(offset + batch.length)]
            const reason = response.results.some((item) => item.status === "unavailable" && item.reason === "rate_limited")
              ? "사전 요청 한도에 도달했어요."
              : "일부 사전 조회가 일시적으로 실패했어요."
            setExpressions(remaining.join("\n"))
            setNotice(reason + " 완료된 결과는 보존했고, 재확인이 필요한 " + remaining.length + "개 표현은 입력창에 남겨 두었습니다.")
            setProgress("")
            return
          }
        } catch (cause) {
          setExpressions(unique.slice(offset).join("\n"))
          setError(cause instanceof Error ? cause.message : "일괄 사전 조회를 완료하지 못했어요.")
          setProgress("")
          return
        }
      }
      setExpressions("")
      setNotice(collected.length + "개 표현의 사전 확인을 마쳤어요. 신규 후보는 아직 검토 대기 상태입니다.")
      setProgress("")
    })
  }

  const found = results.filter((item) => item.status === "found")
  const notFound = results.filter((item) => item.status === "not_found")
  const unavailable = results.filter((item) => item.status === "unavailable")
  const added = found.reduce((total, item) => total + item.added, 0)
  const alreadyExists = found.reduce((total, item) => total + item.alreadyExists, 0)
  const isBusy = isPending

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><BookPlus className="size-5" /> 공용 어휘 후보 일괄 등록</h2>
        <p className="mt-1 text-sm text-muted-foreground">영어 표현을 한 줄에 하나씩 붙여 넣으세요. 엑셀에서 한 열을 복사해 붙여 넣어도 됩니다. 최대 100개까지 입력할 수 있고, 사전 요청은 5개씩 나누어 처리합니다.</p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">영어 단어 또는 표현 목록</span>
        <textarea
          value={expressions}
          onChange={(event) => setExpressions(event.target.value)}
          disabled={isBusy}
          rows={7}
          maxLength={12000}
          placeholder={"apple\nbeautiful\ntake into account\nbreak the ice"}
          className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 text-sm"
        />
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <label className="block min-w-0 space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">표현 유형</span>
          <select value={lexicalType} onChange={(event) => setLexicalType(event.target.value as typeof lexicalType)} disabled={isBusy} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm">
            <option value="word">단어</option>
            <option value="idiom">숙어</option>
            <option value="phrasal_verb">구동사</option>
            <option value="collocation">연어</option>
          </select>
        </label>
        <span className="pb-3 text-xs tabular-nums text-muted-foreground">{parseExpressions(expressions).length} / {MAX_EXPRESSIONS}개</span>
      </div>
      <HapticButton type="button" disabled={isBusy || !expressions.trim()} onClick={importExpressions} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">
        <Search className="size-4" /> {isBusy ? (progress || "조회 중…") : "목록 사전 조회 및 후보 등록"}
      </HapticButton>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p role="status" className="rounded-xl bg-muted/50 p-3 text-sm">{notice}</p>}
      {results.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-sm font-bold">이번 조회 결과</p>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-background p-2"><p className="text-muted-foreground">사전 확인</p><p className="mt-1 text-lg font-bold tabular-nums">{found.length}개</p></div>
            <div className="rounded-lg bg-background p-2"><p className="text-muted-foreground">신규 후보</p><p className="mt-1 text-lg font-bold tabular-nums">{added}개</p></div>
            <div className="rounded-lg bg-background p-2"><p className="text-muted-foreground">중복 의미</p><p className="mt-1 text-lg font-bold tabular-nums">{alreadyExists}개</p></div>
            <div className="rounded-lg bg-background p-2"><p className="text-muted-foreground">미확인 / 오류</p><p className="mt-1 text-lg font-bold tabular-nums">{notFound.length + unavailable.length}개</p></div>
          </div>
          <div className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {results.map((item, index) => (
              <div key={item.input + "-" + index} className="flex items-start justify-between gap-2 rounded-lg bg-background px-2.5 py-2">
                <span className="min-w-0 break-words font-medium">{item.input}</span>
                <span className="shrink-0 text-right text-muted-foreground">
                  {item.status === "found" ? "후보 " + item.added + "개 추가" : item.status === "not_found" ? "사전 항목 없음" : item.reason === "rate_limited" ? "요청 한도" : item.reason === "timeout" ? "시간 초과" : "조회 오류"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">사전 조회는 영어 정의·예문·출처를 후보로 가져오는 단계입니다. 한국어 뜻과 L1~L6 난이도는 자동으로 추정하지 않으며, 운영자가 직접 검토하고 승인한 후보만 레벨 테스트에 사용됩니다. 사전 요청 제한이 발생하면 남은 표현은 입력창에 유지됩니다.</p>
    </section>
  )
}
