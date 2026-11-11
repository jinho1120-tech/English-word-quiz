"use client"

import { useRef, useState, useTransition } from "react"
import { Pencil, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { addParentChildWord, addParentChildWordsBulk, scanParentChildWordsImage, deleteParentChildWord, deleteParentChildWordsByDate, updateParentChildWord } from "@/app/actions/parent-words"
import { WordStorageCalendar } from "@/components/word-storage-calendar"

type Subject = { id: string; name: string; color: string }
type StorageDate = { date: string; subjectId: string | null; subject: string }
type Word = { id: number; subjectId: string | null; subject: string; word: string; meaning: string; example: string | null; wrongCount: number }

export function ParentWordManager({ childProfileId, subjects, initialWords, initialDate, initialStorage, stats }: {
  childProfileId: string; subjects: Subject[]; initialWords: Word[]; initialDate: string; initialStorage: StorageDate[]; stats: { total: number; correct: number; accuracy: number; subjects: { name: string; total: number; correct: number; accuracy: number }[] }
}) {
  const router = useRouter()
  const [date, setDate] = useState(initialDate)
  const [subjectId, setSubjectId] = useState(subjects[0]?.id ?? "")
  const [word, setWord] = useState("")
  const [meaning, setMeaning] = useState("")
  const [example, setExample] = useState("")
  const [draftWords, setDraftWords] = useState<{ word: string; meaning: string; example: string }[]>([])
  const [bulkText, setBulkText] = useState("")
  const [isScanning, setIsScanning] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [listFilterSubjectId, setListFilterSubjectId] = useState("__all__")
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editSubjectId, setEditSubjectId] = useState("")
  const [editWord, setEditWord] = useState("")
  const [editMeaning, setEditMeaning] = useState("")
  const [editExample, setEditExample] = useState("")
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<unknown>) {
    setError("")
    setNotice("")
    startTransition(async () => {
      try { await action(); router.refresh() }
      catch (err) { setError(err instanceof Error ? err.message : "요청을 처리하지 못했습니다.") }
    })
  }

  function addBulkTextToDraft() {
    setError("")
    const lines = bulkText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (!lines.length) { setError("붙여넣은 단어 목록이 비어 있습니다."); return }
    const parsed: { word: string; meaning: string; example: string }[] = []
    for (let index = 0; index < lines.length; index++) {
      const columns = lines[index].split("|").map((value) => value.trim())
      if (columns.length < 2 || columns.length > 3 || !columns[0] || !columns[1]) {
        setError(`${index + 1}번째 줄 형식이 올바르지 않습니다. 영단어 | 뜻 | 예문(선택) 형식으로 입력해 주세요.`)
        return
      }
      parsed.push({ word: columns[0], meaning: columns[1], example: columns[2] ?? "" })
    }
    if (draftWords.length + parsed.length > 100) {
      setError("검토 목록은 한 번에 최대 100개까지 등록할 수 있습니다.")
      return
    }
    setDraftWords((items) => [...items, ...parsed])
    setBulkText("")
  }

  const visibleWords = initialWords.filter((item) => listFilterSubjectId === "__all__" || item.subjectId === listFilterSubjectId || (!item.subjectId && item.subject === subjects.find((s) => s.id === listFilterSubjectId)?.name))

  function deleteFilteredWords() {
    const count = visibleWords.length
    if (!count) return
    const subjectName = listFilterSubjectId === "__all__" ? "전체 과목" : subjects.find((s) => s.id === listFilterSubjectId)?.name ?? "선택 과목"
    const message = listFilterSubjectId === "__all__"
      ? `${date}에 등록된 전체 과목 단어 ${count}개를 모두 삭제할까요?`
      : `${date}에 등록된 [${subjectName}] 단어 ${count}개를 모두 삭제할까요?`
    if (!window.confirm(message + "\\n삭제한 단어는 복구할 수 없습니다.")) return
    run(async () => {
      const result = await deleteParentChildWordsByDate(childProfileId, date, listFilterSubjectId === "__all__" ? undefined : listFilterSubjectId)
      setEditingId(null)
      setNotice(`단어 ${result.count}개를 삭제했습니다.`)
    })
  }

  function beginEdit(item: Word) {
    setEditingId(item.id)
    setEditSubjectId(item.subjectId ?? subjects.find((subject) => subject.name === item.subject)?.id ?? subjects[0]?.id ?? "")
    setEditWord(item.word)
    setEditMeaning(item.meaning)
    setEditExample(item.example ?? "")
  }

  function saveEdit() {
    if (editingId === null) return
    run(async () => {
      await updateParentChildWord(childProfileId, editingId, { subjectId: editSubjectId, word: editWord, meaning: editMeaning, example: editExample })
      setEditingId(null)
    })
  }

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
        <div className="flex items-center justify-between"><h2 className="font-bold">단어 추가</h2><span className="text-xs font-semibold text-muted-foreground">{date}</span></div>
        <WordStorageCalendar selectedDate={date} subjects={subjects} initialStorage={initialStorage} parentChildProfileId={childProfileId} onSelectDate={(nextDate) => { setDate(nextDate); router.push("?date=" + nextDate) }} />
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
            if (draftWords.length + result.length > 100) throw new Error("현재 검토 목록과 AI 추출 결과를 합쳐 100개를 초과합니다. 먼저 일부 항목을 저장하거나 제외해 주세요.")
            setDraftWords((items) => [...items, ...result])
          } catch (err) { setError(err instanceof Error ? err.message : "AI 단어 추출에 실패했습니다.") }
          finally { setIsScanning(false) }
        }} />
        <button type="button" disabled={pending || isScanning || !subjectId} onClick={() => imageInputRef.current?.click()} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm font-semibold disabled:opacity-50">{isScanning ? "AI 분석 중..." : "사진에서 AI로 단어 추출"}</button>
        <div className="space-y-2 rounded-xl bg-muted/50 p-3">
          <div>
            <p className="text-sm font-semibold">여러 단어 한꺼번에 입력</p>
            <p className="text-xs text-muted-foreground">한 줄에 하나씩 입력하세요. 형식: 영단어 | 뜻 | 예문(선택)</p>
          </div>
          <textarea
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
            rows={5}
            placeholder={"apple | 사과 | I eat an apple.\nbook | 책\nbright | 밝은 | The room is bright."}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <button type="button" disabled={pending || !subjectId || !bulkText.trim()} onClick={addBulkTextToDraft} className="w-full rounded-xl border border-border px-3 py-2.5 text-sm font-semibold disabled:opacity-50">입력 목록에 추가</button>
        </div>
        {draftWords.length > 0 && <div className="space-y-2 rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-bold">검토 및 저장 목록 {draftWords.length}/100개</p>
            <p className="text-xs text-muted-foreground">직접 입력하거나 AI 사진에서 추출한 단어입니다. 저장 전에 내용을 확인하고 수정하세요.</p>
          </div>
          {draftWords.map((item, index) => <div key={index} className="space-y-1 rounded-lg bg-muted p-2">
            <input aria-label={`${index + 1}번 단어`} value={item.word} onChange={(event) => setDraftWords((items) => items.map((v, i) => i === index ? { ...v, word: event.target.value } : v))} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            <input aria-label={`${index + 1}번 뜻`} value={item.meaning} onChange={(event) => setDraftWords((items) => items.map((v, i) => i === index ? { ...v, meaning: event.target.value } : v))} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            <input aria-label={`${index + 1}번 예문`} value={item.example} placeholder="예문 (선택)" onChange={(event) => setDraftWords((items) => items.map((v, i) => i === index ? { ...v, example: event.target.value } : v))} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm" />
            <button type="button" onClick={() => setDraftWords((items) => items.filter((_, i) => i !== index))} className="text-xs text-red-600">이 항목 제외</button>
          </div>)}
          <div className="flex gap-2">
            <button type="button" disabled={pending} onClick={() => setDraftWords([])} className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm font-semibold disabled:opacity-50">목록 비우기</button>
            <button type="button" disabled={pending || !subjectId || draftWords.some((item) => !item.word.trim() || !item.meaning.trim())} onClick={() => run(async () => { await addParentChildWordsBulk(childProfileId, { date, subjectId, words: draftWords }); setDraftWords([]); setBulkText("") })} className="flex-1 rounded-xl bg-foreground px-3 py-2.5 text-sm font-bold text-background disabled:opacity-50">확인한 {draftWords.length}개 저장</button>
          </div>
        </div>}
        <input value={word} onChange={(event) => setWord(event.target.value)} maxLength={100} placeholder="단어" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <input value={meaning} onChange={(event) => setMeaning(event.target.value)} maxLength={200} placeholder="뜻" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <input value={example} onChange={(event) => setExample(event.target.value)} maxLength={2000} placeholder="예문 (선택)" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <button disabled={pending || !subjectId || !word.trim() || !meaning.trim()} onClick={() => run(async () => { await addParentChildWord(childProfileId, { date, subjectId, word, meaning, example }); setWord(""); setMeaning(""); setExample("") })} className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">자녀 단어장에 추가</button>
      </section>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {notice && <p role="status" className="text-sm text-emerald-700">{notice}</p>}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">등록된 단어 ({visibleWords.length})</h2>
          <button type="button" disabled={pending || visibleWords.length === 0} onClick={deleteFilteredWords} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-600 disabled:opacity-40"><Trash2 className="size-3.5" />{listFilterSubjectId === "__all__" ? "전체 삭제" : "과목 삭제"}</button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button type="button" onClick={() => setListFilterSubjectId("__all__")} className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold ${listFilterSubjectId === "__all__" ? "bg-foreground text-background" : "border border-border bg-muted text-muted-foreground"}`}>전체 <span className="ml-1 rounded-full bg-background/20 px-1.5">{initialWords.length}</span></button>
          {subjects.map((subject) => {
            const count = initialWords.filter((item) => item.subjectId === subject.id || (!item.subjectId && item.subject === subject.name)).length
            if (!count) return null
            return <button key={subject.id} type="button" onClick={() => setListFilterSubjectId(subject.id)} className={`shrink-0 rounded-xl px-3.5 py-1.5 text-xs font-bold ${listFilterSubjectId === subject.id ? "bg-foreground text-background" : "border border-border bg-muted text-muted-foreground"}`}>{subject.name} <span className="ml-1 rounded-full bg-background/20 px-1.5">{count}</span></button>
          })}
        </div>
        {visibleWords.map((item) => <article key={item.id} className="rounded-xl border border-border p-3">
          {editingId === item.id ? <div className="space-y-2">
            <select value={editSubjectId} onChange={(event) => setEditSubjectId(event.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select>
            <input value={editWord} onChange={(event) => setEditWord(event.target.value)} placeholder="단어" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input value={editMeaning} onChange={(event) => setEditMeaning(event.target.value)} placeholder="뜻" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <input value={editExample} onChange={(event) => setEditExample(event.target.value)} placeholder="예문 (선택)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className="flex gap-2"><button type="button" disabled={pending || !editWord.trim() || !editMeaning.trim() || !editSubjectId} onClick={saveEdit} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">저장</button><button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">취소</button></div>
          </div> : <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="font-bold">{item.word}</p><p className="text-sm text-muted-foreground">{item.meaning}</p>{item.example && <p className="mt-1 text-xs text-muted-foreground">{item.example}</p>}<p className="mt-1 text-xs text-muted-foreground">{item.subject}</p></div><div className="flex shrink-0 items-center gap-1"><button type="button" aria-label="단어 수정" title="수정" disabled={pending} onClick={() => beginEdit(item)} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"><Pencil className="size-4" /></button><button type="button" aria-label="단어 삭제" title="삭제" disabled={pending} onClick={() => { if (window.confirm("이 단어를 삭제할까요?")) run(() => deleteParentChildWord(childProfileId, item.id)) }} className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"><Trash2 className="size-4" /></button></div></div>}
        </article>)}
        {visibleWords.length === 0 && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">등록된 단어가 없습니다.</p>}
      </section>
    </div>
  )
}
