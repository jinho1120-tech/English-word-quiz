"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { GraduationCap, Ghost, Pencil } from "lucide-react"
import { useRouter } from "next/navigation"
import { WordStorageCalendar } from "@/components/word-storage-calendar"
import { WordQuiz, type QuizWord } from "@/components/word-quiz"
import { HapticButton } from "@/components/haptic-button"
import { addChildWord, addChildWordsBulk, scanChildWordsImage, deleteChildWord, updateChildWord, recordChildQuizResult, gradeChildListeningAnswer, getChildAzureSpeechToken } from "@/app/actions/child-words"

type Subject = { id: string; name: string; color: string }
type Word = { id: number; subjectId: string | null; subject: string; word: string; meaning: string; example: string | null; wrongCount: number }

const TTS_VOICES = [
  { id: "en-US-AnaNeural", label: "어린이 목소리" },
  { id: "en-US-JennyNeural", label: "여성 목소리" },
  { id: "en-US-GuyNeural", label: "남성 목소리" },
  { id: "en-US-AriaNeural", label: "표준 목소리" },
]

export function ChildLearning({
  childName,
  subjects,
  initialWords,
  wrongWords,
  initialDate,
  initialStorage,
}: {
  childName: string
  subjects: Subject[]
  initialStorage: { date: string; subjectId: string | null; subject: string }[]
  initialWords: Word[]
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
  const [managerFilterSubjectId, setManagerFilterSubjectId] = useState("")
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
  const managerSubjectFilter = managerFilterSubjectId === "__all__" ? "" : managerFilterSubjectId || subjectId
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
    <div className="space-y-5">
      <section className="space-y-3">
        <WordStorageCalendar selectedDate={date} subjects={subjects} initialStorage={initialStorage} refreshKey={calendarRefreshVersion} onSelectDate={(nextDate) => { setDate(nextDate); router.push("/child?date=" + nextDate) }} />
        <div className="grid grid-cols-3 gap-1 sm:gap-1.5 rounded-2xl border border-border bg-muted/50 p-1 sm:p-1.5">
          <HapticButton
            hapticLabel="날짜별 퀴즈 탭"
            onClick={() => { setActiveTab("daily"); setReviewMode("daily"); setQuizMode(false); setQuizIndex(0); setQuizFeedback(null) }}
            wrapperClassName="relative flex h-full"
            className={`w-full h-full flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] sm:text-sm font-semibold transition-colors ${activeTab === "daily" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"}`}
          >
            <GraduationCap className="size-4 shrink-0" /> <span>날짜별 퀴즈</span>
          </HapticButton>
          <HapticButton
            hapticLabel="오답 몬스터 탭"
            onClick={() => { setActiveTab("wrong"); setReviewMode("wrong"); setQuizMode(false); setQuizIndex(0); setQuizFeedback(null) }}
            wrapperClassName="relative flex h-full"
            className={`w-full h-full flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] sm:text-sm font-semibold transition-colors ${activeTab === "wrong" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"}`}
          >
            <Ghost className={`size-4 shrink-0 ${activeTab === "wrong" ? "animate-monster-hop" : ""}`} style={activeTab === "wrong" ? { color: "var(--child-accent, #2563eb)" } : undefined} />
            <span>오답 몬스터</span>
          </HapticButton>
          <HapticButton
            hapticLabel="단어 입력 탭"
            onClick={() => { setActiveTab("manage"); setQuizMode(false); setQuizIndex(0); setQuizFeedback(null) }}
            wrapperClassName="relative flex h-full"
            className={`w-full h-full flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 text-[11px] sm:text-sm font-semibold transition-colors ${activeTab === "manage" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground/80"}`}
          >
            <Pencil className="size-4 shrink-0" /> <span>단어 입력</span>
          </HapticButton>
        </div>
        {activeTab !== "manage" && <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setFilterSubjectId("")} className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold ${!filterSubjectId ? "text-white shadow-sm" : "border border-border bg-muted text-muted-foreground"}`} style={!filterSubjectId ? { backgroundColor: "var(--child-accent, #2563eb)" } : undefined}>전체</button>
          {subjects.map((subject) => <button type="button" key={subject.id} onClick={() => setFilterSubjectId(subject.id)} className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold ${filterSubjectId === subject.id ? "text-white shadow-sm" : "border border-border bg-muted text-muted-foreground"}`} style={filterSubjectId === subject.id ? { backgroundColor: "var(--child-accent, #2563eb)" } : undefined}>{subject.name}</button>)}
        </div>}
      </section>

      {activeTab === "manage" && <div className="space-y-6">
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
        <button type="button" disabled={isScanning || isPending || !subjectId} onClick={() => imageInputRef.current?.click()} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">{isScanning ? "AI가 사진을 분석하고 있어요..." : "사진에서 AI로 단어 추출"}</button>
        {aiWords.length > 0 && <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">추출 결과 {aiWords.length}개 · 저장 전 확인</p><button onClick={() => setAiWords([])} className="text-xs text-muted-foreground">닫기</button></div>
          {aiWords.map((item, index) => <div key={index} className="grid grid-cols-1 gap-2 rounded-lg bg-muted p-2">
            <input value={item.word} onChange={(event) => setAiWords((items) => items.map((value, i) => i === index ? { ...value, word: event.target.value } : value))} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" aria-label="영어 단어" />
            <input value={item.meaning} onChange={(event) => setAiWords((items) => items.map((value, i) => i === index ? { ...value, meaning: event.target.value } : value))} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" aria-label="단어 뜻" />
            <input value={item.example} onChange={(event) => setAiWords((items) => items.map((value, i) => i === index ? { ...value, example: event.target.value } : value))} placeholder="예문 (선택)" className="rounded-md border border-border bg-background px-2 py-1.5 text-sm" aria-label="예문" />
            <button onClick={() => setAiWords((items) => items.filter((_, i) => i !== index))} className="justify-self-end text-xs text-red-600">제외</button>
          </div>)}
          <button disabled={isPending || !aiWords.length || aiWords.some((item) => !item.word.trim() || !item.meaning.trim())} onClick={() => run(async () => { await addChildWordsBulk({ date, subjectId, words: aiWords }); setAiWords([]) })} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">확인한 {aiWords.length}개 단어 저장</button>
        </div>}
      </section>

      <section className="space-y-4 rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-bold">단어 추가</h2>
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
            <button type="button" onClick={() => setIsBulkMode(false)} className={`rounded-lg px-3 py-2 text-xs font-bold ${!isBulkMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>하나씩 입력</button>
            <button type="button" onClick={() => setIsBulkMode(true)} className={`rounded-lg px-3 py-2 text-xs font-bold ${isBulkMode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>일괄 입력</button>
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
            <button disabled={isPending || !word.trim() || !meaning.trim() || !subjectId} onClick={add} className="w-full rounded-xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground disabled:opacity-50">단어 추가</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs leading-relaxed text-muted-foreground">한 줄에 한 단어씩 입력하세요. 구분자는 |, 탭, 쉼표를 사용할 수 있어요. 예문은 선택입니다.</p>
            <textarea value={bulkText} onChange={(event) => setBulkText(event.target.value)} rows={7} placeholder={"apple | 사과 | I eat an apple.\nbook | 책\nbeautiful | 아름다운"} className="w-full resize-y rounded-xl border border-border bg-background px-3 py-3 text-sm leading-relaxed" />
            <button disabled={isPending || !bulkText.trim() || !subjectId} onClick={saveBulkWords} className="w-full rounded-xl bg-primary px-4 py-4 text-base font-bold text-primary-foreground disabled:opacity-50">일괄 단어 저장</button>
          </div>
        )}
      </section>

      </div>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {activeTab !== "manage" && (
        <section className="space-y-3">
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
            childMode
            childName={childName}
          />
        </section>
      )}
      {activeTab === "manage" && (
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2"><h2 className="font-bold">단어 목록 · {managerWords.length}개</h2><select value={managerFilterSubjectId || subjectId} onChange={(event) => setManagerFilterSubjectId(event.target.value)} className="max-w-36 rounded-lg border border-border bg-background px-2 py-2 text-xs"><option value="__all__">전체 과목</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div>
        {managerWords.length === 0 && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">이 과목에 등록된 단어가 없습니다.</p>}
        {managerWords.map((item) => (
          <article key={item.id} className="space-y-2 rounded-xl border border-border p-3">
            {editingId === item.id ? (
              <>
                <select value={editSubjectId} onChange={(event) => setEditSubjectId(event.target.value)} className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm">{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
                <input value={editWord} onChange={(event) => setEditWord(event.target.value)} maxLength={100} className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                <input value={editMeaning} onChange={(event) => setEditMeaning(event.target.value)} maxLength={200} className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                <input value={editExample} onChange={(event) => setEditExample(event.target.value)} maxLength={2000} placeholder="예문" className="w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
                <div className="flex gap-2"><button disabled={isPending} onClick={() => saveEdit(item.id)} className="text-sm font-bold">저장</button><button onClick={() => setEditingId(null)} className="text-sm text-muted-foreground">취소</button></div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold">{item.word}</p><p className="text-sm text-muted-foreground">{item.meaning}</p>{item.example && <p className="mt-1 text-xs text-muted-foreground">{item.example}</p>}</div><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-xs">{item.subject}</span></div>
                <div className="flex gap-3"><button onClick={() => beginEdit(item)} className="text-xs font-semibold">수정</button><button disabled={isPending} onClick={() => { if (window.confirm("이 단어를 삭제할까요?")) run(() => deleteChildWord(item.id)) }} className="text-xs font-semibold text-red-600">삭제</button>{item.wrongCount > 0 && <span className="text-xs text-muted-foreground">오답 {item.wrongCount}회</span>}</div>
              </>
            )}
          </article>
        ))}
      </section>
      )}
    </div>
  )
}
