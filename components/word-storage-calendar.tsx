"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, Palette, X } from "lucide-react"
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
function formatSelectedDate(value: string) {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][date.getUTCDay()]
  return `${month}월 ${day}일 (${weekday})`
}

export function WordStorageCalendar({ selectedDate, subjects, initialStorage, onSelectDate }: {
  selectedDate: string
  subjects: Subject[]
  initialStorage: StorageDate[]
  onSelectDate: (date: string) => void
}) {
  const [month, setMonth] = useState(() => new Date(Number(selectedDate.slice(0, 4)), Number(selectedDate.slice(5, 7)) - 1, 1))
  const [storage, setStorage] = useState(initialStorage)
  const [colors, setColors] = useState<Record<string, string>>(() => Object.fromEntries(subjects.map((s) => [s.id, s.color])))
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [isColorSettingsOpen, setIsColorSettingsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const key = monthKey(month)

  useEffect(() => {
    const [year, monthNumber] = selectedDate.split("-").map(Number)
    setMonth((current) => current.getFullYear() === year && current.getMonth() === monthNumber - 1
      ? current
      : new Date(year, monthNumber - 1, 1))
  }, [selectedDate])

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

  function chooseDate(value: string) {
    onSelectDate(value)
    setIsCalendarOpen(false)
  }

  return (
    <section className="relative rounded-2xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-5 shrink-0" style={{ color: "var(--child-accent, #14B8A6)" }} />
          <div className="min-w-0">
            <p className="text-sm font-black text-foreground">{formatSelectedDate(selectedDate)}</p>
            <p className="text-[10px] text-muted-foreground">날짜별 단어 저장 공간</p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={isCalendarOpen}
          onClick={() => setIsCalendarOpen((open) => !open)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground"
        >
          <CalendarDays className="size-3.5" />
          {isCalendarOpen ? "달력 닫기" : "날짜 변경"}
        </button>
      </div>

      {isCalendarOpen && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-border bg-card p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" onClick={() => setMonth((v) => new Date(v.getFullYear(), v.getMonth() - 1, 1))} className="rounded-lg p-2 hover:bg-muted" aria-label="이전 달">
              <ChevronLeft className="size-5" />
            </button>
            <h2 className="text-sm font-bold">{year}년 {monthIndex + 1}월</h2>
            <button type="button" onClick={() => setMonth((v) => new Date(v.getFullYear(), v.getMonth() + 1, 1))} className="rounded-lg p-2 hover:bg-muted" aria-label="다음 달">
              <ChevronRight className="size-5" />
            </button>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted-foreground">
            {["일", "월", "화", "수", "목", "금", "토"].map((day) => <div key={day}>{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: offset }, (_, index) => <div key={`blank-${index}`} />)}
            {Array.from({ length: days }, (_, index) => {
              const day = index + 1
              const value = dateKey(year, monthIndex, day)
              const ids = Array.from(dotsByDate.get(value) ?? [])
              const active = selectedDate === value
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseDate(value)}
                  aria-pressed={active}
                  className={`flex min-h-10 flex-col items-center justify-center rounded-xl text-xs transition-colors ${active ? "font-black text-white" : "font-medium hover:bg-muted"}`}
                  style={active ? { backgroundColor: "var(--child-accent, #14B8A6)" } : undefined}
                >
                  <span>{day}</span>
                  <span className="mt-0.5 flex h-2 items-center justify-center gap-0.5">
                    {ids.slice(0, 5).map((id) => (
                      <i key={id} className="h-1.5 w-1.5 rounded-full ring-1 ring-white/80" style={{ backgroundColor: colors[id] ?? subjects.find((s) => s.id === id)?.color ?? "#2563EB" }} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
            <p className="text-[10px] text-muted-foreground">점은 과목별 단어 저장 날짜를 표시해요.</p>
            <button type="button" onClick={() => setIsColorSettingsOpen(true)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold" style={{ color: "var(--child-accent, #14B8A6)" }}>
              <Palette className="size-3.5" /> 과목 색상
            </button>
          </div>
        </div>
      )}

      {isColorSettingsOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4" role="presentation" onClick={() => setIsColorSettingsOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="subject-color-title" className="w-full max-w-sm rounded-2xl border border-border bg-background p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 id="subject-color-title" className="font-black">과목별 달력 색상</h3>
              <button type="button" aria-label="닫기" onClick={() => setIsColorSettingsOpen(false)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
            </div>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">과목 색상은 기본값으로 자동 지정돼요. 원하는 과목만 직접 바꿀 수 있어요.</p>
            <div className="max-h-[55vh] space-y-4 overflow-y-auto">
              {subjects.map((subject) => (
                <div key={subject.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: colors[subject.id] ?? subject.color }} />
                    <span className="truncate text-sm font-semibold">{subject.name}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {COLORS.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        aria-label={`${subject.name} 색상 ${color.label}`}
                        aria-pressed={(colors[subject.id] ?? subject.color) === color.value}
                        disabled={isPending}
                        onClick={() => changeColor(subject.id, color.value)}
                        className={`size-6 rounded-full border-2 ${(colors[subject.id] ?? subject.color) === color.value ? "border-foreground ring-2 ring-ring ring-offset-1" : "border-transparent"}`}
                        style={{ backgroundColor: color.value }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label={subject.name + " 사용자 지정 색상"}
                      value={colors[subject.id] ?? subject.color}
                      disabled={isPending}
                      onChange={(event) => changeColor(subject.id, event.target.value.toUpperCase())}
                      className="size-7 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                    />
                  </div>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setIsColorSettingsOpen(false)} className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">완료</button>
          </div>
        </div>
      )}
    </section>
  )
}
