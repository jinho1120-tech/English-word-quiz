"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addChildWord, deleteChildWord, updateChildWord, createChildSubject, renameChildSubject, archiveChildSubject, recordChildQuizResult } from "@/app/actions/child-words"

type Subject = { id: string; name: string }
type Word = { id: number; subjectId: string | null; subject: string; word: string; meaning: string; example: string | null; wrongCount: number }

export function ChildLearning({
  childName,
  subjects,
  initialWords,
  wrongWords,
  initialDate,
}: {
  childName: string
  subjects: Subject[]
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
  const [reviewMode, setReviewMode] = useState<"daily" | "wrong">("daily")
  const [isPending, startTransition] = useTransition()

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
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold">{reviewMode === "wrong" ? "오답 복습 퀴즈" : "단어 퀴즈"}</h2><button onClick={() => { setQuizMode(!quizMode); setQuizIndex(0); setQuizRevealed(false) }} disabled={!visibleWords.length} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold disabled:opacity-50">{quizMode ? "퀴즈 닫기" : "이 과목 퀴즈 시작"}</button></div>
        {quizMode && quizWord && <div className="space-y-3 rounded-xl bg-muted p-4">
          <p className="text-right text-xs text-muted-foreground">{quizIndex + 1} / {visibleWords.length}</p>
          <p className="py-4 text-center text-2xl font-black">{quizWord.word}</p>
          {quizRevealed ? <><p className="text-center text-lg font-semibold">{quizWord.meaning}</p><div className="grid grid-cols-2 gap-2"><button onClick={() => run(async () => { await recordChildQuizResult(quizWord.id, true); setQuizIndex((i) => (i + 1) % visibleWords.length); setQuizRevealed(false) })} disabled={isPending} className="rounded-xl bg-foreground px-3 py-2.5 text-sm font-bold text-background">맞았어요</button><button onClick={() => run(async () => { await recordChildQuizResult(quizWord.id, false); setQuizIndex((i) => (i + 1) % visibleWords.length); setQuizRevealed(false) })} disabled={isPending} className="rounded-xl border border-border px-3 py-2.5 text-sm font-bold">틀렸어요</button></div></> : <button onClick={() => setQuizRevealed(true)} className="w-full rounded-xl bg-foreground px-3 py-2.5 text-sm font-bold text-background">뜻 확인하기</button>}
        </div>}
        {!visibleWords.length && <p className="text-sm text-muted-foreground">퀴즈를 시작하려면 먼저 이 과목에 단어를 등록하세요.</p>}
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
