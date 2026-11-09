"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addChildWord, addChildWordsBulk, scanChildWordsImage, deleteChildWord, updateChildWord, createChildSubject, renameChildSubject, archiveChildSubject, recordChildQuizResult, gradeChildListeningAnswer, getChildAzureSpeechToken } from "@/app/actions/child-words"

type Subject = { id: string; name: string }
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
  stats,
}: {
  childName: string
  subjects: Subject[]
  initialWords: Word[]
  wrongWords: Word[]
  initialDate: string
  stats: { total: number; correct: number; accuracy: number; subjects: { name: string; total: number; correct: number; accuracy: number }[] }
}) {
  const router = useRouter()
  const [date, setDate] = useState(initialDate)
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "")
  const [word, setWord] = useState("")
  const [meaning, setMeaning] = useState("")
  const [example, setExample] = useState("")
  const [aiWords, setAiWords] = useState<{ word: string; meaning: string; example: string }[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSubjectId, setEditSubjectId] = useState("")
  const [editWord, setEditWord] = useState("")
  const [editMeaning, setEditMeaning] = useState("")
  const [editExample, setEditExample] = useState("")
  const [error, setError] = useState("")
  const [newSubject, setNewSubject] = useState("")
  const [quizIndex, setQuizIndex] = useState(0)
  const [quizRevealed, setQuizRevealed] = useState(false)
  const [quizMode, setQuizMode] = useState(false)
  const [quizType, setQuizType] = useState<"standard" | "listening">("standard")
  const [quizAnswer, setQuizAnswer] = useState("")
  const [quizMeaningAnswer, setQuizMeaningAnswer] = useState("")
  const [quizHintUsed, setQuizHintUsed] = useState(false)
  const [quizSessionId, setQuizSessionId] = useState("")
  const [quizSessionResult, setQuizSessionResult] = useState<{ total: number; correct: number; score: number; rewardTitle: string | null; smsSent: boolean | null } | null>(null)
  const [quizAiFeedback, setQuizAiFeedback] = useState("")
  const [quizFeedback, setQuizFeedback] = useState<"correct" | "wrong" | null>(null)
  const [ttsVoice, setTtsVoice] = useState("en-US-AnaNeural")
  const [isSlowMode, setIsSlowMode] = useState(false)
  const ttsCacheRef = useRef(new Map<string, string>())
  const activeAudioRef = useRef<HTMLAudioElement | null>(null)
  const [reviewMode, setReviewMode] = useState<"daily" | "wrong">("daily")
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
      try { await action(); router.refresh() }
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

  const sourceWords = reviewMode === "wrong" ? wrongWords : initialWords
  const visibleWords = sourceWords.filter((item) => !subjectId || item.subjectId === subjectId || (!item.subjectId && item.subject === subjects.find((s) => s.id === subjectId)?.name))
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

  function addSubject() {
    run(async () => {
      const created = await createChildSubject(newSubject)
      setNewSubject("")
      setSubjectId(created.id)
    })
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between"><h2 className="font-bold">최근 30일 학습 현황</h2><span className="text-xs text-muted-foreground">퀴즈 응답 기준</span></div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted p-3"><p className="text-xl font-black">{stats.total}</p><p className="text-xs text-muted-foreground">푼 문제</p></div>
          <div className="rounded-xl bg-muted p-3"><p className="text-xl font-black">{stats.correct}</p><p className="text-xs text-muted-foreground">정답</p></div>
          <div className="rounded-xl bg-muted p-3"><p className="text-xl font-black">{stats.accuracy}%</p><p className="text-xs text-muted-foreground">정답률</p></div>
        </div>
        {stats.subjects.map((item) => <div key={item.name} className="flex items-center justify-between text-sm"><span>{item.name}</span><span className="text-muted-foreground">{item.correct}/{item.total} · {item.accuracy}%</span></div>)}
        {!stats.total && <p className="text-xs text-muted-foreground">퀴즈를 풀면 학습 기록이 여기에 쌓입니다.</p>}
      </section>

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h2 className="font-bold">내 과목 관리</h2>
        <div className="flex gap-2">
          <input value={newSubject} onChange={(event) => setNewSubject(event.target.value)} maxLength={60} placeholder="새 과목 이름" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" />
          <button disabled={isPending || !newSubject.trim()} onClick={addSubject} className="rounded-xl bg-foreground px-3 py-2 text-sm font-bold text-background disabled:opacity-50">추가</button>
        </div>
        <div className="space-y-2">
          {subjects.map((subject) => <div key={subject.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{subject.name}</span>
            <button disabled={isPending} onClick={() => { const next = window.prompt("새 과목 이름", subject.name); if (next?.trim() && next.trim() !== subject.name) run(() => renameChildSubject(subject.id, next)) }} className="rounded-lg border border-border px-2 py-1 text-xs">이름 변경</button>
            <button disabled={isPending || subjects.length < 2} onClick={() => { if (window.confirm(subject.name + " 과목을 목록에서 숨길까요? 기존 학습 기록은 보존됩니다.")) run(() => archiveChildSubject(subject.id)) }} className="rounded-lg border border-border px-2 py-1 text-xs text-red-600">삭제</button>
          </div>)}
        </div>
        <p className="text-xs text-muted-foreground">과목을 삭제해도 기존 단어와 학습 기록은 삭제하지 않고 보관합니다.</p>
      </section>

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
          <button disabled={isPending || !aiWords.length || aiWords.some((item) => !item.word.trim() || !item.meaning.trim())} onClick={() => run(async () => { await addChildWordsBulk({ date, subjectId, words: aiWords }); setAiWords([]) })} className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">확인한 {aiWords.length}개 단어 저장</button>
        </div>}
      </section>

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between"><h2 className="font-bold">내 단어장</h2><input type="date" value={date} onChange={(event) => { setDate(event.target.value); router.push("/child?date=" + event.target.value) }} className="rounded-lg border border-border bg-background px-2 py-1 text-sm" /></div>
        <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </select>
        <input value={word} onChange={(event) => setWord(event.target.value)} maxLength={100} placeholder="단어 또는 학습 항목" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <input value={meaning} onChange={(event) => setMeaning(event.target.value)} maxLength={200} placeholder="뜻 또는 설명" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <input value={example} onChange={(event) => setExample(event.target.value)} maxLength={2000} placeholder="예문 (선택)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <button disabled={isPending || !word.trim() || !meaning.trim() || !subjectId} onClick={add} className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">단어 추가</button>
      </section>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div className="grid grid-cols-2 gap-2"><button onClick={() => { setReviewMode("daily"); setQuizMode(false); setQuizIndex(0); setQuizRevealed(false) }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${reviewMode === "daily" ? "bg-foreground text-background" : "bg-muted"}`}>오늘 단어</button><button onClick={() => { setReviewMode("wrong"); setQuizMode(false); setQuizIndex(0); setQuizRevealed(false) }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${reviewMode === "wrong" ? "bg-foreground text-background" : "bg-muted"}`}>오답 복습 ({wrongWords.length})</button></div>
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{reviewMode === "wrong" ? "오답 복습" : "단어 퀴즈"}</h2><button onClick={() => { const starting = !quizMode; setQuizMode(starting); setQuizIndex(0); setQuizRevealed(false); setQuizAnswer(""); setQuizMeaningAnswer(""); setQuizAiFeedback(""); setQuizHintUsed(false); setQuizFeedback(null); setQuizSessionResult(null); setQuizSessionId(starting ? crypto.randomUUID() : "") }} disabled={!visibleWords.length} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50">{quizMode ? "퀴즈 닫기" : "퀴즈 시작"}</button></div>
        {quizMode && quizWord && <div className="space-y-3 rounded-xl bg-muted p-4">
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setQuizType("standard"); setQuizIndex(0); setQuizAnswer(""); setQuizMeaningAnswer(""); setQuizAiFeedback(""); setQuizHintUsed(false); setQuizFeedback(null); setQuizRevealed(false); setQuizSessionId(crypto.randomUUID()); setQuizSessionResult(null) }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${quizType === "standard" ? "bg-foreground text-background" : "bg-background"}`}>기본 단어 퀴즈</button>
            <button onClick={() => { setQuizType("listening"); setQuizIndex(0); setQuizAnswer(""); setQuizMeaningAnswer(""); setQuizAiFeedback(""); setQuizHintUsed(false); setQuizFeedback(null); setQuizRevealed(false); setQuizSessionId(crypto.randomUUID()); setQuizSessionResult(null) }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${quizType === "listening" ? "bg-foreground text-background" : "bg-background"}`}>듣기 퀴즈</button>
          </div>
          <p className="text-right text-xs text-muted-foreground">{quizIndex + 1} / {visibleWords.length}</p>
          {quizType === "standard" ? <p className="py-5 text-center text-2xl font-black">{quizWord.meaning}</p> : <div className="flex flex-col items-center gap-3 py-3">
            <button type="button" onClick={() => void playPronunciation(quizWord.word)} className="flex size-16 items-center justify-center rounded-full bg-foreground text-background" aria-label="단어 발음 다시 듣기"><span className="text-2xl">🔊</span></button>
            <div className="flex w-full max-w-sm items-center gap-2">
              <select value={ttsVoice} onChange={(event) => { setTtsVoice(event.target.value); window.localStorage.setItem("word_quiz_tts_voice", event.target.value) }} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-2 text-xs">
                {TTS_VOICES.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}
              </select>
              <button type="button" onClick={() => setIsSlowMode((value) => !value)} className={`rounded-lg border border-border px-3 py-2 text-xs font-semibold ${isSlowMode ? "bg-foreground text-background" : "bg-background"}`}>{isSlowMode ? "느리게 재생 중" : "느리게 듣기"}</button>
            </div>
            <p className="text-sm text-muted-foreground">발음을 듣고 영어 단어와 한국어 뜻을 입력하세요.</p>
          </div>}
          {quizHintUsed && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <p className="font-semibold">💡 힌트</p>
            {quizType === "listening"
              ? <p>영어 첫 글자: <strong>{quizWord.word[0]}</strong> · 뜻: {quizWord.meaning}</p>
              : quizWord.example
                ? <p>{quizWord.example.replace(new RegExp(quizWord.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (match) => match[0] + "·".repeat(Math.max(0, match.length - 1)))}</p>
                : <p>첫 글자: <strong>{quizWord.word[0]}</strong> · 글자 수: {quizWord.word.length}</p>}
          </div>}
          {!quizFeedback ? <form className="space-y-2" onSubmit={(event) => {
            event.preventDefault()
            if (!quizAnswer.trim() || isPending || (quizType === "listening" && !quizMeaningAnswer.trim())) return
            run(async () => {
              let correct: boolean
              if (quizType === "listening") {
                const result = await gradeChildListeningAnswer(quizWord.id, quizAnswer, quizMeaningAnswer)
                correct = result.isCorrect
                setQuizAiFeedback(`${result.wordCorrect ? "영어 철자: 정답" : "영어 철자: 오답 (정답: " + quizWord.word + ")"}\n${result.feedback}`)
              } else {
                const normalized = quizAnswer.trim().replace(/['‘’`]/g, "'").toLocaleLowerCase()
                const expected = quizWord.word.trim().replace(/['‘’`]/g, "'").toLocaleLowerCase()
                correct = normalized === expected
              }
              const recorded = await recordChildQuizResult(quizWord.id, correct, quizType, { quizSessionId, hintUsed: quizHintUsed, sessionQuestionCount: visibleWords.length })
              if (recorded.sessionResult) setQuizSessionResult(recorded.sessionResult)
              setQuizFeedback(correct ? "correct" : "wrong")
            })
          }}>
            <input autoComplete="off" value={quizAnswer} onChange={(event) => setQuizAnswer(event.target.value)} placeholder="영어 단어 입력" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-center text-lg" />
            {quizType === "listening" && <input autoComplete="off" value={quizMeaningAnswer} onChange={(event) => setQuizMeaningAnswer(event.target.value)} placeholder="한국어 뜻 입력 (품사까지 정확하게)" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-center text-base" />}
            <button type="submit" disabled={isPending || !quizAnswer.trim() || (quizType === "listening" && !quizMeaningAnswer.trim())} className="w-full rounded-xl bg-foreground px-3 py-2.5 text-sm font-bold text-background disabled:opacity-50">{isPending && quizType === "listening" ? "AI 선생님이 채점 중..." : "정답 확인"}</button>
          </form> : <div className="space-y-3 text-center">
            <p className={quizFeedback === "correct" ? "font-bold text-green-600" : "font-bold text-red-600"}>{quizFeedback === "correct" ? "정답이에요!" : "아쉬워요. 정답은 " + quizWord.word + " 입니다."}</p>
            <p className="whitespace-pre-line text-sm text-muted-foreground">{quizType === "listening" && quizAiFeedback ? quizAiFeedback : quizWord.meaning}</p>
            <button onClick={() => { if (quizIndex >= visibleWords.length - 1) { setQuizMode(false); setQuizSessionId(""); } else { setQuizIndex((i) => i + 1); setQuizAnswer(""); setQuizMeaningAnswer(""); setQuizAiFeedback(""); setQuizHintUsed(false); setQuizFeedback(null); } if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel(); if (activeAudioRef.current) { activeAudioRef.current.pause(); activeAudioRef.current.currentTime = 0 } }} className="w-full rounded-xl bg-foreground px-3 py-2.5 text-sm font-bold text-background">{quizIndex >= visibleWords.length - 1 ? "퀴즈 결과 보기" : "다음 단어"}</button>
          </div>}
          {!quizFeedback && <button type="button" disabled={quizHintUsed || isPending} onClick={() => setQuizHintUsed(true)} className="w-full rounded-xl border border-border px-3 py-2 text-sm font-semibold text-muted-foreground disabled:opacity-50">💡 힌트 보기</button>}
        </div>}
        {!visibleWords.length && <p className="text-sm text-muted-foreground">퀴즈를 시작하려면 먼저 이 과목에 단어를 등록하세요.</p>}
        {quizSessionResult && !quizMode && <section className="space-y-2 rounded-2xl border border-border bg-muted/40 p-4">
          <h3 className="font-bold">퀴즈 결과</h3>
          <p className="text-3xl font-black">{quizSessionResult.score}점</p>
          <p className="text-sm text-muted-foreground">{quizSessionResult.correct}/{quizSessionResult.total} 정답</p>
          {quizSessionResult.rewardTitle ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-center text-amber-950"><p className="font-bold">🎁 쿠폰을 받았어요!</p><p className="mt-1 text-lg font-black">{quizSessionResult.rewardTitle}</p><p className="mt-1 text-xs">{quizSessionResult.smsSent ? "부모님께 문자 알림을 보냈어요." : "쿠폰은 지급됐어요. 문자 알림은 아직 설정되지 않았어요."}</p></div> : <p className="text-xs text-muted-foreground">이번 퀴즈는 쿠폰 지급 조건에 해당하지 않았어요.</p>}
          <button onClick={() => { setQuizSessionResult(null); setQuizMode(true); setQuizIndex(0); setQuizAnswer(""); setQuizMeaningAnswer(""); setQuizHintUsed(false); setQuizFeedback(null); setQuizSessionId(crypto.randomUUID()) }} className="w-full rounded-xl border border-border px-3 py-2 text-sm font-semibold">다시 퀴즈 풀기</button>
        </section>}

      </section>

      <section className="space-y-3">
        <h2 className="font-bold">{subjects.find((s) => s.id === subjectId)?.name ?? "단어"} · {visibleWords.length}개</h2>
        {visibleWords.length === 0 && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">이 과목에 등록된 단어가 없습니다.</p>}
        {visibleWords.map((item) => (
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
    </div>
  )
}
