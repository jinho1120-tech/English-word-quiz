"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addParentChildWord, deleteParentChildWord } from "@/app/actions/parent-words"

type Subject = { id: string; name: string }
type Word = { id: number; subjectId: string | null; subject: string; word: string; meaning: string; example: string | null; wrongCount: number }

export function ParentWordManager({ childProfileId, subjects, initialWords, initialDate }: {
  childProfileId: string; subjects: Subject[]; initialWords: Word[]; initialDate: string
}) {
  const router = useRouter()
  const [date, setDate] = useState(initialDate)
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "")
  const [word, setWord] = useState("")
  const [meaning, setMeaning] = useState("")
  const [example, setExample] = useState("")
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
        <div className="flex items-center justify-between"><h2 className="font-bold">단어 추가</h2><input type="date" value={date} onChange={(event) => { setDate(event.target.value); router.push("?date=" + event.target.value) }} className="rounded-lg border border-border bg-background px-2 py-1 text-sm" /></div>
        <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
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
