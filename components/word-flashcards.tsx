"use client"

import { useMemo, useState, useTransition } from "react"
import { Bookmark, ChevronLeft, ChevronRight, RotateCcw, Star, Volume2 } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"
import { toggleChildWordFavorite } from "@/app/actions/child-words"

type FlashcardWord = {
  id: number
  subjectId: string | null
  subject: string
  word: string
  meaning: string
  example: string | null
  disambiguation?: string | null
  lexicalType?: string
}

type FlashcardSubject = { id: string; name: string; color: string }

export function WordFlashcards({
  words,
  subjects,
  initialFavoriteWordIds,
  onSpeak,
}: {
  words: FlashcardWord[]
  subjects: FlashcardSubject[]
  initialFavoriteWordIds: number[]
  onSpeak: (text: string) => void
}) {
  const [subjectFilter, setSubjectFilter] = useState("__all__")
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(() => new Set(initialFavoriteWordIds))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  const filteredWords = useMemo(() => words.filter((item) => {
    const matchesSubject = subjectFilter === "__all__" ||
      item.subjectId === subjectFilter ||
      (!item.subjectId && item.subject === subjects.find((subject) => subject.id === subjectFilter)?.name)
    const matchesFavorite = !favoritesOnly || favoriteIds.has(item.id)
    return matchesSubject && matchesFavorite
  }), [words, subjectFilter, favoritesOnly, favoriteIds, subjects])

  const safeIndex = filteredWords.length ? currentIndex % filteredWords.length : 0
  const current = filteredWords[safeIndex]
  const isFavorite = current ? favoriteIds.has(current.id) : false

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
        <button type="button" aria-pressed={favoritesOnly} onClick={() => { setFavoritesOnly((value) => !value); setCurrentIndex(0); setIsFlipped(false) }} className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold ${favoritesOnly ? "border-primary bg-primary-container text-primary-container-foreground" : "border-border bg-background text-muted-foreground"}`}>
          <Star className="size-3.5" /> 즐겨찾기 {favoritesOnly ? "보기" : "모아보기"}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <HapticButton type="button" onClick={() => changeFilter("__all__")} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${subjectFilter === "__all__" ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-muted-foreground"}`}>전체</HapticButton>
        {subjects.map((subject) => (
          <HapticButton key={subject.id} type="button" onClick={() => changeFilter(subject.id)} className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${subjectFilter === subject.id ? "bg-primary text-primary-foreground" : "border border-border bg-muted text-muted-foreground"}`}>{subject.name}</HapticButton>
        ))}
      </div>

      {!current ? (
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
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </section>
  )
}
