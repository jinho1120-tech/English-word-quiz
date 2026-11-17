"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { HapticButton } from "@/components/haptic-button"
import { HapticSwitch } from "@/components/haptic-switch"
import { saveParentAiVocabularySettings } from "@/app/actions/ai-vocabulary"

type ChildSetting = {
  childProfileId: string
  childName: string
  enabled: boolean
  wordsPerDay: number
  idiomsPerDay: number
  wordLevel: string
  idiomLevel: string
  senseStage: "primary" | "additional"
  activeDays: number[]
  publishMode: "manual" | "automatic"
  latestWordAssessment: { assignedLevel: string; questionCount: number; correctCount: number; confidence: string; completedAt: Date | null } | null
  latestIdiomAssessment: { assignedLevel: string; questionCount: number; correctCount: number; confidence: string; completedAt: Date | null } | null
}

const DAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
]
const LEVELS = [
  { value: "L1", label: "L1 입문" },
  { value: "L2", label: "L2 초급" },
  { value: "L3", label: "L3 초중급" },
  { value: "L4", label: "L4 중급" },
  { value: "L5", label: "L5 중상급" },
  { value: "L6", label: "L6 고급" },
]

export function ParentAiVocabularySettings({ settings }: { settings: ChildSetting[] }) {
  const router = useRouter()
  const [selectedChildId, setSelectedChildId] = useState(settings[0]?.childProfileId ?? "")
  const selected = useMemo(
    () => settings.find((item) => item.childProfileId === selectedChildId) ?? settings[0],
    [settings, selectedChildId],
  )
  const [enabled, setEnabled] = useState(selected?.enabled ?? false)
  const [wordsPerDay, setWordsPerDay] = useState(selected?.wordsPerDay ?? 5)
  const [idiomsPerDay, setIdiomsPerDay] = useState(selected?.idiomsPerDay ?? 5)
  const [wordLevel, setWordLevel] = useState(selected?.wordLevel ?? "L1")
  const [idiomLevel, setIdiomLevel] = useState(selected?.idiomLevel ?? "L1")
  const [senseStage, setSenseStage] = useState<"primary" | "additional">(selected?.senseStage ?? "primary")
  const [activeDays, setActiveDays] = useState<number[]>(selected?.activeDays ?? [0, 1, 2, 3, 4, 5, 6])
  const [publishMode, setPublishMode] = useState<"manual" | "automatic">(selected?.publishMode ?? "manual")
  const [message, setMessage] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!selected) return
    setEnabled(selected.enabled)
    setWordsPerDay(selected.wordsPerDay)
    setIdiomsPerDay(selected.idiomsPerDay)
    setWordLevel(selected.wordLevel)
    setIdiomLevel(selected.idiomLevel)
    setSenseStage(selected.senseStage ?? "primary")
    setActiveDays(selected.activeDays)
    setPublishMode(selected.publishMode)
    setMessage("")
  }, [selected])

  function toggleDay(day: number) {
    setActiveDays((current) => current.includes(day)
      ? current.filter((value) => value !== day)
      : [...current, day])
  }

  function save() {
    if (!selected) return
    setMessage("")
    startTransition(async () => {
      try {
        await saveParentAiVocabularySettings({
          childProfileId: selected.childProfileId,
          enabled,
          wordsPerDay,
          idiomsPerDay,
          wordLevel,
          idiomLevel,
          senseStage,
          activeDays,
          publishMode,
        })
        setMessage("설정을 저장했어요.")
        router.refresh()
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "설정을 저장하지 못했어요.")
      }
    })
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="text-lg font-bold">AI 추천 단어·숙어</h2>
        <p className="mt-1 text-sm text-muted-foreground">자녀마다 학습량, 난이도, 요일과 게시 방식을 따로 설정할 수 있어요.</p>
      </div>
      {settings.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">먼저 자녀 프로필을 등록해 주세요.</p>
      ) : (
        <>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-muted-foreground">설정할 자녀</span>
            <select value={selected?.childProfileId ?? ""} onChange={(event) => setSelectedChildId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm">
              {settings.map((item) => <option key={item.childProfileId} value={item.childProfileId}>{item.childName}</option>)}
            </select>
          </label>
          {selected && (
            <div className="space-y-4">
              <HapticSwitch checked={enabled} onCheckedChange={setEnabled} label="AI 추천 학습 사용" description="끄면 신규 추천 생성을 멈추고, 기존 단어와 학습 기록은 보존해요." />
              <div className={enabled ? "space-y-4" : "pointer-events-none space-y-4 opacity-50"}>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">하루 단어 수</span>
                    <input type="number" min={0} max={30} value={wordsPerDay} onChange={(event) => setWordsPerDay(Math.min(30, Math.max(0, Number(event.target.value) || 0)))} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm" />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">하루 숙어 수</span>
                    <input type="number" min={0} max={30} value={idiomsPerDay} onChange={(event) => setIdiomsPerDay(Math.min(30, Math.max(0, Number(event.target.value) || 0)))} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm" />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">단어 레벨</span>
                    <select value={wordLevel} onChange={(event) => setWordLevel(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm">
                      {LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground">숙어 레벨</span>
                    <select value={idiomLevel} onChange={(event) => setIdiomLevel(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm">
                      {LEVELS.map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                    </select>
                  </label>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground">단어 의미 학습 단계</span>
                  <select value={senseStage} onChange={(event) => setSenseStage(event.target.value as "primary" | "additional")} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm">
                    <option value="primary">1단계 · 대표 의미 먼저</option>
                    <option value="additional">2단계 · 추가 의미 학습</option>
                  </select>
                  <span className="block text-[11px] leading-relaxed text-muted-foreground">대표 의미를 충분히 학습한 뒤 추가 의미 단계로 전환하세요. 선택한 단계의 승인된 의미만 AI 추천에 사용됩니다.</span>
                </label>
                <div className="space-y-2 rounded-xl bg-muted/40 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">최근 레벨 진단 결과</p>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { label: "단어", result: selected.latestWordAssessment },
                      { label: "숙어", result: selected.latestIdiomAssessment },
                    ]).map(({ label, result }) => (
                      <div key={label} className="rounded-lg bg-background p-2.5">
                        <p className="text-xs text-muted-foreground">{label}</p>
                        {result ? (
                          <>
                            <p className="mt-1 text-sm font-bold">{result.assignedLevel}</p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">{result.correctCount}/{result.questionCount} 정답 · 신뢰도 {result.confidence === "high" ? "높음" : result.confidence === "medium" ? "보통" : "낮음"}</p>
                            <p className="mt-0.5 text-[10px] text-muted-foreground">{result.completedAt ? new Date(result.completedAt).toLocaleDateString("ko-KR") : "날짜 정보 없음"}</p>
                          </>
                        ) : <p className="mt-1 text-xs text-muted-foreground">진단 기록 없음</p>}
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">진단을 마치면 레벨이 자동 반영됩니다. 아래 레벨 선택을 저장하면 부모가 직접 조정할 수도 있어요.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">학습 요일</p>
                  <div className="grid grid-cols-7 gap-1.5">
                    {DAYS.map((day) => (
                      <button key={day.value} type="button" aria-pressed={activeDays.includes(day.value)} onClick={() => toggleDay(day.value)} className={`rounded-xl border px-1 py-2.5 text-sm font-bold transition-colors ${activeDays.includes(day.value) ? "border-primary bg-primary-container text-primary-container-foreground" : "border-border bg-background text-muted-foreground"}`}>{day.label}</button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground">추천 게시 방식</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" aria-pressed={publishMode === "manual"} onClick={() => setPublishMode("manual")} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${publishMode === "manual" ? "border-primary bg-primary-container text-primary-container-foreground" : "border-border bg-background text-muted-foreground"}`}>부모 확인 후 게시</button>
                    <button type="button" aria-pressed={publishMode === "automatic"} onClick={() => setPublishMode("automatic")} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${publishMode === "automatic" ? "border-primary bg-primary-container text-primary-container-foreground" : "border-border bg-background text-muted-foreground"}`}>검증 후 자동 게시</button>
                  </div>
                  <p className="text-xs leading-relaxed text-muted-foreground">자동 게시도 사전·뜻·예문·중복 검증을 통과한 표현만 게시하도록 설계됩니다.</p>
                </div>
              </div>
              {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
              <HapticButton type="button" disabled={isPending} onClick={save} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">{isPending ? "저장 중…" : "설정 저장"}</HapticButton>
            </div>
          )}
        </>
      )}
    </section>
  )
}
