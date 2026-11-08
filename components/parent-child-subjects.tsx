"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createChildSubject, renameChildSubject, archiveChildSubject } from "@/app/actions/subjects"

type Subject = { id: string; name: string }
export function ParentChildSubjects({ childProfileId, initialSubjects }: { childProfileId: string; initialSubjects: Subject[] }) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [pending, startTransition] = useTransition()
  function run(action: () => Promise<unknown>) {
    setError("")
    startTransition(async () => { try { await action(); router.refresh() } catch (e) { setError(e instanceof Error ? e.message : "과목 작업에 실패했습니다.") } })
  }
  return <div className="space-y-4">
    <section className="flex gap-2 rounded-2xl border border-border p-4"><input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="새 과목 이름" className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" /><button disabled={pending || !name.trim()} onClick={() => run(async () => { await createChildSubject(childProfileId, name); setName("") })} className="rounded-xl bg-foreground px-3 py-2 text-sm font-bold text-background">추가</button></section>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {initialSubjects.map((subject) => <div key={subject.id} className="flex items-center gap-2 rounded-xl border border-border p-3"><span className="min-w-0 flex-1 truncate text-sm font-semibold">{subject.name}</span><button disabled={pending} onClick={() => { const next = window.prompt("과목 이름 변경", subject.name); if (next?.trim() && next.trim() !== subject.name) run(() => renameChildSubject(childProfileId, subject.id, next)) }} className="rounded-lg border border-border px-3 py-2 text-xs">이름 변경</button><button disabled={pending} onClick={() => { if (window.confirm(subject.name + " 과목을 보관 처리할까요?")) run(() => archiveChildSubject(childProfileId, subject.id)) }} className="rounded-lg border border-border px-3 py-2 text-xs text-red-600">삭제</button></div>)}
    {!initialSubjects.length && <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">등록된 과목이 없습니다.</p>}
  </div>
}
