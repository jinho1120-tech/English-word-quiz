"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowLeft, Heart, RotateCcw, X } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"

type DefenseWord = { id: number; word: string; meaning: string }

type Monster = {
  id: number
  word: DefenseWord
  lane: number
  depth: number
  speed: number
  phase: number
}

type WordDefenseGameProps = {
  words: DefenseWord[]
  onClose: () => void
}

const WIDTH = 760
const HEIGHT = 620
const LANES = [-0.96, -0.48, 0, 0.48, 0.96]

function normalizeWord(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[’‘`]/g, "'")
}

function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, wobble: number, flash: boolean) {
  const r = radius
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(Math.sin(wobble) * 0.07)
  ctx.shadowColor = flash ? "#ffffff" : "#93c5fd"
  ctx.shadowBlur = flash ? 24 : 10
  ctx.fillStyle = flash ? "#ffffff" : "#f8fbff"
  ctx.beginPath()
  ctx.moveTo(-r, r * 0.72)
  ctx.lineTo(-r, -r * 0.12)
  ctx.bezierCurveTo(-r, -r * 1.25, r, -r * 1.25, r, -r * 0.12)
  ctx.lineTo(r, r * 0.72)
  ctx.quadraticCurveTo(r * 0.65, r * 0.42, r * 0.32, r * 0.72)
  ctx.quadraticCurveTo(0, r * 1.12, -r * 0.32, r * 0.72)
  ctx.quadraticCurveTo(-r * 0.65, r * 0.42, -r, r * 0.72)
  ctx.closePath()
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = "#26324b"
  ctx.beginPath()
  ctx.ellipse(-r * 0.34, -r * 0.08, r * 0.12, r * 0.2, 0, 0, Math.PI * 2)
  ctx.ellipse(r * 0.34, -r * 0.08, r * 0.12, r * 0.2, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = "#26324b"
  ctx.lineWidth = Math.max(1.5, r * 0.07)
  ctx.beginPath()
  ctx.arc(0, r * 0.27, r * 0.16, 0.12, Math.PI - 0.12)
  ctx.stroke()
  ctx.restore()
}

export function WordDefenseGame({ words, onClose }: WordDefenseGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const monstersRef = useRef<Monster[]>([])
  const nextIdRef = useRef(1)
  const scoreRef = useRef(0)
  const livesRef = useRef(3)
  const lastFrameRef = useRef(0)
  const lastSpawnRef = useRef(0)
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [typed, setTyped] = useState("")
  const [gameOver, setGameOver] = useState(false)
  const [paused, setPaused] = useState(false)
  const [message, setMessage] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  const cleanWords = useMemo(() => {
    const seen = new Set<string>()
    return words.filter((item) => {
      const key = normalizeWord(item.word)
      if (!key || !item.meaning.trim() || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [words])

  useEffect(() => {
    monstersRef.current = []
    nextIdRef.current = 1
    scoreRef.current = 0
    livesRef.current = 3
    lastFrameRef.current = 0
    lastSpawnRef.current = 0
    setScore(0)
    setLives(3)
    setTyped("")
    setGameOver(false)
    setPaused(false)
    setMessage("")
  }, [cleanWords])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || gameOver || paused || cleanWords.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let frame = 0
    let alive = true

    const draw = (time: number) => {
      if (!alive) return
      const dt = lastFrameRef.current ? Math.min((time - lastFrameRef.current) / 1000, 0.05) : 0
      lastFrameRef.current = time
      const currentScore = scoreRef.current
      const maxMonsters = Math.min(7, 2 + Math.floor(currentScore / 100))
      const spawnInterval = Math.max(620, 1550 - currentScore * 2.1)

      if (time - lastSpawnRef.current > spawnInterval && monstersRef.current.length < maxMonsters) {
        const occupied = monstersRef.current.map((monster) => monster.lane)
        const available = LANES.filter((lane) => !occupied.includes(lane))
        const lane = available.length ? available[Math.floor(Math.random() * available.length)] : LANES.reduce((best, candidate) => {
          const nearestDepth = (value: number) => monstersRef.current.filter((monster) => monster.lane === value).reduce((min, monster) => Math.min(min, monster.depth), 1)
          return nearestDepth(candidate) > nearestDepth(best) ? candidate : best
        }, LANES[0])
        const usedWords = new Set(monstersRef.current.map((monster) => normalizeWord(monster.word.word)))
        const candidates = cleanWords.filter((item) => !usedWords.has(normalizeWord(item.word)))
        const selected = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : cleanWords[Math.floor(Math.random() * cleanWords.length)]
        monstersRef.current.push({
          id: nextIdRef.current++,
          word: selected,
          lane,
          depth: 0,
          speed: 0.075 + Math.min(0.11, currentScore / 9000),
          phase: Math.random() * Math.PI * 2,
        })
        lastSpawnRef.current = time
      }

      // Deep perspective arena and converging floor lanes.
      const bg = ctx.createLinearGradient(0, 0, 0, HEIGHT)
      bg.addColorStop(0, "#101b35")
      bg.addColorStop(0.58, "#182b4c")
      bg.addColorStop(1, "#07101f")
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, WIDTH, HEIGHT)

      const horizonY = 112
      const horizonX = WIDTH / 2
      const floorTop = horizonY
      ctx.fillStyle = "#172943"
      ctx.beginPath()
      ctx.moveTo(horizonX - 18, floorTop)
      ctx.lineTo(horizonX + 18, floorTop)
      ctx.lineTo(WIDTH + 120, HEIGHT)
      ctx.lineTo(-120, HEIGHT)
      ctx.closePath()
      ctx.fill()

      ctx.strokeStyle = "rgba(96,165,250,0.22)"
      ctx.lineWidth = 2
      for (let i = -5; i <= 5; i++) {
        ctx.beginPath()
        ctx.moveTo(horizonX + i * 5, horizonY)
        ctx.lineTo(horizonX + i * 105, HEIGHT)
        ctx.stroke()
      }
      for (let i = 0; i < 9; i++) {
        const p = i / 8
        const y = horizonY + (HEIGHT - horizonY) * p * p
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(WIDTH, y)
        ctx.stroke()
      }

      // The danger line stays near the player, not at the top of the screen.
      const dangerY = HEIGHT - 72
      ctx.strokeStyle = "rgba(248,113,113,0.9)"
      ctx.setLineDash([12, 10])
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(28, dangerY)
      ctx.lineTo(WIDTH - 28, dangerY)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = "#fecaca"
      ctx.font = "bold 17px sans-serif"
      ctx.textAlign = "center"
      ctx.fillText("방 어 선", WIDTH / 2, dangerY + 28)

      const escaped: number[] = []
      monstersRef.current.forEach((monster, index) => {
        monster.depth += monster.speed * dt
        monster.phase += dt * 3
        if (monster.depth >= 1) {
          escaped.push(index)
          return
        }
        const depth = monster.depth
        const perspective = depth * depth
        const x = WIDTH / 2 + monster.lane * (170 + perspective * 180) + Math.sin(monster.phase) * (2 + depth * 5)
        const y = horizonY + 26 + perspective * (HEIGHT - horizonY - 112)
        const radius = 9 + perspective * 47
        const labelFont = 10 + perspective * 19
        const label = monster.word.meaning
        const labelY = y - radius - 16
        const prefixMatch = typed.length > 0 && normalizeWord(monster.word.word).startsWith(normalizeWord(typed))
        drawGhost(ctx, x, y, radius, monster.phase, prefixMatch)
        ctx.font = `bold ${labelFont}px sans-serif`
        const measured = ctx.measureText(label).width
        const boxWidth = Math.min(230, Math.max(76, measured + 24))
        const boxHeight = 22 + perspective * 12
        ctx.fillStyle = prefixMatch ? "#fde68a" : "rgba(255,255,255,0.94)"
        ctx.beginPath()
        const bx = x - Math.max(boxWidth, labelWidth) / 2
        const by = labelY - boxHeight / 2
        const bw = Math.max(boxWidth, labelWidth)
        ctx.roundRect(bx, by, bw, boxHeight, 10)
        ctx.fill()
        ctx.fillStyle = "#172033"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(label, x, labelY, bw - 14)
        ctx.textBaseline = "alphabetic"
      })

      if (escaped.length) {
        const escapedSet = new Set(escaped)
        monstersRef.current = monstersRef.current.filter((_, index) => !escapedSet.has(index))
        const nextLives = Math.max(0, livesRef.current - escaped.length)
        livesRef.current = nextLives
        setLives(nextLives)
        if (nextLives <= 0) setGameOver(true)
      }

      // Draw a subtle distant glow to strengthen the vanishing-point illusion.
      const glow = ctx.createRadialGradient(horizonX, horizonY, 2, horizonX, horizonY, 180)
      glow.addColorStop(0, "rgba(96,165,250,0.22)")
      glow.addColorStop(1, "rgba(96,165,250,0)")
      ctx.fillStyle = glow
      ctx.fillRect(horizonX - 180, 0, 360, 300)

      frame = window.requestAnimationFrame(draw)
    }

    frame = window.requestAnimationFrame(draw)
    return () => {
      alive = false
      window.cancelAnimationFrame(frame)
      lastFrameRef.current = 0
    }
  }, [cleanWords, gameOver, paused, typed])

  function handleTyping(value: string) {
    const next = value.slice(0, 100)
    setTyped(next)
    setMessage("")
    const normalized = normalizeWord(next)
    if (!normalized) return
    const matchIndex = monstersRef.current.findIndex((monster) => normalizeWord(monster.word.word) === normalized)
    if (matchIndex >= 0) {
      const [defeated] = monstersRef.current.splice(matchIndex, 1)
      const points = 10 + Math.round(defeated.depth * 15)
      scoreRef.current += points
      setScore(scoreRef.current)
      setTyped("")
      setMessage(`+${points}점!`)
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(18)
      window.setTimeout(() => setMessage((current) => current === `+${points}점!` ? "" : current), 650)
    }
  }

  function restart() {
    monstersRef.current = []
    nextIdRef.current = 1
    scoreRef.current = 0
    livesRef.current = 3
    lastFrameRef.current = 0
    lastSpawnRef.current = 0
    setScore(0)
    setLives(3)
    setTyped("")
    setGameOver(false)
    setPaused(false)
    setMessage("")
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-slate-400">WORD DEFENSE</p>
          <p className="text-xl font-black text-foreground">유령 몬스터 타자 디펜스</p>
        </div>
        <HapticButton type="button" onClick={onClose} aria-label="게임 닫기" className="flex size-10 items-center justify-center rounded-full border border-border">
          <X className="size-5" />
        </HapticButton>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-900 p-2 text-center text-white"><p className="text-[10px] text-slate-400">SCORE</p><p className="text-xl font-black tabular-nums">{score}</p></div>
        <div className="rounded-xl bg-slate-900 p-2 text-center text-white"><p className="text-[10px] text-slate-400">LIFE</p><p className="flex justify-center gap-1 pt-1">{[0,1,2].map((item) => <Heart key={item} className={`size-5 ${item < lives ? "fill-rose-500 text-rose-500" : "text-slate-600"}`} />)}</p></div>
        <div className="rounded-xl bg-slate-900 p-2 text-center text-white"><p className="text-[10px] text-slate-400">WORDS</p><p className="text-xl font-black tabular-nums">{cleanWords.length}</p></div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-inner">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="block aspect-[38/31] w-full" aria-label="한글 뜻이 표시된 유령 몬스터들이 원근감 있게 다가오는 게임 화면" />
        {gameOver && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/85 p-5 text-center text-white backdrop-blur-sm"><p className="text-4xl">👻</p><p className="text-2xl font-black">게임 종료!</p><p className="text-sm text-slate-200">최종 점수 {score}점</p><HapticButton onClick={restart} className="flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 font-black text-amber-950"><RotateCcw className="size-4" /> 다시 도전</HapticButton></div>}
        {paused && !gameOver && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-xl font-black text-white">일시정지</div>}
        {message && !gameOver && <div className="pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 rounded-full bg-emerald-400 px-4 py-2 font-black text-emerald-950 shadow-lg">{message}</div>}
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
        <label htmlFor="word-defense-input" className="block text-center text-xs font-bold text-muted-foreground">몬스터의 한글 뜻을 보고 영어단어를 입력하세요</label>
        <input
          ref={inputRef}
          id="word-defense-input"
          value={typed}
          onChange={(event) => handleTyping(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Escape") setTyped("") }}
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          placeholder="영어 단어 입력..."
          disabled={gameOver}
          className="w-full rounded-xl border-2 border-sky-400 bg-background px-4 py-4 text-center text-xl font-black tracking-widest outline-none focus:ring-4 focus:ring-sky-400/20 disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{message || "철자를 완성하면 해당 유령이 사라져요!"}</span>
          <HapticButton type="button" onClick={() => setTyped("")} className="shrink-0 rounded-lg px-2 py-1 font-bold">지우기</HapticButton>
        </div>
      </div>

      <div className="flex gap-2">
        <HapticButton type="button" onClick={() => setPaused((value) => !value)} disabled={gameOver} className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm font-bold">{paused ? "계속하기" : "일시정지"}</HapticButton>
        <HapticButton type="button" onClick={onClose} className="flex-1 rounded-xl bg-muted px-3 py-2.5 text-sm font-bold">나가기</HapticButton>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">오늘 공부한 단어에서 출제돼요 · 몬스터가 방어선에 도달하면 생명이 줄어요.</p>
    </div>
  )
}
