"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Check, ClipboardList, X } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"
import { getParentChildWordSubmissions, reviewParentChildWordSubmission } from "@/app/actions/parent-words"

type ChildOption = { id: string; displayName: string }
type ReviewData = Awaited<ReturnType<typeof getParentChildWordSubmissions>>

export function ParentChildWordSubmissionReview({ children }: { children: ChildOption[] }) {
  const [selectedChildId, setSelectedChildId] = useState(children[0]?.id ?? "")
  const [data, setData] = useState<ReviewData | null>(null)
  const [subjectSelections, setSubjectSelections] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  const load = useCallback(async (childId: string) => {
    setIsLoading(true)
    setError("")
    try {
      const result = await getParentChildWordSubmissions(childId)
      setData(result)
      setSubjectSelections((current) => {
        const next = { ...current }
        for (const submission of result.submissions) {
          if (!next[submission.id] && result.subjects[0]) next[submission.id] = result.subjects[0].id
        }
        return next
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "확인 대기 목록을 불러오지 못했어요.")
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedChildId) void load(selectedChildId)
    else setData(null)
  }, [selectedChildId, load])

  function decide(submissionId: string, decision: "approve" | "reject") {
    if (!selectedChildId) return
    const subjectId = subjectSelections[submissionId]
    if (decision === "approve" && !subjectId) {
      setError("승인할 과목을 먼저 선택해 주세요.")
      return
    }
    setError("")
    setMessage("")
    startTransition(async () => {
      try {
        const result = await reviewParentChildWordSubmission({
          childProfileId: selectedChildId,
          submissionId,
          decision,
          subjectId,
        })
        setMessage(result.status === "approved" ? "단어를 단어장에 등록했어요." : "요청을 거절했어요.")
        await load(selectedChildId)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "요청을 처리하지 못했어요.")
      }
    })
  }

  if (!children.length) return null

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-bold"><ClipboardList className="size-5" /> 자녀 단어 등록 확인</h2>
        <p className="mt-1 text-sm text-muted-foreground">사전에서 확인되지 않았거나 조회할 수 없었던 표현은 부모가 검토한 뒤 단어장에 등록할 수 있어요.</p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground">자녀 선택</span>
        <select value={selectedChildId} onChange={(event) => setSelectedChildId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm">
          {children.map((child) => <option key={child.id} value={child.id}>{child.displayName}</option>)}
        </select>
      </label>
      {isLoading && <p className="text-sm text-muted-foreground">목록을 불러오는 중…</p>}
      {!isLoading && data && data.submissions.length === 0 && (
        <p className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground">확인 대기 중인 표현이 없어요.</p>
      )}
      {!isLoading && data?.submissions.map((submission) => (
        <article key={submission.id} className="space-y-3 rounded-xl border border-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-bold">{submission.expression}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{submission.meaning}</p>
              {submission.example && <p className="mt-1 text-xs text-muted-foreground">{submission.example}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-semibold text-muted-foreground">
              {submission.validationStatus === "pending_review" ? "사전 미발견" : "사전 확인 불가"}
            </span>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">승인 후 저장할 과목</span>
            <select value={subjectSelections[submission.id] ?? ""} onChange={(event) => setSubjectSelections((current) => ({ ...current, [submission.id]: event.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm">
              {data.subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <HapticButton type="button" disabled={isPending || data.subjects.length === 0} onClick={() => decide(submission.id, "approve")} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"><Check className="size-4" /> 승인 및 등록</HapticButton>
            <HapticButton type="button" disabled={isPending} onClick={() => decide(submission.id, "reject")} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-muted-foreground disabled:opacity-50"><X className="size-4" /> 거절</HapticButton>
          </div>
        </article>
      ))}
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
