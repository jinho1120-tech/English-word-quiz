"use client"

import { useEffect, useState } from "react"
import { Palette, Sun, Moon, Smartphone, Check } from "lucide-react"

const COLORS = [
  "#14B8A6", "#0EA5E9", "#3B82F6", "#6366F1", "#8B5CF6",
  "#D946EF", "#EC4899", "#F43F5E", "#F97316", "#F59E0B",
  "#84CC16", "#22C55E", "#64748B", "#475569", "#111827",
]

type ThemeMode = "system" | "light" | "dark"

const DEFAULT_THEME_COLOR = "#14B8A6"

function normalizeHex(value: string) {
  const raw = value.trim().replace(/^#/, "")
  if (/^[0-9a-fA-F]{3}$/.test(raw)) return "#" + raw.split("").map((c) => c + c).join("").toUpperCase()
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return "#" + raw.toUpperCase()
  return null
}

function relativeLuminance(color: string) {
  const hex = normalizeHex(color) || DEFAULT_THEME_COLOR
  const channels = [0, 2, 4].map((index) => parseInt(hex.slice(index + 1, index + 3), 16) / 255)
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(first: string, second: string) {
  const a = relativeLuminance(first)
  const b = relativeLuminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function mixHex(first: string, second: string, amount: number) {
  const a = normalizeHex(first) || DEFAULT_THEME_COLOR
  const b = normalizeHex(second) || "#FFFFFF"
  const channels = [0, 2, 4].map((index) => {
    const start = parseInt(a.slice(index + 1, index + 3), 16)
    const end = parseInt(b.slice(index + 1, index + 3), 16)
    return Math.round(start + (end - start) * amount).toString(16).padStart(2, "0")
  })
  return "#" + channels.join("").toUpperCase()
}

function getAccessibleAccent(color: string, isDark: boolean) {
  const surface = isDark ? "#171717" : "#FFFFFF"
  if (contrastRatio(color, surface) >= 4.5) return color
  const target = isDark ? "#FFFFFF" : "#000000"
  for (let step = 1; step <= 100; step += 1) {
    const candidate = mixHex(color, target, step / 100)
    if (contrastRatio(candidate, surface) >= 4.5) return candidate
  }
  return target
}

function getContrastingForeground(color: string) {
  return contrastRatio(color, "#000000") >= contrastRatio(color, "#FFFFFF") ? "#000000" : "#FFFFFF"
}

function applyAppearance(color: string, mode: ThemeMode) {
  const root = document.documentElement
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const isDark = mode === "dark" || (mode === "system" && prefersDark)
  const sourceColor = normalizeHex(color) || DEFAULT_THEME_COLOR
  const accent = getAccessibleAccent(sourceColor, isDark)
  const foreground = getContrastingForeground(accent)

  // Central owner for global theme tokens shared by parent and child apps.
  root.style.setProperty("--primary", accent)
  root.style.setProperty("--primary-foreground", foreground)
  root.style.setProperty("--ring", accent)
  root.style.setProperty("--child-accent", accent)
  root.style.setProperty("--child-accent-foreground", foreground)
  root.dataset.themeSourceColor = sourceColor

  root.classList.remove("light", "dark")
  if (mode === "light") root.classList.add("light")
  if (mode === "dark") root.classList.add("dark")
  root.dataset.themeMode = mode

  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", accent)
}

export function ChildProfileSettings({ profileKey = "family" }: { profileKey?: string }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState("#14B8A6")
  const [hexInput, setHexInput] = useState("#14B8A6")
  const [themeMode, setThemeMode] = useState<ThemeMode>("system")
  const storageKey = "english-word-master-appearance"

  useEffect(() => {
    function loadSavedAppearance() {
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}")
        const color = normalizeHex(typeof saved.color === "string" ? saved.color : "") || DEFAULT_THEME_COLOR
        const mode: ThemeMode = ["system", "light", "dark"].includes(saved.mode) ? saved.mode : "system"
        setSelected(color)
        setHexInput(color)
        setThemeMode(mode)
        applyAppearance(color, mode)
      } catch {
        setSelected(DEFAULT_THEME_COLOR)
        setHexInput(DEFAULT_THEME_COLOR)
        setThemeMode("system")
        applyAppearance(DEFAULT_THEME_COLOR, "system")
      }
    }
    loadSavedAppearance()

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    function handleSystemThemeChange() {
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}")
        if (saved.mode === "system" || !["light", "dark"].includes(saved.mode)) {
          const color = normalizeHex(typeof saved.color === "string" ? saved.color : "") || DEFAULT_THEME_COLOR
          applyAppearance(color, "system")
        }
      } catch {
        applyAppearance(DEFAULT_THEME_COLOR, "system")
      }
    }
    media.addEventListener("change", handleSystemThemeChange)
    return () => media.removeEventListener("change", handleSystemThemeChange)
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
              <button key={mode} type="button" aria-pressed={themeMode === mode} onClick={() => save(selected, mode)} className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold ${themeMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}>
                <Icon className="size-4" />{label}
              </button>
            ))}
          </div>
          <p className="mb-2 text-xs font-semibold text-muted-foreground">메인 테마 색상</p>
          <div className="mb-3 grid grid-cols-5 gap-2">
            {COLORS.map((color) => <button key={color} type="button" aria-label={color} aria-pressed={selected === color} title={color} onClick={() => save(color)} className={`flex size-9 items-center justify-center rounded-full border-2 ${selected === color ? "border-foreground" : "border-transparent"}`} style={{ backgroundColor: color }}>
              {selected === color && <Check className="size-4 drop-shadow" style={{ color: getContrastingForeground(color) }} />}
            </button>)}
          </div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">세밀한 색상 선택</label>
          <div className="flex items-center gap-2 rounded-xl border border-border p-2">
            <input type="color" aria-label="색상 팔레트" value={selected} onChange={(event) => save(event.target.value.toUpperCase())} className="size-9 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
            <input value={hexInput} onChange={(event) => updateHex(event.target.value)} onBlur={() => setHexInput(selected)} aria-label="HEX 색상 코드" placeholder="#14B8A6" className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
            <span className="text-[10px] text-muted-foreground">HEX</span>
          </div>
          <div className="mt-3 space-y-2 rounded-xl border border-border bg-card p-3">
            <p className="text-[11px] font-bold text-muted-foreground">적용 미리보기</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">주요 버튼</span>
              <span className="rounded-lg bg-primary-container px-3 py-2 text-xs font-semibold text-primary-container-foreground">선택된 메뉴</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full w-2/3 rounded-full bg-primary" />
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">색상은 이 브라우저의 기기에 저장됩니다. 밝거나 어두운 색은 가독성을 위해 강조색의 명도가 자동 조정될 수 있습니다.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => save(DEFAULT_THEME_COLOR, "system")} className="rounded-xl border border-border px-3 py-2.5 text-xs font-semibold text-muted-foreground">기본 테마 복원</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground">완료</button>
          </div>
        </div>
      </>}
    </div>
  )
}
