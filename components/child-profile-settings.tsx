"use client"

import { useEffect, useState } from "react"
import { Palette, Sun, Moon, Smartphone, Check } from "lucide-react"

const COLORS = [
  "#14B8A6", "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6",
  "#D946EF", "#EC4899", "#F43F5E", "#F97316", "#F59E0B",
  "#84CC16", "#22C55E", "#64748B", "#475569", "#111827",
]

type ThemeMode = "system" | "light" | "dark"

function normalizeHex(value: string) {
  const raw = value.trim().replace(/^#/, "")
  if (/^[0-9a-fA-F]{3}$/.test(raw)) return "#" + raw.split("").map((c) => c + c).join("").toUpperCase()
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return "#" + raw.toUpperCase()
  return null
}

function applyAppearance(color: string, mode: ThemeMode) {
  const root = document.documentElement
  root.style.setProperty("--child-accent", color)
  root.style.setProperty("--primary", color)
  root.style.setProperty("--ring", color)
  const hex = color.replace("#", "")
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  root.style.setProperty("--primary-foreground", luminance > 0.62 ? "#111827" : "#FFFFFF")
  root.classList.remove("light", "dark")
  if (mode === "light") root.classList.add("light")
  if (mode === "dark") root.classList.add("dark")
  root.dataset.themeMode = mode
}

export function ChildProfileSettings({ profileKey = "family" }: { profileKey?: string }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState("#14B8A6")
  const [hexInput, setHexInput] = useState("#14B8A6")
  const [themeMode, setThemeMode] = useState<ThemeMode>("system")
  const storageKey = "english-word-master-appearance"

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}")
      const color = normalizeHex(typeof saved.color === "string" ? saved.color : "") || "#14B8A6"
      const mode: ThemeMode = ["system", "light", "dark"].includes(saved.mode) ? saved.mode : "system"
      setSelected(color)
      setHexInput(color)
      setThemeMode(mode)
      applyAppearance(color, mode)
    } catch {
      applyAppearance("#14B8A6", "system")
    }
  }, [storageKey, profileKey])

  function save(color: string, mode = themeMode) {
    setSelected(color)
    setHexInput(color)
    setThemeMode(mode)
    applyAppearance(color, mode)
    window.localStorage.setItem(storageKey, JSON.stringify({ color, mode }))
  }

  function updateHex(value: string) {
    setHexInput(value)
    const normalized = normalizeHex(value)
    if (normalized) save(normalized)
  }

  return (
    <div className="relative">
      <button type="button" aria-label="화면 테마 및 색상 설정" title="화면 테마 및 색상 설정" onClick={() => setOpen((value) => !value)} className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
        <Palette className="size-4" />
      </button>
      {open && <>
        <button aria-label="설정 닫기" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(19rem,calc(100vw-2rem))] rounded-2xl border border-border bg-background p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-bold">화면 테마 설정</p>
            <span className="size-5 rounded-full border border-border" style={{ backgroundColor: selected }} />
          </div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">화면 모드</p>
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
            {([
              ["system", "기기 설정", Smartphone],
              ["light", "라이트", Sun],
              ["dark", "다크", Moon],
            ] as const).map(([mode, label, Icon]) => (
              <button key={mode} type="button" onClick={() => save(selected, mode)} className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold ${themeMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <Icon className="size-4" />{label}
              </button>
            ))}
          </div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">메인 테마 색상</p>
          <div className="mb-3 grid grid-cols-5 gap-2">
            {COLORS.map((color) => <button key={color} type="button" aria-label={color} title={color} onClick={() => save(color)} className={`flex size-9 items-center justify-center rounded-full border-2 ${selected === color ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: color }}>
              {selected === color && <Check className="size-4 text-white drop-shadow" />}
            </button>)}
          </div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">세밀한 색상 선택</label>
          <div className="flex items-center gap-2 rounded-xl border border-border p-2">
            <input type="color" aria-label="색상 팔레트" value={selected} onChange={(event) => save(event.target.value.toUpperCase())} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
            <input value={hexInput} onChange={(event) => updateHex(event.target.value)} onBlur={() => setHexInput(selected)} aria-label="HEX 색상 코드" placeholder="#14B8A6" className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
            <span className="text-[10px] text-muted-foreground">HEX</span>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">선택한 색상은 이 기기에 저장되어 주요 버튼과 선택 상태 등에 적용됩니다.</p>
          <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground">완료</button>
        </div>
      </>}
    </div>
  )
}
