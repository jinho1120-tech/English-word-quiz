"use client"

import { useState, useTransition } from "react"
import { CalendarPlus, Check, Clock3, RefreshCw, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { HapticButton } from "@/components/haptic-button"
import { generateParentAiVocabularyBundle, reviewParentAiVocabularyBundle } from "@/app/actions/ai-vocabulary"

type ChildOption = { id: string; displayName: string }
type Bundle = {
  id: string
  childProfileId: string
  childName: string
  studyDate: string
  status: string
  createdAt: Date
  itemCount: number
  items: {
    id: string
    sourceType: string
    lexicalType: string
    expression: string
    meaning: string
    disambiguation: string | null
    example: string | null
    sortOrder: number
  }[]
}

export function ParentAiVocabularyBundleReview({ children, bundles }: { children: ChildOption[]; bundles: Bundle[] }) {
  const router = useRouter()
  const [childId, setChildId] = useState(children[0]?.id ?? "")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const pendingBundles = bundles.filter((bundle) => bundle.status === "pending_approval")

  function generate() {
    if (!childId) return
    setError("")
    setMessage("")
    startTransition(async () => {
      try {
        const result = await generateParentAiVocabularyBundle(childId)
        if (result.status === "published") setMessage("검증된 표현 " + result.itemCount + "개를 오늘의 AI 추천 과목에 게시했어요.")
        else if (result.status === "pending_approval") setMessage("오늘의 추천 묶음 " + result.itemCount + "개를 만들었어요. 아래에서 게시 여부를 확인해 주세요.")
        else if (result.status === "waiting_for_candidates") setMessage("후보가 부족해 게시하지 않았어요. 단어 " + result.shortage.words + "개, 숙어 " + result.shortage.idioms + "개가 더 필요해요.")
        else if (result.status === "unfinished_exists") setMessage(result.studyDate + " 추천 묶음이 아직 미완료예요. 기존 묶음을 먼저 마쳐야 해요.")
        else if (result.status === "already_exists") setMessage("오늘 추천 묶음이 이미 있어요. 상태: " + result.bundleStatus)
        else if (result.status === "not_scheduled") setMessage("오늘은 설정한 학습 요일이 아니에요.")
        else if (result.status === "disabled") setMessage("이 자녀의 AI 추천 학습이 꺼져 있어요.")
        else if (result.status === "subject_missing") setMessage("AI 추천 과목을 찾지 못했어요. 설정을 저장해 과목을 복원해 주세요.")
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "추천 묶음을 만들지 못했어요.")
      }
    })
  }

  function decide(bundle: Bundle, decision: "publish" | "reject") {
    setError("")
    setMessage("")
    startTransition(async () => {
      try {
        const result = await reviewParentAiVocabularyBundle({
          childProfileId: bundle.childProfileId,
          bundleId: bundle.id,
          decision,
        })
        setMessage(result.status === "published" ? "추천 묶음을 자녀에게 게시했어요." : "추천 묶음을 제외했어요.")
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "추천 묶음을 처리하지 못했어요.")
      }
    })
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><CalendarPlus className="size-5" /> 오늘의 추천 묶음</h2>
        <p className="mt-1 text-sm text-muted-foreground">검증된 신규 후보와 자녀의 과목별 오답을 조합해 하루 학습 세트를 만듭니다. 수량을 채우지 못하면 일부만 게시하지 않고 대기합니다.</p>
      </div>
      {children.length === 0 ? (
        <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">활성화된 자녀가 없어요.</p>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
          <select value={childId} onChange={(event) => setChildId(event.target.value)} className="min-w-0 rounded-xl border border-border bg-background px-3 py-3 text-sm">
            {children.map((child) => <option key={child.id} value={child.id}>{child.displayName}</option>)}
          </select>
          <HapticButton type="button" disabled={isPending} onClick={generate} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-3 text-xs font-bold text-primary-foreground disabled:opacity-50"><RefreshCw className="size-4" /> 추천 준비</HapticButton>
        </div>
      )}
      {pendingBundles.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-bold"><Clock3 className="size-4" /> 부모 확인 대기</h3>
          {pendingBundles.map((bundle) => (
            <article key={bundle.id} className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{bundle.childName} · {bundle.studyDate}</span>
                <span className="text-xs text-muted-foreground">{bundle.itemCount}개</span>
              </div>
              <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-muted/35 p-3">
                {bundle.items.map((item) => (
                  <div key={item.id} className="border-b border-border/70 pb-2 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{item.expression}</p>
                      <span className="shrink-0 rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground">{item.sourceType === "candidate" ? "검증 후보" : "오답 복습"}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">{item.meaning}{item.disambiguation ? " (" + item.disambiguation + ")" : ""}</p>
                    {item.example && <p className="mt-1 text-xs italic text-muted-foreground">{item.example}</p>}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <HapticButton type="button" disabled={isPending} onClick={() => decide(bundle, "publish")} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"><Check className="size-4" /> 게시 승인</HapticButton>
                <HapticButton type="button" disabled={isPending} onClick={() => decide(bundle, "reject")} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-muted-foreground disabled:opacity-50"><X className="size-4" /> 제외</HapticButton>
              </div>
            </article>
          ))}
        </div>
      )}
      {message && <p role="status" className="rounded-xl bg-muted/50 p-3 text-sm">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
