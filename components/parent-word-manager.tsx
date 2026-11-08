"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addParentChildWord, addParentChildWordsBulk, scanParentChildWordsImage, deleteParentChildWord } from "@/app/actions/parent-words"

type Subject = { id: string; name: string }
type Word = { id: number; subjectId: string | null; subject: string; word: string; meaning: string; example: string | null; wrongCount: number }

export function ParentWordManager({ childProfileId, subjects, initialWords, initialDate, stats }: {
  childProfileId: string; subjects: Subject[]; initialWords: Word[]; initialDate: string; stats: { total: number; correct: number; accuracy: number; subjects: { name: string; total: number; correct: number; accuracy: number }[] }
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
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<unknown>) {
    setError("")
    startTransition(async () => {
      try { await action(); router.refresh() }
      catch (err) { setError(err instanceof Error ? err.message : "요청을 처리하지 못했습니다.") }
    })
  }

  const visibleWords = initialWords.filter((item) => !subjectId || item.subjectId === subjectId || (!item.subjectId && item.subject === subjects.find((s) => s.id === subjectId)?.name))

  return (
    <div className="space-y-5">
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h2 className="font-bold">최근 30일 학습 현황</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted p-3"><p className="text-xl font-black">{stats.total}</p><p className="text-xs text-muted-foreground">푼 문제</p></div>
          <div className="rounded-xl bg-muted p-3"><p className="text-xl font-black">{stats.correct}</p><p className="text-xs text-muted-foreground">정답</p></div>
          <div className="rounded-xl bg-muted p-3"><p className="text-xl font-black">{stats.accuracy}%</p><p className="text-xs text-muted-foreground">정답률</p></div>
        </div>
        {stats.subjects.map((item) => <div key={item.name} className="flex justify-between text-sm"><span>{item.name}</span><span className="text-muted-foreground">{item.correct}/{item.total} · {item.accuracy}%</span></div>)}
        {!stats.total && <p className="text-xs text-muted-foreground">자녀가 퀴즈를 풀면 학습 기록이 쌓입니다.</p>}
      </section>
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <div className="flex items-center justify-between"><h2 className="font-bold">단어 추가</h2><input type="date" value={date} onChange={(event) => { setDate(event.target.value); router.push("?date=" + event.target.value) }} className="rounded-lg border border-border bg-background px-2 py-1 text-sm" /></div>
        <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
        <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (event) => {
          const file = event.target.files?.[0]; event.target.value = ""; if (!file) return
          if (file.size > 7.5 * 1024 * 1024) { setError("이미지는 7.5MB 이하로 올려 주세요."); return }
          setError(""); setIsScanning(true)
          try {
            const image = new Image(), url = URL.createObjectURL(file); image.src = url
            await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("사진을 읽지 못했습니다.")) }); URL.revokeObjectURL(url)
            const canvas = document.createElement("canvas"), scale = Math.min(1400 / image.width, 1400 / image.height, 1)
            canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale)
            const context = canvas.getContext("2d"); if (!context) throw new Error("사진을 변환하지 못했습니다.")
            context.drawImage(image, 0, 0, canvas.width, canvas.height)
            const result = await scanParentChildWordsImage(childProfileId, canvas.toDataURL("image/jpeg", 0.78).split(",")[1], "image/jpeg")
            setAiWords(result)
          } catch (err) { setError(err instanceof Error ? err.message : "AI 단어 추출에 실패했습니다.") }
          finally { setIsScanning(false) }
        }} />
        <button type="button" disabled={pending || isScanning || !subjectId} onClick={() => imageInputRef.current?.click()} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm font-semibold disabled:opacity-50">{isScanning ? "AI 분석 중..." : "사진에서 AI로 단어 추출"}</button>
        {aiWords.length > 0 && <div className="space-y-2">
          <p className="text-sm font-semibold">AI 추출 결과 {aiWords.length}개 · 확인 후 저장</p>
          {aiWords.map((item, index) => <div key={index} className="space-y-1 rounded-lg bg-muted p-2">
            <input value={item.word} onChange={(event) => setAiWords((items) => items.map((v, i) => i === index ? { ...v, word: event.target.value } : v))} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            <input value={item.meaning} onChange={(event) => setAiWords((items) => items.map((v, i) => i === index ? { ...v, meaning: event.target.value } : v))} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            <input value={item.example} placeholder="예문 (선택)" onChange={(event) => setAiWords((items) => items.map((v, i) => i === index ? { ...v, example: event.target.value } : v))} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            <button onClick={() => setAiWords((items) => items.filter((_, i) => i !== index))} className="text-xs text-red-600">제외</button>
          </div>)}
          <button disabled={pending || !aiWords.length || aiWords.some((item) => !item.word.trim() || !item.meaning.trim())} onClick={() => run(async () => { await addParentChildWordsBulk(childProfileId, { date, subjectId, words: aiWords }); setAiWords([]) })} className="w-full rounded-xl bg-foreground px-3 py-2.5 text-sm font-bold text-background disabled:opacity-50">확인한 {aiWords.length}개 단어 저장</button>
        </div>}
        <input value={word} onChange={(event) => setWord(event.target.value)} maxLength={100} placeholder="단어" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <input value={meaning} onChange={(event) => setMeaning(event.target.value)} maxLength={200} placeholder="뜻" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <input value={example} onChange={(event) => setExample(event.target.value)} maxLength={2000} placeholder="예문 (선택)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <button disabled={pending || !subjectId || !word.trim() || !meaning.trim()} onClick={() => run(async () => { await addParentChildWord(childProfileId, { date, subjectId, word, meaning, example }); setWord(""); setMeaning(""); setExample("") })} className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">자녀 단어장에 추가</button>
      </section>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <section className="space-y-3">
        <div className="flex items-center justify-between"><h2 className="font-bold">등록된 단어</h2><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-sm">{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></div>
        {visibleWords.map((item) => <article key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-3"><div className="min-w-0 flex-1"><p className="font-bold">{item.word}</p><p className="text-sm text-muted-foreground">{item.meaning}</p>{item.example && <p className="mt-1 text-xs text-muted-foreground">{item.example}</p>}<p className="mt-1 text-xs text-muted-foreground">{item.subject}</p></div><button disabled={pending} onClick={() => { if (window.confirm("이 단어를 삭제할까요?")) run(() => deleteParentChildWord(childProfileId, item.id)) }} className="text-xs font-semibold text-red-600">삭제</button></article>)}
        {visibleWords.length === 0 && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">등록된 단어가 없습니다.</p>}
      </section>
    </div>
  )
}
