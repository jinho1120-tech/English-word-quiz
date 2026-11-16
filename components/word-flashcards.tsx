"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
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
  aiBundleItemId?: string
}

type FlashcardSubject = { id: string; name: string; color: string }
type AiBundle = {
  id: string
  status: string
  items: { id: string; wordEntryId: number | null; lexicalType: string; expressionSnapshot: string; meaningSnapshot: string; exampleSnapshot: string | null; frontViewedAt: Date | null; backViewedAt: Date | null }[]
}

export function WordFlashcards({
  words,
  subjects,
  initialFavoriteWordIds,
  onSpeak,
  aiBundle,
  onStartAiQuiz,
}: {
  words: FlashcardWord[]
  subjects: FlashcardSubject[]
  initialFavoriteWordIds: number[]
  onSpeak: (text: string) => void
  aiBundle: AiBundle | null
  onStartAiQuiz: () => void
}) {
  const [subjectFilter, setSubjectFilter] = useState("__all__")
  const [cardScope, setCardScope] = useState<"all" | "today-ai">("all")
  const [quizPromptDismissed, setQuizPromptDismissed] = useState(false)
  const [bundleCardsComplete, setBundleCardsComplete] = useState(Boolean(aiBundle && aiBundle.items.length > 0 && aiBundle.items.every((item) => item.frontViewedAt && item.backViewedAt)))
  const recordedSides = useRef(new Set<string>())
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [viewMode, setViewMode] = useState<"card" | "list">("card")
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(() => new Set(initialFavoriteWordIds))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const todayAiWords = useMemo(() => (aiBundle?.items ?? [])
    .filter((item) => item.wordEntryId !== null)
    .map((item) => ({
      id: item.wordEntryId as number,
      subjectId: null,
      subject: "오늘의 AI 추천",
      word: item.expressionSnapshot,
      meaning: item.meaningSnapshot,
      example: item.exampleSnapshot,
      disambiguation: null,
      lexicalType: item.lexicalType,
      aiBundleItemId: item.id,
    })), [aiBundle])
  const sourceWords = cardScope === "today-ai" ? todayAiWords : words
  const filteredWords = useMemo(() => sourceWords.filter((item) => {
    const matchesSubject = cardScope === "today-ai" || subjectFilter === "__all__" ||
      item.subjectId === subjectFilter ||
      (!item.subjectId && item.subject === subjects.find((subject) => subject.id === subjectFilter)?.name)
    const matchesFavorite = !favoritesOnly || favoriteIds.has(item.id)
    return matchesSubject && matchesFavorite
  }), [sourceWords, cardScope, subjectFilter, favoritesOnly, favoriteIds, subjects])

  const safeIndex = filteredWords.length ? currentIndex % filteredWords.length : 0
  const current = filteredWords[safeIndex]
  const isFavorite = current ? favoriteIds.has(current.id) : false

  useEffect(() => {
    if (cardScope !== "today-ai" || viewMode !== "card" || !aiBundle || !current?.aiBundleItemId) return
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
    setCurrentIndex((value) => (value + step + filteredWords.length) % filteredWords.length)
    setIsFlipped(false)
    setError("")
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
          <button type="button" aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((value) => !value); setCurrentIndex(0); setIsFlipped(false) }} className={favoritesOnly ? "inline-flex items-center gap-1.5 rounded-xl border border-primary bg-primary-container px-3 py-2 text-xs font-semibold text-primary-container-foreground" : "inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground"}>
            <Star className="size-3.5" /> 즐겨찾기
          </button>
          <button type="button" aria-pressed={viewMode === "list"} onClick={() => setViewMode((value) => value === "card" ? "list" : "card")} className={viewMode === "list" ? "inline-flex items-center gap-1.5 rounded-xl border border-primary bg-primary-container px-3 py-2 text-xs font-semibold text-primary-container-foreground" : "inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground"}>
            <List className="size-3.5" /> {viewMode === "list" ? "카드 보기" : "전체 목록"}
          </button>
        </div>
      </div>

      {aiBundle && (
        <div className="flex gap-2">
          <HapticButton type="button" onClick={() => { setCardScope("all"); setCurrentIndex(0); setIsFlipped(false); changeFilter("__all__") }} className={cardScope === "all" ? "rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground" : "rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground"}>전체 과목</HapticButton>
          <HapticButton type="button" onClick={() => { setCardScope("today-ai"); setSubjectFilter("__all__"); setCurrentIndex(0); setIsFlipped(false); setError("") }} className={cardScope === "today-ai" ? "rounded-xl bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground" : "rounded-xl border border-border bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground"}>오늘의 AI 추천</HapticButton>
        </div>
      )}
      <div className="flex gap-2 overflow-x-auto pb-1">
        <HapticButton type="button" onClick={() => changeFilter("__all__")} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${subjectFilter === "__all__" ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-muted-foreground"}`}>전체</HapticButton>
        {subjects.map((subject) => (
          <HapticButton key={subject.id} type="button" onClick={() => changeFilter(subject.id)} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${subjectFilter === subject.id ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-muted-foreground"}`}>{subject.name}</HapticButton>
        ))}
      </div>

      {viewMode === "list" && filteredWords.length > 0 ? (
        <div className="max-h-[65vh] space-y-2 overflow-y-auto pr-1">
          {filteredWords.map((item, index) => (
            <button key={item.id} type="button" onClick={() => { setCurrentIndex(index); setIsFlipped(false); setViewMode("card") }} className="w-full rounded-xl border border-border bg-background p-3 text-left transition-colors hover:bg-muted/50">
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{item.word}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{item.meaning}{item.disambiguation ? " (" + item.disambiguation + ")" : ""}</span>
                  {item.example && <span className="mt-1 block text-xs text-muted-foreground">{item.example}</span>}
                </span>
                {favoriteIds.has(item.id) && <Star className="size-4 shrink-0 fill-amber-500 text-amber-500" aria-label="즐겨찾기" />}
              </span>
            </button>
          ))}
        </div>
      ) : !current ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-4 py-12 text-center">
          <Bookmark className="mx-auto mb-3 size-8 text-muted-foreground" />
          <p className="font-semibold">{favoritesOnly ? "즐겨찾기한 표현이 아직 없어요." : "아직 카드로 볼 표현이 없어요."}</p>
          <p className="mt-1 text-sm text-muted-foreground">{favoritesOnly ? "카드 오른쪽 위 별표를 눌러 모아 보세요." : "부모님이나 내가 등록한 단어가 이곳에 모여요."}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{current.subject}</span>
            <span>{safeIndex + 1} / {filteredWords.length}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsFlipped((value) => !value)}
            aria-label={isFlipped ? "영어 표현 앞면으로 뒤집기" : "뜻과 예문 뒷면 보기"}
            className="flex min-h-[260px] w-full flex-col items-center justify-center rounded-3xl border border-border bg-muted/45 px-5 py-8 text-center transition-colors hover:bg-muted/70 sm:min-h-[300px]"
          >
            {isFlipped ? (
              <>
                <span className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">뜻과 예문</span>
                <span className="text-2xl font-black">{current.meaning}{current.disambiguation ? ` (${current.disambiguation})` : ""}</span>
                {current.example && <span className="mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground">{current.example}</span>}
                <span className="mt-6 text-xs text-muted-foreground">탭하면 영어 표현으로 돌아가요</span>
              </>
            ) : (
              <>
                <span className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">영어 표현</span>
                <span className="text-3xl font-black tracking-tight sm:text-4xl">{current.word}</span>
                <span className="mt-6 text-xs text-muted-foreground">탭하면 뜻과 예문을 확인할 수 있어요</span>
              </>
            )}
          </button>
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
      {cardScope === "today-ai" && bundleCardsComplete && (
        <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
          {quizPromptDismissed ? (
            <HapticButton type="button" onClick={onStartAiQuiz} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">오늘의 확인 퀴즈 시작</HapticButton>
          ) : (
            <>
              <p className="text-sm font-bold">오늘의 단어 카드 학습 완료! 이제 간단한 확인 퀴즈를 풀어볼까요? 퀴즈까지 마치면 오늘의 학습이 완료돼요.</p>
              <div className="grid grid-cols-2 gap-2">
                <HapticButton type="button" onClick={onStartAiQuiz} className="rounded-xl bg-primary px-3 py-3 text-sm font-bold text-primary-foreground">오늘의 확인 퀴즈 시작</HapticButton>
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
