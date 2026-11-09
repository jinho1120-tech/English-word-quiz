"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  archiveChildSubject,
  createChildSubject,
  renameChildSubject,
  reorderChildSubjects,
} from "@/app/actions/subjects"

type SubjectItem = { id: string; name: string; sortOrder: number }

export function SubjectManager({
  childProfileId,
  initialSubjects,
}: {
  childProfileId: string
  initialSubjects: SubjectItem[]
}) {
  const router = useRouter()
  const [subjects, setSubjects] = useState(initialSubjects)

  useEffect(() => {
    setSubjects(initialSubjects)
  }, [initialSubjects])
  const [newName, setNewName] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<unknown>) {
    setError("")
    startTransition(async () => {
      try {
        await action()
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "요청을 처리하지 못했습니다.")
      }
    })
  }

  function addSubject() {
    const name = newName.trim()
    if (!name) return
    run(async () => {
      const created = await createChildSubject(childProfileId, name)
      setSubjects((current) => [...current, { id: created.id, name: created.name, sortOrder: created.sortOrder }])
      setNewName("")
    })
  }

  function saveRename(subjectId: string) {
    const name = editingName.trim()
    if (!name) return
    run(async () => {
      await renameChildSubject(childProfileId, subjectId, name)
      setEditingId(null)
      setEditingName("")
    })
  }

  function move(subjectId: string, direction: -1 | 1) {
    const from = subjects.findIndex((subject) => subject.id === subjectId)
    const to = from + direction
    if (from < 0 || to < 0 || to >= subjects.length) return
    const next = [...subjects]
    ;[next[from], next[to]] = [next[to], next[from]]
    setSubjects(next)
    run(() => reorderChildSubjects(childProfileId, next.map((subject) => subject.id)))
  }

  return (
    <section className="space-y-4">
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          maxLength={60}
          placeholder="새 과목 이름"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
        />
        <button disabled={isPending || !newName.trim()} onClick={addSubject} className="rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background disabled:opacity-50">
          과목 추가
        </button>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      {subjects.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">아직 등록된 과목이 없습니다. 과목을 추가해 주세요.</p>
      ) : (
        <ul className="space-y-2">
          {subjects.map((subject, index) => (
            <li key={subject.id} className="flex items-center gap-2 rounded-xl border border-border p-3">
              {editingId === subject.id ? (
                <>
                  <input value={editingName} onChange={(event) => setEditingName(event.target.value)} maxLength={60} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm" />
                  <button disabled={isPending} onClick={() => saveRename(subject.id)} className="text-sm font-semibold">저장</button>
                  <button onClick={() => setEditingId(null)} className="text-sm text-muted-foreground">취소</button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{subject.name}</span>
                  <button aria-label={subject.name + " 위로 이동"} disabled={isPending || index === 0} onClick={() => move(subject.id, -1)} className="rounded-lg px-2 py-1 text-sm disabled:opacity-30">↑</button>
                  <button aria-label={subject.name + " 아래로 이동"} disabled={isPending || index === subjects.length - 1} onClick={() => move(subject.id, 1)} className="rounded-lg px-2 py-1 text-sm disabled:opacity-30">↓</button>
                  <button onClick={() => { setEditingId(subject.id); setEditingName(subject.name) }} className="text-sm font-semibold">이름 변경</button>
                  <button disabled={isPending} onClick={() => { if (window.confirm(subject.name + " 과목을 보관할까요? 기존 단어와 학습 기록은 보존됩니다.")) run(() => archiveChildSubject(childProfileId, subject.id)) }} className="text-sm text-red-600">보관</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
