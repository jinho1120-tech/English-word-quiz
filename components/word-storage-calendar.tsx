"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { CalendarDays, Palette, X } from "lucide-react"
import { getChildCalendarData, updateChildSubjectColor } from "@/app/actions/child-words"

type Subject = { id: string; name: string; color: string }
type StorageDate = { date: string; subjectId: string | null; subject: string }

const COLORS = [
  { value: "#2563EB", label: "파랑" }, { value: "#16A34A", label: "초록" },
  { value: "#F59E0B", label: "노랑" }, { value: "#EF4444", label: "빨강" },
  { value: "#A855F7", label: "보라" }, { value: "#EC4899", label: "분홍" },
  { value: "#0D9488", label: "청록" }, { value: "#64748B", label: "회색" },
]
function monthKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` }
function dateKey(year: number, month: number, day: number) { return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` }

export function WordStorageCalendar({ selectedDate, subjects, initialStorage, onSelectDate }: {
  selectedDate: string
  subjects: Subject[]
  initialStorage: StorageDate[]
  onSelectDate: (date: string) => void
}) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [isColorSettingsOpen, setIsColorSettingsOpen] = useState(false)
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
  useEffect(() => { setColors(Object.fromEntries(subjects.map((s) => [s.id, s.color]))) }, [subjects])

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
      ids.add(subject.id); map.set(row.date, ids)
    }
    return map
  }, [storage, subjects])

  function changeColor(subjectId: string, color: string) {
    const previous = colors[subjectId]
    setColors((current) => ({ ...current, [subjectId]: color }))
    startTransition(async () => {
      try { await updateChildSubjectColor(subjectId, color) }
      catch { setColors((current) => ({ ...current, [subjectId]: previous ?? "#2563EB" })) }
    })
  }

  const formattedDate = (() => {
    const [y, m, d] = selectedDate.split("-")
    return `${y}년 ${Number(m)}월 ${Number(d)}일`
  })()

  return (
    <>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground">학습 날짜</p>
            <p className="text-base font-black">{formattedDate}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={() => setIsColorSettingsOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-semibold">
              <Palette className="size-4" /> 과목 색상
            </button>
            <button type="button" onClick={() => setIsCalendarOpen((open) => !open)} aria-expanded={isCalendarOpen} className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
              <CalendarDays className="size-4" /> {isCalendarOpen ? "달력 닫기" : "날짜 변경"}
            </button>
          </div>
        </div>
        {isCalendarOpen && <>
          <div className="flex items-center justify-between border-t border-border pt-3">
            <button type="button" onClick={() => setMonth((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))} className="rounded-lg px-3 py-1.5 text-lg" aria-label="이전 달">‹</button>
            <h2 className="text-sm font-bold">{year}년 {monthIndex + 1}월</h2>
            <button type="button" onClick={() => setMonth((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))} className="rounded-lg px-3 py-1.5 text-lg" aria-label="다음 달">›</button>
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {["일", "월", "화", "수", "목", "금", "토"].map((d) => <div key={d} className="pb-1 text-[11px] font-semibold text-muted-foreground">{d}</div>)}
            {Array.from({ length: offset }, (_, i) => <div key={`blank-${i}`} />)}
            {Array.from({ length: days }, (_, i) => {
              const day = i + 1, date = dateKey(year, monthIndex, day)
              const ids = Array.from(dotsByDate.get(date) ?? [])
              const active = selectedDate === date
              return <button key={date} type="button" onClick={() => { onSelectDate(date); setIsCalendarOpen(false) }} className={`flex min-h-11 flex-col items-center justify-center rounded-xl text-xs ${active ? "bg-muted font-black ring-2 ring-blue-500 ring-offset-1" : "font-medium hover:bg-muted/70"}`}>
                <span>{day}</span><span className="mt-0.5 flex h-2 items-center justify-center gap-0.5">{ids.slice(0, 5).map((id) => <i key={id} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: colors[id] ?? subjects.find((s) => s.id === id)?.color ?? "#2563EB" }} />)}</span>
              </button>
            })}
          </div>
          <p className="border-t border-border pt-2 text-[11px] text-muted-foreground">점은 해당 과목의 단어가 저장된 날짜를 표시합니다.</p>
        </>}
      </section>

      {isColorSettingsOpen && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => setIsColorSettingsOpen(false)}>
        <section role="dialog" aria-modal="true" aria-labelledby="subject-color-title" onClick={(event) => event.stopPropagation()} className="max-h-[80dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-4 shadow-xl">
          <div className="flex items-center justify-between">
            <div><h2 id="subject-color-title" className="font-bold">과목 색상 설정</h2><p className="text-xs text-muted-foreground">달력에 표시할 과목별 점 색상을 정합니다.</p></div>
            <button type="button" onClick={() => setIsColorSettingsOpen(false)} aria-label="닫기" className="rounded-lg p-2 hover:bg-muted"><X className="size-5" /></button>
          </div>
          {subjects.length === 0 ? <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">등록된 과목이 없습니다.</p> : <div className="space-y-2">
            {subjects.map((subject) => <label key={subject.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold"><i className="size-3 shrink-0 rounded-full" style={{ backgroundColor: colors[subject.id] ?? subject.color }} />{subject.name}</span>
              <select aria-label={subject.name + " 달력 점 색상"} value={colors[subject.id] ?? subject.color} disabled={isPending} onChange={(event) => changeColor(subject.id, event.target.value)} className="rounded-lg border border-border bg-background px-2 py-2 text-sm">
                {COLORS.map((color) => <option key={color.value} value={color.value}>{color.label}</option>)}
              </select>
            </label>)}
          </div>}
          <button type="button" onClick={() => setIsColorSettingsOpen(false)} className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">완료</button>
        </section>
      </div>}
    </>
  )
}
