"use client"

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { GraduationCap, Ghost, Pencil, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { WordStorageCalendar } from "@/components/word-storage-calendar"
import { WordQuiz, type QuizWord } from "@/components/word-quiz"
import { HapticButton } from "@/components/haptic-button"
import { PacmanGame } from "@/components/arcade/pacman-game"
import { WordDefenseGame } from "@/components/arcade/word-defense-game"
import { addChildWord, addChildWordsBulk, scanChildWordsImage, deleteChildWord, clearChildWords, updateChildWord, recordChildQuizResult, gradeChildListeningAnswer, getChildAzureSpeechToken, startChildPacmanGame } from "@/app/actions/child-words"

type Subject = { id: string; name: string; color: string }
type Word = { id: number; subjectId: string | null; subject: string; word: string; meaning: string; example: string | null; wrongCount: number }

const TTS_VOICES = [
  { id: "en-US-AnaNeural", label: "어린이 목소리" },
  { id: "en-US-JennyNeural", label: "여성 목소리" },
  { id: "en-US-GuyNeural", label: "남성 목소리" },
  { id: "en-US-AriaNeural", label: "표준 목소리" },
]

export function ChildLearning({
  pacmanStatus,
  childName,
  subjects,
  initialWords,
  allWords,
  wrongWords,
  initialDate,
  initialStorage,
}: {
  pacmanStatus: { showPacman: boolean; showWordDefense: boolean; enabled: boolean; dailyPlayLimit: number; unlimitedPlays: boolean; remainingPlays: number; playsUsed: number; dailyQuestionCount: number; minDailyQuestions: number; outstandingWrongCount: number; requireNoWrongWords: boolean; eligible: boolean }
  childName: string
  subjects: Subject[]
  initialStorage: { date: string; subjectId: string | null; subject: string }[]
  initialWords: Word[]
  allWords: Word[]
  wrongWords: Word[]
  initialDate: string
}) {
  const router = useRouter()
  const [date, setDate] = useState(initialDate)
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "")
  const [word, setWord] = useState("")
  const [meaning, setMeaning] = useState("")
  const [example, setExample] = useState("")
  const [aiWords, setAiWords] = useState<{ word: string; meaning: string; example: string }[]>([])
  const [bulkText, setBulkText] = useState("")
  const [isBulkMode, setIsBulkMode] = useState(false)
  const [managerFilterSubjectId, setManagerFilterSubjectId] = useState("__all__")
  const [isScanning, setIsScanning] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSubjectId, setEditSubjectId] = useState("")
  const [editWord, setEditWord] = useState("")
  const [editMeaning, setEditMeaning] = useState("")
  const [editExample, setEditExample] = useState("")
  const [error, setError] = useState("")
  const [quizIndex, setQuizIndex] = useState(0)
  const [quizRevealed, setQuizRevealed] = useState(false)
  const [quizMode, setQuizMode] = useState(false)
  const [quizType, setQuizType] = useState<"standard" | "listening">("standard")
  const [quizAnswer, setQuizAnswer] = useState("")
  const [quizMeaningAnswer, setQuizMeaningAnswer] = useState("")
  const [quizHintUsed, setQuizHintUsed] = useState(false)
  const [quizSessionId, setQuizSessionId] = useState("")
  const [quizSessionResult, setQuizSessionResult] = useState<{ total: number; correct: number; score: number; rewardTitle: string | null } | null>(null)
  const [quizAiFeedback, setQuizAiFeedback] = useState("")
  const [quizFeedback, setQuizFeedback] = useState<"correct" | "wrong" | null>(null)
  const [ttsVoice, setTtsVoice] = useState("en-US-AnaNeural")
  const [isSlowMode, setIsSlowMode] = useState(false)
  const ttsCacheRef = useRef(new Map<string, string>())
  const activeAudioRef = useRef<HTMLAudioElement | null>(null)
  const [reviewMode, setReviewMode] = useState<"daily" | "wrong">("daily")
  const [activeTab, setActiveTab] = useState<"daily" | "wrong" | "manage">("daily")
  const [isPacmanOpen, setIsPacmanOpen] = useState(false)
  const [isWordDefenseOpen, setIsWordDefenseOpen] = useState(false)
  const [pacmanRemainingPlays, setPacmanRemainingPlays] = useState(pacmanStatus.remainingPlays)
  const [pacmanError, setPacmanError] = useState("")
  const [filterSubjectId, setFilterSubjectId] = useState("")
  const [calendarRefreshVersion, setCalendarRefreshVersion] = useState(0)
  const [isPending, startTransition] = useTransition()

  async function playPronunciation(targetText: string) {
    const cleanText = targetText.replace(/\s*\/\s*/g, " ").trim()
    if (!cleanText) return
    try {
      if (activeAudioRef.current) {
        activeAudioRef.current.pause()
        activeAudioRef.current.currentTime = 0
      }
      if ("speechSynthesis" in window) window.speechSynthesis.cancel()

      const cacheKey = `${cleanText}_${ttsVoice}_${isSlowMode ? "slow" : "normal"}`
      const playUrl = async (url: string) => {
        const audio = activeAudioRef.current ?? new Audio()
        activeAudioRef.current = audio
        audio.src = url
        try { await audio.play() }
        catch { fallbackTTS(cleanText) }
      }
      const cached = ttsCacheRef.current.get(cacheKey)
      if (cached) { await playUrl(cached); return }

      const token = await getChildAzureSpeechToken()
      if (!token.success || !token.token || !token.region) {
        fallbackTTS(cleanText)
        return
      }

      const sdk = await import("microsoft-cognitiveservices-speech-sdk")
      const speechConfig = sdk.SpeechConfig.fromAuthorizationToken(token.token, token.region)
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Riff24Khz16BitMonoPcm
      const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null)
      const safeText = cleanText.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      const speedRate = isSlowMode ? "-20%" : "0%"
      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="${ttsVoice}"><prosody rate="${speedRate}">${safeText}</prosody></voice></speak>`

      await new Promise<void>((resolve) => {
        synthesizer.speakSsmlAsync(ssml, async (result) => {
          synthesizer.close()
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            const url = URL.createObjectURL(new Blob([result.audioData], { type: "audio/wav" }))
            ttsCacheRef.current.set(cacheKey, url)
            await playUrl(url)
          } else {
            fallbackTTS(cleanText)
          }
          resolve()
        }, (error) => {
          console.error("Azure 음성 합성 오류:", error)
          synthesizer.close()
          fallbackTTS(cleanText)
          resolve()
        })
      })
    } catch (error) {
      console.error("단어 발음 재생 오류:", error)
      fallbackTTS(cleanText)
    }
  }

  function fallbackTTS(text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "en-US"
    utterance.rate = isSlowMode ? 0.75 : 0.9
    window.speechSynthesis.speak(utterance)
  }

  const reservePacmanPlay = useCallback(async () => {
    setPacmanError("")
    try {
      const result = await startChildPacmanGame()
      setPacmanRemainingPlays(result.remainingPlays)
      return true
    } catch (err) {
      setPacmanError(err instanceof Error ? err.message : "게임을 시작하지 못했어요.")
      return false
    }
  }, [])

  const handlePacmanGameOver = useCallback(() => {}, [])

  function run(action: () => Promise<unknown>) {
    setError("")
    startTransition(async () => {
      try {
        await action()
        setCalendarRefreshVersion((version) => version + 1)
        router.refresh()
      }
      catch (err) { setError(err instanceof Error ? err.message : "요청을 처리하지 못했습니다.") }
    })
  }

  function add() {
    if (!subjectId) { setError("부모에게 과목을 먼저 등록해 달라고 요청하세요."); return }
    run(async () => {
      await addChildWord({ date, subjectId, word, meaning, example })
      setWord(""); setMeaning(""); setExample("")
    })
  }

  function beginEdit(item: Word) {
    setEditingId(item.id)
    setEditSubjectId(item.subjectId ?? subjects.find((s) => s.name === item.subject)?.id ?? subjects[0]?.id ?? "")
    setEditWord(item.word); setEditMeaning(item.meaning); setEditExample(item.example ?? "")
  }

  function saveEdit(id: number) {
    run(async () => {
      await updateChildWord(id, { subjectId: editSubjectId, word: editWord, meaning: editMeaning, example: editExample })
      setEditingId(null)
    })
  }

  function saveBulkWords() {
    if (!subjectId) { setError("부모에게 과목을 먼저 등록해 달라고 요청하세요."); return }
    const parsed = bulkText.split(/\r?\n/).map((line) => {
      const parts = line.includes("|") ? line.split("|") : line.includes("\t") ? line.split("\t") : line.split(",")
      return { word: (parts[0] ?? "").trim(), meaning: (parts[1] ?? "").trim(), example: (parts[2] ?? "").trim() }
    }).filter((item) => item.word && item.meaning)
    if (!parsed.length) { setError("단어와 뜻을 구분해 입력해 주세요. 예: apple | 사과 | I eat an apple."); return }
    if (parsed.length > 100) { setError("한 번에 최대 100개까지 등록할 수 있어요."); return }
    run(async () => {
      await addChildWordsBulk({ date, subjectId, words: parsed })
      setBulkText("")
      setIsBulkMode(false)
    })
  }

  const sourceWords = reviewMode === "wrong" ? wrongWords : initialWords
  const visibleWords = sourceWords.filter((item) => !filterSubjectId || item.subjectId === filterSubjectId || (!item.subjectId && item.subject === subjects.find((s) => s.id === filterSubjectId)?.name))
  const managerSubjectFilter = managerFilterSubjectId === "__all__" ? "" : managerFilterSubjectId
  const managerWords = initialWords.filter((item) => !managerSubjectFilter || item.subjectId === managerSubjectFilter || (!item.subjectId && item.subject === subjects.find((s) => s.id === managerSubjectFilter)?.name))
  const quizWord = visibleWords.length ? visibleWords[quizIndex % visibleWords.length] : null

  useEffect(() => {
    const savedVoice = window.localStorage.getItem("word_quiz_tts_voice")
    if (savedVoice && TTS_VOICES.some((voice) => voice.id === savedVoice)) setTtsVoice(savedVoice)
  }, [])

  useEffect(() => {
    if (quizMode && quizType === "listening" && quizWord && !quizFeedback) {
      void playPronunciation(quizWord.word)
    }
  }, [quizMode, quizType, quizWord?.id, quizIndex])


  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:items-start lg:gap-5">
      <section className="space-y-2 sm:space-y-3 lg:col-start-1 lg:row-start-1">
        <WordStorageCalendar selectedDate={date} subjects={subjects} initialStorage={initialStorage} refreshKey={calendarRefreshVersion} onSelectDate={(nextDate) => { setDate(nextDate); router.push("/child?date=" + nextDate) }} />
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-muted/50 p-1 sm:gap-1.5 sm:p-1.5">
          <HapticButton
            hapticLabel="날짜별 퀴즈 탭"
            onClick={() => { setActiveTab("daily"); setReviewMode("daily"); setQuizMode(false); setQuizIndex(0); setQuizFeedback(null) }}
            wrapperClassName="relative flex h-full"
            className={`w-full h-full flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 sm:gap-1 sm:py-2.5 text-[11px] sm:text-sm font-semibold transition-colors ${activeTab === "daily" ? "bg-primary-container text-primary-container-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"}`}
          >
            <GraduationCap className={`size-5 shrink-0 ${activeTab === "daily" ? "animate-tab-pulse" : ""}`} style={activeTab === "daily" ? { color: "var(--child-accent, #2563eb)" } : undefined} /> <span>날짜별 퀴즈</span>
          </HapticButton>
          <HapticButton
            hapticLabel="오답 몬스터 탭"
            onClick={() => { setActiveTab("wrong"); setReviewMode("wrong"); setQuizMode(false); setQuizIndex(0); setQuizFeedback(null) }}
            wrapperClassName="relative flex h-full"
            className={`w-full h-full flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 sm:gap-1 sm:py-2.5 text-[11px] sm:text-sm font-semibold transition-colors ${activeTab === "wrong" ? "bg-primary-container text-primary-container-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"}`}
          >
            <Ghost className={`size-5 shrink-0 ${activeTab === "wrong" ? "animate-monster-hop" : ""}`} style={activeTab === "wrong" ? { color: "var(--child-accent, #2563eb)" } : undefined} />
            <span>오답 몬스터</span>
          </HapticButton>
          <HapticButton
            hapticLabel="단어 입력 탭"
            onClick={() => { setActiveTab("manage"); setQuizMode(false); setQuizIndex(0); setQuizFeedback(null) }}
            wrapperClassName="relative flex h-full"
            className={`w-full h-full flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 sm:gap-1 sm:py-2.5 text-[11px] sm:text-sm font-semibold transition-colors ${activeTab === "manage" ? "bg-primary-container text-primary-container-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"}`}
          >
            <Pencil className={`size-5 shrink-0 ${activeTab === "manage" ? "animate-pencil-write" : ""}`} style={activeTab === "manage" ? { color: "var(--child-accent, #2563eb)" } : undefined} /> <span>단어 입력</span>
          </HapticButton>
        </div>
        {activeTab !== "manage" && <div className="flex gap-2 overflow-x-auto pb-1">
          <HapticButton type="button" onClick={() => setFilterSubjectId("")} className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold ${!filterSubjectId ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-muted text-muted-foreground"}`}>전체</HapticButton>
          {subjects.map((subject) => <HapticButton type="button" key={subject.id} onClick={() => setFilterSubjectId(subject.id)} className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold ${filterSubjectId === subject.id ? "bg-primary text-primary-foreground shadow-sm" : "border border-border bg-muted text-muted-foreground"}`}>{subject.name}</HapticButton>)}
        </div>}
      </section>

      {activeTab === "manage" && <div className="space-y-6 lg:col-span-2">
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h2 className="font-bold">AI 단어 입력</h2>
        <p className="text-xs text-muted-foreground">단어장 사진을 올리면 AI가 영어 단어와 뜻을 추출합니다. 저장 전에 내용을 확인하고 수정할 수 있어요.</p>
        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (!file) return
          if (file.size > 7.5 * 1024 * 1024) { setError("이미지는 7.5MB 이하로 올려 주세요."); return }
          setError("")
          setIsScanning(true)
          try {
            const image = new Image()
            const objectUrl = URL.createObjectURL(file)
            image.src = objectUrl
            await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("사진을 읽지 못했습니다.")) })
            URL.revokeObjectURL(objectUrl)
            const canvas = document.createElement("canvas")
            const scale = Math.min(1400 / image.width, 1400 / image.height, 1)
            canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
            const context = canvas.getContext("2d")
            if (!context) throw new Error("사진을 변환하지 못했습니다.")
            context.drawImage(image, 0, 0, canvas.width, canvas.height)
            const dataUrl = canvas.toDataURL("image/jpeg", 0.78)
            const result = await scanChildWordsImage(dataUrl.split(",")[1], "image/jpeg")
            setAiWords(result)
          } catch (err) { setError(err instanceof Error ? err.message : "AI 단어 추출에 실패했습니다.") }
          finally { setIsScanning(false) }
        }} />
        <HapticButton type="button" disabled={isScanning || isPending || !subjectId} onClick={() => imageInputRef.current?.click()} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">{isScanning ? "AI가 사진을 분석하고 있어요..." : "사진에서 AI로 단어 추출"}</HapticButton>
        {aiWords.length > 0 && <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">추출 결과 {aiWords.length}개 · 저장 전 확인</p><HapticButton onClick={() => setAiWords([])} className="text-xs text-muted-foreground">닫기</HapticButton></div>
          {aiWords.map((item, index) => <div key={index} className="grid grid-cols-1 gap-2 rounded-lg bg-muted p-2">
            <input value={item.word} onChange={(event) => setAiWords((items) => items.map((value, i) => i === index ? { ...value, word: event.target.value } : value))} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" aria-label="영어 단어" />
            <input value={item.meaning} onChange={(event) => setAiWords((items) => items.map((value, i) => i === index ? { ...value, meaning: event.target.value } : value))} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" aria-label="단어 뜻" />
            <input value={item.example} onChange={(event) => setAiWords((items) => items.map((value, i) => i === index ? { ...value, example: event.target.value } : value))} placeholder="예문 (선택)" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" aria-label="예문" />
            <HapticButton onClick={() => setAiWords((items) => items.filter((_, i) => i !== index))} className="justify-self-end text-xs text-red-600">제외</HapticButton>
          </div>)}
          <HapticButton disabled={isPending || !aiWords.length || aiWords.some((item) => !item.word.trim() || !item.meaning.trim())} onClick={() => run(async () => { await addChildWordsBulk({ date, subjectId, words: aiWords }); setAiWords([]) })} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">확인한 {aiWords.length}개 단어 저장</HapticButton>
        </div>}
      </section>

      <section className="space-y-4 rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">단어 추가</h2>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            <HapticButton type="button" onClick={() => setIsBulkMode(false)} className={`rounded-lg px-3 py-2 text-xs font-bold ${!isBulkMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>하나씩 입력</HapticButton>
            <HapticButton type="button" onClick={() => setIsBulkMode(true)} className={`rounded-lg px-3 py-2 text-xs font-bold ${isBulkMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>일괄 입력</HapticButton>
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-muted-foreground">저장할 과목</span>
          <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm">
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
        </label>
        {!isBulkMode ? (
          <div className="space-y-3">
            <input value={word} onChange={(event) => setWord(event.target.value)} maxLength={100} placeholder="영어 단어 (예: apple)" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-base" />
            <input value={meaning} onChange={(event) => setMeaning(event.target.value)} maxLength={200} placeholder="뜻 또는 설명" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-base" />
            <input value={example} onChange={(event) => setExample(event.target.value)} maxLength={2000} placeholder="예문 또는 힌트 (선택)" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-base" />
            <HapticButton disabled={isPending || !word.trim() || !meaning.trim() || !subjectId} onClick={add} className="w-full rounded-xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground disabled:opacity-50">단어 추가</HapticButton>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">한 줄에 한 단어씩 입력하세요. 구분자는 |, 탭, 쉼표를 사용할 수 있어요. 예문은 선택입니다.</p>
            <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} rows={7} placeholder={"apple | 사과 | I eat an apple.\nbook | 책\nbeautiful | 아름다운"} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 text-sm leading-relaxed" />
            <HapticButton disabled={isPending || !bulkText.trim() || !subjectId} onClick={saveBulkWords} className="w-full rounded-xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground disabled:opacity-50">일괄 단어 저장</HapticButton>
          </div>
        )}
      </section>

      </div>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {activeTab !== "manage" && (
        <section className="min-w-0 space-y-2 sm:space-y-3 lg:col-start-2 lg:row-start-1">
          <WordQuiz
            key={`child-${activeTab}-${filterSubjectId}-${date}`}
            words={(activeTab === "wrong" ? visibleWords : visibleWords).map((item): QuizWord => ({
              id: item.id,
              word: item.word,
              meaning: item.meaning,
              example: item.example,
              subject: item.subject,
            }))}
            accent="var(--child-accent, #2563eb)"
            isMonsterMode={activeTab === "wrong"}
            childName={childName}
          />
        </section>
      )}
      {activeTab === "wrong" && pacmanStatus.enabled && (pacmanStatus.showPacman || pacmanStatus.showWordDefense) && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4 lg:col-span-2">
          <div className="flex items-center gap-3">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-3xl">🟡</div>
            <div className="min-w-0 flex-1">
              <h3 className="font-bold">보너스 게임</h3>
              <p className="text-xs text-muted-foreground">{pacmanStatus.unlimitedPlays ? "오늘은 무제한으로 이용할 수 있어요" : `오늘 남은 게임 ${pacmanRemainingPlays} / ${pacmanStatus.dailyPlayLimit}판`}</p>
            </div>
          </div>
          {!pacmanStatus.eligible && <div className="rounded-xl bg-muted p-3 text-xs leading-relaxed text-muted-foreground"><p>오늘 푼 단어 문제: <strong>{pacmanStatus.dailyQuestionCount} / {pacmanStatus.minDailyQuestions}개</strong></p>{pacmanStatus.requireNoWrongWords && <p>남은 오답: <strong>{pacmanStatus.outstandingWrongCount}개</strong> · 모두 정리해야 해요.</p>}{pacmanStatus.dailyQuestionCount < pacmanStatus.minDailyQuestions && <p>최소 문제 수를 채우면 보너스 게임이 열려요!</p>}</div>}
          {pacmanError && <p role="alert" className="text-xs text-red-600">{pacmanError}</p>}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {pacmanStatus.showPacman && <HapticButton type="button" disabled={!pacmanStatus.eligible || pacmanRemainingPlays <= 0} onClick={async () => { if (await reservePacmanPlay()) setIsPacmanOpen(true) }} className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-black text-white shadow-sm transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
              팩맨 😮
            </HapticButton>}
            {pacmanStatus.showWordDefense && <HapticButton type="button" disabled={!pacmanStatus.eligible || pacmanRemainingPlays <= 0 || initialWords.length === 0} onClick={async () => { try { const result = await startChildPacmanGame("word_defense"); setPacmanRemainingPlays(result.remainingPlays); setPacmanError(""); setIsWordDefenseOpen(true) } catch (err) { setPacmanError(err instanceof Error ? err.message : "게임을 시작하지 못했어요.") } }} className="w-full rounded-xl bg-sky-500 px-4 py-3 text-sm font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
              영어 타자 디펜스 👻
            </HapticButton>}
          </div>
          <p className="text-[11px] text-muted-foreground">{pacmanStatus.unlimitedPlays
            ? "게임을 무제한으로 이용할 수 있어요. 게임 시작 기록만 저장되고 횟수는 차감되지 않아요."
            : pacmanStatus.showPacman && pacmanStatus.showWordDefense
              ? "두 게임은 오늘의 보너스 게임 횟수를 함께 사용해요. 시작 시 1회 차감되며 중간에 나가도 복구되지 않아요."
              : "오늘의 보너스 게임 이용 횟수를 사용해요. 시작 시 1회 차감되며 중간에 나가도 복구되지 않아요."}</p>
        </section>
      )}
      {isPacmanOpen && (
        <div className="fixed inset-0 z-[120] overflow-y-auto bg-background/95 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto min-h-full w-full max-w-lg rounded-3xl border border-border bg-card p-3 shadow-2xl sm:p-5">
            <div className="mb-3 text-center">
              <h2 className="text-xl font-black">팩맨 아케이드</h2>
              <p className="text-xs text-muted-foreground">방향키 또는 화면 버튼으로 움직여 보세요!</p>
            </div>
            <PacmanGame
              words={initialWords.filter((item) => !filterSubjectId || item.subjectId === filterSubjectId).map((item) => ({ id: item.id, word: item.word, meaning: item.meaning }))}
              extraPlaysLeft={pacmanRemainingPlays}
              dailyPlayLimit={pacmanStatus.dailyPlayLimit}
              unlimitedPlays={pacmanStatus.unlimitedPlays}
              onGameOver={handlePacmanGameOver}
              onReplay={reservePacmanPlay}
              replayError={pacmanError}
              onClose={() => setIsPacmanOpen(false)}
            />
          </div>
        </div>
      )}
      {isWordDefenseOpen && (
        <div className="fixed inset-0 z-[130] overflow-y-auto bg-background/95 p-3 backdrop-blur-sm sm:p-6">
          <div className="mx-auto min-h-full w-full max-w-lg rounded-3xl border border-border bg-card p-3 shadow-2xl sm:p-5">
            <WordDefenseGame
              words={initialWords.filter((item) => !filterSubjectId || item.subjectId === filterSubjectId).map((item) => ({ id: item.id, word: item.word, meaning: item.meaning }))}
              subjectWords={allWords.filter((item) => !filterSubjectId || item.subjectId === filterSubjectId).map((item) => ({ id: item.id, word: item.word, meaning: item.meaning }))}
              allWords={allWords.map((item) => ({ id: item.id, word: item.word, meaning: item.meaning }))}
              onClose={() => setIsWordDefenseOpen(false)}
            />
          </div>
        </div>
      )}
      {activeTab === "manage" && (
      <section className="space-y-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-bold">단어 목록 ({managerWords.length})</h2>
          {managerWords.length > 0 && (
            <HapticButton
              type="button"
              disabled={isPending}
              hapticLabel={managerFilterSubjectId === "__all__" ? "전체 단어 삭제" : "선택 과목 단어 삭제"}
              onClick={() => {
                const scope = managerFilterSubjectId === "__all__" ? "전체 과목" : subjects.find((subject) => subject.id === managerFilterSubjectId)?.name ?? "선택 과목"
                const confirmMessage = managerFilterSubjectId === "__all__"
                  ? `${date}에 등록한 모든 과목의 단어 ${managerWords.length}개를 정말 삭제할까요?`
                  : `${date}에 등록한 [${scope}] 단어 ${managerWords.length}개를 모두 삭제할까요?`
                if (window.confirm(confirmMessage + " 삭제한 단어는 복구할 수 없습니다.")) {
                  run(async () => {
                    const result = await clearChildWords(date, managerFilterSubjectId === "__all__" ? undefined : managerFilterSubjectId)
                    setEditingId(null)
                    setManagerFilterSubjectId("__all__")
                    setError(`단어 ${result.count}개를 삭제했습니다.`)
                  })
                }
              }}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-600 disabled:opacity-40"
            >
              <Trash2 className="size-3.5" /> {managerFilterSubjectId === "__all__" ? "전체 삭제" : "과목 삭제"}
            </HapticButton>
          )}
        </div>
        <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
          <HapticButton
            type="button"
            hapticLabel="전체 과목 목록 필터"
            onClick={() => setManagerFilterSubjectId("__all__")}
            className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold ${managerFilterSubjectId === "__all__" ? "bg-foreground text-background" : "border border-border bg-muted text-muted-foreground"}`}
          >
            전체 <span className="ml-1 rounded-full bg-background/20 px-1.5">{initialWords.length}</span>
          </HapticButton>
          {subjects.map((subject) => {
            const count = initialWords.filter((item) => item.subjectId === subject.id || (!item.subjectId && item.subject === subject.name)).length
            if (!count) return null
            return (
              <HapticButton
                type="button"
                key={subject.id}
                hapticLabel={`${subject.name} 목록 필터`}
                onClick={() => setManagerFilterSubjectId(subject.id)}
                className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold ${managerFilterSubjectId === subject.id ? "bg-foreground text-background" : "border border-border bg-muted text-muted-foreground"}`}
              >
                {subject.name} <span className="ml-1 rounded-full bg-background/20 px-1.5">{count}</span>
              </HapticButton>
            )
          })}
        </div>
        {managerWords.length === 0 && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">이 날짜에 등록된 단어가 없습니다.</p>}
        {managerWords.map((item) => (
          <article key={item.id} className="space-y-2 rounded-xl border border-border p-3">
            {editingId === item.id ? (
              <>
                <select value={editSubjectId} onChange={(event) => setEditSubjectId(event.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm">{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
                <input value={editWord} onChange={(event) => setEditWord(event.target.value)} maxLength={100} className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                <input value={editMeaning} onChange={(event) => setEditMeaning(event.target.value)} maxLength={200} className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                <input value={editExample} onChange={(event) => setEditExample(event.target.value)} maxLength={2000} placeholder="예문" className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                <div className="flex gap-2"><HapticButton disabled={isPending} onClick={() => saveEdit(item.id)} className="text-sm font-bold">저장</HapticButton><HapticButton onClick={() => setEditingId(null)} className="text-sm text-muted-foreground">취소</HapticButton></div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold">{item.word}</p><p className="text-sm text-muted-foreground">{item.meaning}</p>{item.example && <p className="mt-1 text-xs text-muted-foreground">{item.example}</p>}</div><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs">{item.subject}</span></div>
                <div className="flex items-center gap-2"><HapticButton type="button" aria-label="단어 수정" title="수정" disabled={isPending} onClick={() => beginEdit(item)} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"><Pencil className="size-4" /></HapticButton><HapticButton type="button" aria-label="단어 삭제" title="삭제" disabled={isPending} onClick={() => { if (window.confirm("이 단어를 삭제할까요?")) run(() => deleteChildWord(item.id)) }} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="size-4" /></HapticButton>{item.wrongCount > 0 && <span className="text-xs text-muted-foreground">오답 {item.wrongCount}회</span>}</div>
              </>
            )}
          </article>
        ))}
      </section>
      )}
    </div>
  )
}
