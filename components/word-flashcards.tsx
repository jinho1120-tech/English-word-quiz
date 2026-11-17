"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react"
import { Bookmark, ChevronLeft, ChevronRight, List, RotateCcw, Star, Volume2 } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"
import { recordChildAiVocabularyCardView, toggleChildWordFavorite } from "@/app/actions/child-words"

type FlashcardWord = {
  id: number
  subjectId: string | null
  subject: string
  word: string
  meaning: string
  example: string | null
  disambiguation?: string | null
  lexicalType?: string
  sourceName?: string | null
  sourceEntryUrl?: string | null
  licenseName?: string | null
  licenseUrl?: string | null
  aiBundleItemId?: string
}

type FlashcardSubject = { id: string; name: string; color: string }
type AiBundle = {
  id: string
  status: string
  items: { id: string; wordEntryId: number | null; lexicalType: string; expressionSnapshot: string; meaningSnapshot: string; disambiguationSnapshot: string | null; exampleSnapshot: string | null; sourceName: string | null; sourceEntryUrl: string | null; licenseName: string | null; licenseUrl: string | null; frontViewedAt: Date | null; backViewedAt: Date | null }[]
}

export function WordFlashcards({
  dateWords,
  allWords,
  selectedDate,
  subjects,
  initialFavoriteWordIds,
  onSpeak,
  ttsVoice,
  onTtsVoiceChange,
  aiBundle,
  onStartAiQuiz,
}: {
  dateWords: FlashcardWord[]
  allWords: FlashcardWord[]
  selectedDate: string
  subjects: FlashcardSubject[]
  initialFavoriteWordIds: number[]
  onSpeak: (text: string) => void
  ttsVoice: string
  onTtsVoiceChange: (voice: string) => void
  aiBundle: AiBundle | null
  onStartAiQuiz: () => void
}) {
  const [subjectFilter, setSubjectFilter] = useState("__all__")
  const [cardScope, setCardScope] = useState<"date" | "favorites" | "today-ai">("date")
  const [quizPromptDismissed, setQuizPromptDismissed] = useState(false)
  const [bundleCardsComplete, setBundleCardsComplete] = useState(Boolean(aiBundle && aiBundle.items.length > 0 && aiBundle.items.every((item) => item.frontViewedAt && item.backViewedAt)))
  const recordedSides = useRef(new Set<string>())
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(() => new Set(initialFavoriteWordIds))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [slideDirection, setSlideDirection] = useState<"next" | "previous" | null>(null)
  const [slideKey, setSlideKey] = useState(0)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()
  const pointerStart = useRef<{ x: number; y: number } | null>(null)
  const suppressClick = useRef(false)

  const todayAiWords = useMemo(() => (aiBundle?.items ?? [])
    .filter((item) => item.wordEntryId !== null)
    .map((item) => ({
      id: item.wordEntryId as number,
      subjectId: null,
      subject: "오늘의 AI 추천",
      word: item.expressionSnapshot,
      meaning: item.meaningSnapshot,
      example: item.exampleSnapshot,
      disambiguation: item.disambiguationSnapshot,
      lexicalType: item.lexicalType,
      sourceName: item.sourceName,
      sourceEntryUrl: item.sourceEntryUrl,
      licenseName: item.licenseName,
      licenseUrl: item.licenseUrl,
      aiBundleItemId: item.id,
    })), [aiBundle])
  const sourceWords = cardScope === "today-ai" ? todayAiWords : cardScope === "favorites"
    ? allWords.filter((item) => favoriteIds.has(item.id))
    : dateWords
  const filteredWords = useMemo(() => sourceWords.filter((item) => {
    if (cardScope === "today-ai" || subjectFilter === "__all__") return true
    return item.subjectId === subjectFilter ||
      (!item.subjectId && item.subject === subjects.find((subject) => subject.id === subjectFilter)?.name)
  }), [sourceWords, cardScope, subjectFilter, subjects])
  const safeIndex = filteredWords.length ? currentIndex % filteredWords.length : 0
  const current = filteredWords[safeIndex]
  const isFavorite = current ? favoriteIds.has(current.id) : false

  useEffect(() => {
    if (cardScope !== "today-ai" || viewMode !== "card" || !aiBundle || aiBundle.status === "completed" || !current?.aiBundleItemId) return
    const side = isFlipped ? "back" : "front"
    const key = aiBundle.id + ":" + current.aiBundleItemId + ":" + side
    if (recordedSides.current.has(key)) return
    recordedSides.current.add(key)
    void recordChildAiVocabularyCardView(aiBundle.id, current.aiBundleItemId, side)
      .then((result) => { if (result.cardsCompleted) setBundleCardsComplete(true) })
      .catch((cause) => {
        recordedSides.current.delete(key)
        setError(cause instanceof Error ? cause.message : "카드 확인 상태를 저장하지 못했어요.")
      })
  }, [cardScope, viewMode, aiBundle, current?.aiBundleItemId, isFlipped])

  function changeFilter(nextSubject: string) {
    setSubjectFilter(nextSubject)
    setCurrentIndex(0)
    setIsFlipped(false)
    setError("")
  }

  function move(step: number) {
    if (!filteredWords.length) return
    setSlideDirection(step > 0 ? "next" : "previous")
    setSlideKey((value) => value + 1)
    setCurrentIndex((value) => (value + step + filteredWords.length) % filteredWords.length)
    setIsFlipped(false)
    setError("")
  }

  function changeScope(nextScope: "date" | "favorites" | "today-ai") {
    setCardScope(nextScope)
    setSubjectFilter("__all__")
    setCurrentIndex(0)
    setIsFlipped(false)
    setViewMode("card")
    setError("")
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    pointerStart.current = { x: event.clientX, y: event.clientY }
    suppressClick.current = false
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    const start = pointerStart.current
    pointerStart.current = null
    if (!start || event.pointerType === "mouse") return
    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return
    suppressClick.current = true
    move(deltaX < 0 ? 1 : -1)
  }

  function handleCardKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1) }
    else if (event.key === "ArrowRight") { event.preventDefault(); move(1) }
    else if (event.key === " " || event.key === "Enter") { event.preventDefault(); setIsFlipped((value) => !value) }
  }

  function toggleFavorite() {
    if (!current || isPending) return
    setError("")
    startTransition(async () => {
      try {
        const result = await toggleChildWordFavorite(current.id)
        setFavoriteIds((existing) => {
          const next = new Set(existing)
          if (result.isFavorite) next.add(current.id)
          else next.delete(current.id)
          return next
        })
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "즐겨찾기를 변경하지 못했어요.")
      }
    })
  }

  return (
    <section className="min-w-0 space-y-4 rounded-2xl border border-border bg-card p-3 sm:p-4 lg:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">단어 카드</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">카드를 눌러 뜻과 예문을 확인해 보세요.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <label className="flex items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 py-2 text-xs font-semibold text-muted-foreground">
            <Volume2 className="size-3.5" />
            <span>음성</span>
            <select aria-label="단어 카드 음성 선택" value={ttsVoice} onChange={(event) => onTtsVoiceChange(event.target.value)} className="max-w-[120px] bg-transparent text-xs font-bold text-foreground outline-none">
              <option value="en-US-AnaNeural">어린이 목소리</option>
              <option value="en-US-JennyNeural">여성 목소리</option>
              <option value="en-US-GuyNeural">남성 목소리</option>
              <option value="en-US-AriaNeural">표준 목소리</option>
            </select>
          </label>
          <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode((value) => value === "card" ? "list" : "card")} className={viewMode === "list" ? "inline-flex items-center gap-1.5 rounded-xl border border-primary bg-primary-container px-3 py-2 text-xs font-semibold text-primary-container-foreground" : "inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground"}>
            <List className="size-3.5" /> {viewMode === "list" ? "카드 보기" : "전체 목록"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <HapticButton type="button" onClick={() => changeScope("date")} className={cardScope === "date" ? "rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold text-muted-foreground"}>날짜별 카드</HapticButton>
        <HapticButton type="button" onClick={() => changeScope("favorites")} className={cardScope === "favorites" ? "rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold text-muted-foreground"}><Star className="mr-1 inline size-3.5" /> 즐겨찾기</HapticButton>
        {aiBundle && <HapticButton type="button" onClick={() => changeScope("today-ai")} className={cardScope === "today-ai" ? "rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground" : "rounded-xl border border-border bg-muted px-3 py-2 text-xs font-bold text-muted-foreground"}>오늘의 AI 추천</HapticButton>}
      </div>
      {cardScope !== "today-ai" && <div className="flex gap-2 overflow-x-auto pb-1">
        <HapticButton type="button" onClick={() => changeFilter("__all__")} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${subjectFilter === "__all__" ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-muted-foreground"}`}>전체</HapticButton>
        {subjects.map((subject) => (
          <HapticButton key={subject.id} type="button" onClick={() => changeFilter(subject.id)} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${subjectFilter === subject.id ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-muted-foreground"}`}>{subject.name}</HapticButton>
        ))}
      </div>}

      {viewMode === "list" && filteredWords.length > 0 ? (
        <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
          {filteredWords.map((item, index) => (
            <div key={item.id} className="space-y-1.5">
              <button type="button" onClick={() => { setCurrentIndex(index); setIsFlipped(false); setViewMode("card") }} className="w-full rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{item.word}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{item.meaning}{item.disambiguation ? " (" + item.disambiguation + ")" : ""}</span>
                    {item.example && <span className="mt-1 block text-xs text-muted-foreground">{item.example}</span>}
                  </span>
                  {favoriteIds.has(item.id) && <Star className="size-4 shrink-0 fill-amber-500 text-amber-500" aria-label="즐겨찾기" />}
                </span>
              </button>
              {item.sourceName && item.sourceEntryUrl && (
                <p className="px-2 text-[11px] leading-relaxed text-muted-foreground">
                  출처: {item.sourceName} · <a href={item.sourceEntryUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">원문 Wiktionary</a>{item.licenseName ? " · " + item.licenseName : ""}
                  {item.licenseUrl && <> · <a href={item.licenseUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">라이선스</a></>}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : !current ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-12 text-center">
          <Bookmark className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-semibold">{cardScope === "favorites" ? "즐겨찾기한 표현이 아직 없어요." : "아직 카드로 볼 표현이 없어요."}</p>
          <p className="mt-1 text-sm text-muted-foreground">{cardScope === "favorites" ? "날짜별 카드에서 별표를 눌러 모아 보세요." : "선택한 날짜에 등록된 단어가 이곳에 모여요."}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{current.subject}{cardScope === "date" ? " · " + selectedDate : ""}</span>
            <span>{safeIndex + 1} / {filteredWords.length}</span>
          </div>
          <div key={slideKey} className={slideDirection === "next" ? "flashcard-slide-next" : slideDirection === "previous" ? "flashcard-slide-previous" : ""}>
            <button
              type="button"
              onClick={() => { if (suppressClick.current) { suppressClick.current = false; return } setIsFlipped((value) => !value) }}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => { pointerStart.current = null }}
              onKeyDown={handleCardKeyDown}
              aria-label={isFlipped ? "영어 표현 앞면으로 뒤집기" : "뜻과 예문 뒷면 보기"}
              className="flashcard-perspective min-h-[260px] w-full touch-pan-y rounded-3xl text-center sm:min-h-[300px]"
            >
              <span className={isFlipped ? "flashcard-inner is-flipped" : "flashcard-inner"}>
                <span className="flashcard-face flex flex-col items-center justify-center rounded-3xl border border-border bg-muted/45 px-5 py-8 hover:bg-muted/70">
                  <span className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">영어 표현</span>
                  <span className="text-3xl font-black tracking-tight sm:text-4xl">{current.word}</span>
                  <span className="mt-6 text-xs text-muted-foreground">탭하면 뜻과 예문을 확인할 수 있어요</span>
                </span>
                <span className="flashcard-face flashcard-back flex flex-col items-center justify-center rounded-3xl border border-border bg-muted/45 px-5 py-8">
                  <span className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">뜻과 예문</span>
                  <span className="text-2xl font-black">{current.meaning}{current.disambiguation ? ` (${current.disambiguation})` : ""}</span>
                  {current.example && <span className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">{current.example}</span>}
                  <span className="mt-6 text-xs text-muted-foreground">탭하면 영어 표현으로 돌아가요</span>
                </span>
              </span>
            </button>
          </div>
          {current.sourceName && current.sourceEntryUrl && (
            <p className="px-1 text-center text-[11px] leading-relaxed text-muted-foreground">
              출처: {current.sourceName} · <a href={current.sourceEntryUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">원문 Wiktionary</a>{current.licenseName ? " · " + current.licenseName : ""}
              {current.licenseUrl && <> · <a href={current.licenseUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">라이선스</a></>}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <HapticButton type="button" onClick={() => move(-1)} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold"><ChevronLeft className="size-4" /> 이전</HapticButton>
            <div className="flex items-center gap-2">
              <HapticButton type="button" onClick={() => onSpeak(current.word)} aria-label="영어 표현 발음 듣기" className="flex size-11 items-center justify-center rounded-xl border border-border text-muted-foreground"><Volume2 className="size-5" /></HapticButton>
              <HapticButton type="button" disabled={isPending} onClick={toggleFavorite} aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"} className={`flex size-11 items-center justify-center rounded-xl border ${isFavorite ? "border-amber-300 bg-amber-50 text-amber-600 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300" : "border-border text-muted-foreground"}`}>
                <Star className={`size-5 ${isFavorite ? "fill-current" : ""}`} />
              </HapticButton>
              <HapticButton type="button" onClick={() => setIsFlipped((value) => !value)} aria-label="카드 뒤집기" className="flex size-11 items-center justify-center rounded-xl border border-border text-muted-foreground"><RotateCcw className="size-5" /></HapticButton>
            </div>
            <HapticButton type="button" onClick={() => move(1)} className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold">다음 <ChevronRight className="size-4" /></HapticButton>
          </div>
        </>
      )}
      {cardScope === "today-ai" && bundleCardsComplete && aiBundle?.status !== "completed" && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
          {quizPromptDismissed ? (
            <HapticButton type="button" onClick={onStartAiQuiz} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">{aiBundle?.status === "quiz_in_progress" ? "오늘의 확인 퀴즈 이어하기" : "오늘의 확인 퀴즈 시작"}</HapticButton>
          ) : (
            <>
              <p className="text-sm font-bold">{aiBundle?.status === "quiz_in_progress" ? "아직 끝나지 않은 오늘의 확인 퀴즈가 있어요. 이어서 풀어볼까요?" : "오늘의 단어 카드 학습 완료! 이제 간단한 확인 퀴즈를 풀어볼까요? 퀴즈까지 마치면 오늘의 학습이 완료돼요."}</p>
              <div className="grid grid-cols-2 gap-2">
                <HapticButton type="button" onClick={onStartAiQuiz} className="rounded-xl bg-primary px-3 py-3 text-sm font-bold text-primary-foreground">{aiBundle?.status === "quiz_in_progress" ? "퀴즈 이어하기" : "오늘의 확인 퀴즈 시작"}</HapticButton>
                <HapticButton type="button" onClick={() => setQuizPromptDismissed(true)} className="rounded-xl border border-border px-3 py-3 text-sm font-semibold text-muted-foreground">나중에 풀기</HapticButton>
              </div>
            </>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
