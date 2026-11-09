"use client"

import { useEffect, useState } from "react"
import { Palette } from "lucide-react"

const COLORS = [
  { name: "파랑", value: "#3B82F6" },
  { name: "보라", value: "#8B5CF6" },
  { name: "민트", value: "#14B8A6" },
  { name: "분홍", value: "#EC4899" },
  { name: "주황", value: "#F59E0B" },
  { name: "초록", value: "#22C55E" },
]

export function ChildProfileSettings({ profileKey }: { profileKey: string }) {
  const storageKey = `child-profile-accent:${profileKey}`
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(COLORS[0].value)

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    const value = COLORS.some((color) => color.value === saved) ? saved! : COLORS[0].value
    setSelected(value)
    document.documentElement.style.setProperty("--child-accent", value)
  }, [storageKey])

  function choose(value: string) {
    setSelected(value)
    window.localStorage.setItem(storageKey, value)
    document.documentElement.style.setProperty("--child-accent", value)
  }

  return (
    <div className="relative">
      <button type="button" aria-label="프로필 색상 설정" title="프로필 색상 설정" onClick={() => setOpen((value) => !value)} className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
        <Palette className="size-4" />
      </button>
      {open && <div className="absolute right-0 top-full z-50 mt-2 w-48 rounded-2xl border border-border bg-background p-3 shadow-xl">
        <p className="mb-2 text-xs font-bold">내 프로필 색상</p>
        <div className="grid grid-cols-3 gap-2">
          {COLORS.map((color) => <button key={color.value} type="button" aria-label={color.name} title={color.name} onClick={() => choose(color.value)} className={`flex size-10 items-center justify-center rounded-xl border-2 ${selected === color.value ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: color.value }}>
            {selected === color.value && <span className="text-sm font-black text-white">✓</span>}
          </button>)}
        </div>
        <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full rounded-lg bg-muted px-3 py-2 text-xs font-semibold">완료</button>
      </div>}
    </div>
  )
}
