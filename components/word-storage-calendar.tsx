"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { getChildCalendarData, updateChildSubjectColor } from "@/app/actions/child-words"

type Subject = { id: string; name: string; color: string }
type StorageDate = { date: string; subjectId: string | null; subject: string }

const COLORS = [
  { value: "#2563EB", label: "파랑" },
  { value: "#16A34A", label: "초록" },
  { value: "#F59E0B", label: "노랑" },
  { value: "#EF4444", label: "빨강" },
  { value: "#A855F7", label: "보라" },
  { value: "#EC4899", label: "분홍" },
  { value: "#0D9488", label: "청록" },
  { value: "#64748B", label: "회색" },
]

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}
function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function WordStorageCalendar({
  selectedDate,
  subjects,
  initialStorage,
  onSelectDate,
}: {
  selectedDate: string
  subjects: Subject[]
  initialStorage: StorageDate[]
  onSelectDate: (date: string) => void
}) {
  const [month, setMonth] = useState(() => new Date(Number(selectedDate.slice(0, 4)), Number(selectedDate.slice(5, 7)) - 1, 1))
  const [storage, setStorage] = useState(initialStorage)
  const [colors, setColors] = useState<Record<string, string>>(() => Object.fromEntries(subjects.map((s) => [s.id, s.color])))
  const [isPending, startTransition] = useTransition()
  const key = monthKey(month)

  useEffect(() => {
    let active = true
    getChildCalendarData(key).then((rows) => { if (active) setStorage(rows) }).catch(() => {})
    return () => { active = false }
  }, [key])

  useEffect(() => {
    setColors(Object.fromEntries(subjects.map((s) => [s.id, s.color])))
  }, [subjects])

  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const days = new Date(year, monthIndex + 1, 0).getDate()
  const offset = new Date(year, monthIndex, 1).getDay()
  const dotsByDate = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const row of storage) {
      const subject = subjects.find((s) => s.id === row.subjectId || (!row.subjectId && s.name === row.subject))
      if (!subject) continue
      const ids = map.get(row.date) ?? new Set<string>()
      ids.add(subject.id)
      map.set(row.date, ids)
    }
    return map
  }, [storage, subjects])

  function changeColor(subjectId: string, color: string) {
    const previous = colors[subjectId]
    setColors((current) => ({ ...current, [subjectId]: color }))
    startTransition(async () => {
      try {
        await updateChildSubjectColor(subjectId, color)
      } catch {
        setColors((current) => ({ ...current, [subjectId]: previous ?? "#2563EB" }))
      }
    })
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="rounded-lg px-3 py-1.5 text-lg" aria-label="이전 달">‹</button>
        <h2 className="text-sm font-bold">{year}년 {monthIndex + 1}월</h2>
        <button type="button" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="rounded-lg px-3 py-1.5 text-lg" aria-label="다음 달">›</button>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => <div key={day} className="pb-1 text-[11px] font-semibold text-muted-foreground">{day}</div>)}
        {Array.from({ length: offset }, (_, i) => <div key={`blank-${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1
          const date = dateKey(year, monthIndex, day)
          const subjectIds = Array.from(dotsByDate.get(date) ?? [])
          const active = selectedDate === date
          return (
            <button key={date} type="button" onClick={() => onSelectDate(date)} className={`flex min-h-11 flex-col items-center justify-center rounded-xl text-xs ${active ? "bg-muted font-black ring-2 ring-blue-500 ring-offset-1" : "font-medium hover:bg-muted/70"}`}>
              <span>{day}</span>
              <span className="mt-0.5 flex h-2 items-center justify-center gap-0.5">
                {subjectIds.slice(0, 5).map((id) => <i key={id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors[id] ?? subjects.find((s) => s.id === id)?.color ?? "#2563EB" }} />)}
              </span>
            </button>
          )
        })}
      </div>
      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-[11px] text-muted-foreground">점은 해당 과목의 단어가 저장된 날짜를 표시합니다.</p>
        {subjects.length > 0 && <div className="flex flex-wrap gap-x-3 gap-y-2">
          {subjects.map((subject) => (
            <label key={subject.id} className="inline-flex items-center gap-1.5 text-xs">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[subject.id] ?? subject.color }} />
              <span>{subject.name}</span>
              <select aria-label={subject.name + " 달력 점 색상"} value={colors[subject.id] ?? subject.color} disabled={isPending} onChange={(event) => changeColor(subject.id, event.target.value)} className="max-w-16 rounded-md border border-border bg-background px-1 py-0.5 text-[10px]">
                {COLORS.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
              </select>
            </label>
          ))}
        </div>}
      </div>
    </section>
  )
}
