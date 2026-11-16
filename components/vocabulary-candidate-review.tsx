"use client"

import { useEffect, useState, useTransition } from "react"
import { Check, Languages, ShieldCheck, X } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"
import { reviewVocabularyCandidate } from "@/app/actions/ai-vocabulary"

type Candidate = {
  id: string
  expression: string
  lexicalType: string
  partOfSpeech: string
  definitionEn: string
  exampleSentence: string | null
  sourceName: string
  sourceEntryUrl: string | null
  licenseName: string
  licenseUrl: string | null
  createdAt: Date
}

const LEVELS = [
  { value: "L1", label: "L1 입문" },
  { value: "L2", label: "L2 초급" },
  { value: "L3", label: "L3 초중급" },
  { value: "L4", label: "L4 중급" },
  { value: "L5", label: "L5 중상급" },
  { value: "L6", label: "L6 고급" },
]
const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"]
const DOMAINS = [
  { value: "general", label: "일반 영어" },
  { value: "advanced", label: "고급 영어" },
  { value: "business", label: "비즈니스" },
  { value: "academic", label: "학술" },
  { value: "professional", label: "전문 분야" },
  { value: "medical", label: "의학" },
  { value: "biology", label: "생물학" },
  { value: "chemistry", label: "화학" },
  { value: "engineering", label: "공학" },
  { value: "law", label: "법률" },
]
const TYPE_LABELS: Record<string, string> = {
  word: "단어",
  idiom: "숙어",
  phrasal_verb: "구동사",
  collocation: "연어",
}

function CandidateCard({ candidate, onReviewed }: { candidate: Candidate; onReviewed: (id: string) => void }) {
  const [meaningKo, setMeaningKo] = useState("")
  const [childLevel, setChildLevel] = useState("")
  const [cefrLevel, setCefrLevel] = useState("")
  const [domain, setDomain] = useState("general")
  const [difficultyVerified, setDifficultyVerified] = useState(false)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function review(decision: "approve" | "reject") {
    setError("")
    startTransition(async () => {
      try {
        await reviewVocabularyCandidate({
          candidateId: candidate.id,
          decision,
          meaningKo,
          childLevel,
          cefrLevel,
          domain,
          difficultyVerified,
        })
        onReviewed(candidate.id)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "후보를 검토하지 못했어요.")
      }
    })
  }

  return (
    <article className="space-y-3 rounded-2xl border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold">{candidate.expression}</h3>
          <p className="text-xs text-muted-foreground">{TYPE_LABELS[candidate.lexicalType] ?? candidate.lexicalType} · {candidate.partOfSpeech}</p>
        </div>
        <span className="rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">사전 확인됨 · 검토 대기</span>
      </div>
      <div className="space-y-2 rounded-xl bg-muted/40 p-3">
        <p className="text-sm leading-relaxed">{candidate.definitionEn}</p>
        {candidate.exampleSentence && <p className="text-xs italic leading-relaxed text-muted-foreground">“{candidate.exampleSentence}”</p>}
        <p className="text-[11px] text-muted-foreground">
          출처: {candidate.sourceName} · {candidate.licenseName}
          {candidate.sourceEntryUrl && <> · <a href={candidate.sourceEntryUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">원문 Wiktionary</a></>}
          {candidate.licenseUrl && <> · <a href={candidate.licenseUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">라이선스</a></>}
        </p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">한국어 뜻</span>
        <input value={meaningKo} onChange={(event) => setMeaningKo(event.target.value)} maxLength={200} placeholder="이 의미에 맞는 자연스러운 한국어 뜻" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">자녀 난이도</span>
          <select value={childLevel} onChange={(event) => setChildLevel(event.target.value)} className="w-full rounded-xl border border-border bg-background px-2.5 py-2.5 text-sm">
            <option value="">선택 안 함</option>
            {LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">성인 CEFR</span>
          <select value={cefrLevel} onChange={(event) => setCefrLevel(event.target.value)} className="w-full rounded-xl border border-border bg-background px-2.5 py-2.5 text-sm">
            <option value="">선택 안 함</option>
            {CEFR.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">분야</span>
        <select value={domain} onChange={(event) => setDomain(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
          {DOMAINS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <label className="flex items-start gap-2 rounded-xl bg-muted/40 p-3 text-sm">
        <input type="checkbox" checked={difficultyVerified} onChange={(event) => setDifficultyVerified(event.target.checked)} className="mt-0.5 size-4 accent-primary" />
        <span><span className="block font-semibold">난이도 검토 완료</span><span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">선택한 레벨을 확인했을 때만 체크해 주세요. 전문 용어는 근거 없이 CEFR을 지정하지 않아도 됩니다.</span></span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <HapticButton type="button" disabled={isPending || !meaningKo.trim() || (difficultyVerified && !childLevel && !cefrLevel)} onClick={() => review("approve")} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"><Check className="size-4" /> 검토 승인</HapticButton>
        <HapticButton type="button" disabled={isPending} onClick={() => review("reject")} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-muted-foreground disabled:opacity-50"><X className="size-4" /> 후보 제외</HapticButton>
      </div>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </article>
  )
}

export function VocabularyCandidateReview({ candidates }: { candidates: Candidate[] }) {
  const [items, setItems] = useState(candidates)
  const [showAll, setShowAll] = useState(false)
  useEffect(() => setItems(candidates), [candidates])
  if (!items.length) return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-lg font-bold">어휘 후보 검토</h2>
      <p className="mt-1 text-sm text-muted-foreground">검토할 사전 후보가 없어요. 위에서 새 표현을 조회해 등록할 수 있어요.</p>
    </section>
  )

  const visible = showAll ? items : items.slice(0, 5)
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><Languages className="size-5" /> 어휘 후보 검토</h2>
        <p className="mt-1 text-sm text-muted-foreground">사전에 존재하는 표현을 확인한 뒤 한국어 뜻과 난이도를 검토해 주세요. 사전 존재 여부만으로는 추천 후보가 되지 않아요.</p>
        <p className="mt-1 text-xs text-muted-foreground"><ShieldCheck className="mr-1 inline size-3.5" /> L1–L6은 서비스 내부 기준이며, CEFR도 이 후보의 난이도를 검토해 지정하는 값이에요.</p>
      </div>
      {visible.map((candidate) => <CandidateCard key={candidate.id} candidate={candidate} onReviewed={(id) => setItems((current) => current.filter((item) => item.id !== id))} />)}
      {items.length > 5 && <button type="button" onClick={() => setShowAll((value) => !value)} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-muted-foreground">{showAll ? "접기" : `나머지 ${items.length - 5}개 더 보기`}</button>}
    </section>
  )
}
