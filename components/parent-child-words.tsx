"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addParentChildWord, deleteParentChildWord } from "@/app/actions/parent-words"

type Subject = { id: string; name: string }
type Word = { id: number; assignmentDate: string; subject: string; word: string; meaning: string; example: string | null }

export function ParentChildWords({ childProfileId, subjects, words }: { childProfileId: string; subjects: Subject[]; words: Word[] }) {
  const router = useRouter()
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }))
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "")
  const [word, setWord] = useState("")
  const [meaning, setMeaning] = useState("")
  const [example, setExample] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  const filtered = words.filter((item) => item.assignmentDate === date)
  function add() {
    setError("")
    startTransition(async () => {
      try { await addParentChildWord({ childProfileId, date, subjectId, word, meaning, example }); setWord(""); setMeaning(""); setExample(""); router.refresh() }
      catch (e) { setError(e instanceof Error ? e.message : "단어를 추가하지 못했습니다.") }
    })
  }
  return <div className="space-y-5">
    <section className="space-y-3 rounded-2xl border border-border p-4">
      <h2 className="font-bold">부모가 단어 추가</h2>
      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <input value={word} onChange={(e) => setWord(e.target.value)} maxLength={100} placeholder="단어" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      <input value={meaning} onChange={(e) => setMeaning(e.target.value)} maxLength={200} placeholder="뜻" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      <input value={example} onChange={(e) => setExample(e.target.value)} maxLength={2000} placeholder="예문 (선택)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      <button disabled={pending || !subjectId || !word.trim() || !meaning.trim()} onClick={add} className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">단어 추가</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
    <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="font-bold">해당 날짜 단어</h2><span className="text-sm text-muted-foreground">{filtered.length}개</span></div>
      {filtered.map((item) => <article key={item.id} className="flex items-start gap-3 rounded-xl border border-border p-3"><div className="min-w-0 flex-1"><p className="font-bold">{item.word}</p><p className="text-sm text-muted-foreground">{item.meaning}</p><p className="text-xs text-muted-foreground">{item.subject}{item.example ? " · " + item.example : ""}</p></div><button disabled={pending} onClick={() => { if (window.confirm(item.word + " 단어를 삭제할까요?")) startTransition(async () => { try { await deleteParentChildWord(childProfileId, item.id); router.refresh() } catch (e) { setError(e instanceof Error ? e.message : "삭제 실패") } }) }} className="text-xs font-semibold text-red-600">삭제</button></article>)}
      {!filtered.length && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">이 날짜에 등록된 단어가 없습니다.</p>}
    </section>
  </div>
}
