"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Heart, RotateCcw, X } from "lucide-react"
import { HapticButton } from "@/components/haptic-button"

type DefenseWord = { id: number; word: string; meaning: string }

type GhostMood = "mischievous" | "angry" | "surprised" | "worried" | "sleepy"

type Monster = {
  id: number
  word: DefenseWord
  lane: number
  depth: number
  speed: number
  phase: number
  mood: GhostMood
}

type DefeatEffect = {
  id: number
  word: string
  lane: number
  startDepth: number
  age: number
  phase: number
  mood: GhostMood
}

type Difficulty = "easy" | "normal" | "hard"

const DIFFICULTY_CONFIG: Record<Difficulty, {
  label: string
  speedMultiplier: number
  initialSpawnInterval: number
  minSpawnInterval: number
  scoreMultiplier: number
  monsterLimit: number
  spawnProgressStep: number
  speedDescription: string
}> = {
  easy: {
    label: "쉬움",
    speedMultiplier: 0.65,
    initialSpawnInterval: 5000,
    minSpawnInterval: 1800,
    scoreMultiplier: 1,
    monsterLimit: 3,
    spawnProgressStep: 220,
    speedDescription: "천천히 · 3마리",
  },
  normal: {
    label: "보통",
    speedMultiplier: 1,
    initialSpawnInterval: 3600,
    minSpawnInterval: 1050,
    scoreMultiplier: 1.5,
    monsterLimit: 5,
    spawnProgressStep: 150,
    speedDescription: "기본 속도 · 5마리",
  },
  hard: {
    label: "어려움",
    speedMultiplier: 1.3,
    initialSpawnInterval: 3000,
    minSpawnInterval: 800,
    scoreMultiplier: 2,
    monsterLimit: 5,
    spawnProgressStep: 130,
    speedDescription: "빠르게 · 5마리",
  },
}

const DIFFICULTY_OPTIONS: Difficulty[] = ["easy", "normal", "hard"]

function shuffleWords(items: DefenseWord[]) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }
  return shuffled
}

function uniqueWords(items: DefenseWord[]) {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = normalizeWord(item.word)
    if (!key || !item.meaning.trim() || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

type WordDefenseGameProps = {
  words: DefenseWord[]
  subjectWords: DefenseWord[]
  allWords: DefenseWord[]
  onClose: () => void
}

const WIDTH = 760
const HEIGHT = 420
const LANES = [-0.96, -0.48, 0, 0.48, 0.96]

function normalizeWord(value: string) {
  return value.trim().toLocaleLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, "")
}

function drawGhost(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, wobble: number, flash: boolean, mood: GhostMood) {
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

  const eyeY = mood === "surprised" ? -r * 0.12 : -r * 0.08
  if (mood === "sleepy") {
    ctx.lineWidth = Math.max(1.8, r * 0.09)
    ctx.strokeStyle = "#26324b"
    ctx.beginPath()
    ctx.moveTo(-r * 0.48, eyeY)
    ctx.quadraticCurveTo(-r * 0.34, eyeY + r * 0.1, -r * 0.2, eyeY)
    ctx.moveTo(r * 0.2, eyeY)
    ctx.quadraticCurveTo(r * 0.34, eyeY + r * 0.1, r * 0.48, eyeY)
    ctx.stroke()
  } else {
    const eyeHeight = mood === "surprised" ? r * 0.25 : mood === "worried" ? r * 0.14 : r * 0.2
    ctx.beginPath()
    ctx.ellipse(-r * 0.34, eyeY, r * 0.12, eyeHeight, 0, 0, Math.PI * 2)
    ctx.ellipse(r * 0.34, eyeY, r * 0.12, eyeHeight, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.strokeStyle = "#26324b"
  ctx.fillStyle = "#26324b"
  ctx.lineWidth = Math.max(1.5, r * 0.07)
  ctx.lineCap = "round"
  ctx.beginPath()
  if (mood === "angry") {
    ctx.moveTo(-r * 0.5, -r * 0.38)
    ctx.lineTo(-r * 0.2, -r * 0.25)
    ctx.moveTo(r * 0.5, -r * 0.38)
    ctx.lineTo(r * 0.2, -r * 0.25)
    ctx.moveTo(-r * 0.18, r * 0.34)
    ctx.lineTo(r * 0.18, r * 0.34)
    ctx.stroke()
  } else if (mood === "surprised") {
    ctx.beginPath()
    ctx.ellipse(0, r * 0.31, r * 0.13, r * 0.19, 0, 0, Math.PI * 2)
    ctx.fill()
  } else if (mood === "worried") {
    ctx.moveTo(-r * 0.18, r * 0.42)
    ctx.quadraticCurveTo(0, r * 0.18, r * 0.18, r * 0.42)
    ctx.stroke()
  } else if (mood === "sleepy") {
    ctx.moveTo(-r * 0.12, r * 0.3)
    ctx.lineTo(r * 0.12, r * 0.3)
    ctx.stroke()
  } else {
    ctx.moveTo(-r * 0.2, r * 0.2)
    ctx.quadraticCurveTo(-r * 0.02, r * 0.48, r * 0.2, r * 0.2)
    ctx.stroke()
  }
  ctx.restore()
}

export function WordDefenseGame({ words, subjectWords, allWords, onClose }: WordDefenseGameProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const monstersRef = useRef<Monster[]>([])
  const defeatEffectsRef = useRef<DefeatEffect[]>([])
  const wordDeckRef = useRef<DefenseWord[]>([])
  const deckTierRef = useRef(0)
  const lastDeckWordRef = useRef("")
  const missedWordsRef = useRef<DefenseWord[]>([])
  const nextIdRef = useRef(1)
  const scoreRef = useRef(0)
  // 배율 적용 점수와 난이도 진행도를 분리해 높은 배율이 난이도를 과속시키지 않게 한다.
  const progressScoreRef = useRef(0)
  const livesRef = useRef(3)
  const lastFrameRef = useRef(0)
  const lastSpawnRef = useRef(0)
  const [score, setScore] = useState(0)
  const [difficulty, setDifficulty] = useState<Difficulty>("easy")
  const [lives, setLives] = useState(3)
  const [typed, setTyped] = useState("")
  const [gameOver, setGameOver] = useState(false)
  const [started, setStarted] = useState(false)
  const [paused, setPaused] = useState(false)
  const [message, setMessage] = useState("")
  const [missedWords, setMissedWords] = useState<DefenseWord[]>([])
  const inputRef = useRef<HTMLInputElement | null>(null)

  const cleanWords = useMemo(() => uniqueWords(words), [words])
  const cleanSubjectWords = useMemo(() => uniqueWords(subjectWords), [subjectWords])
  const cleanAllWords = useMemo(() => uniqueWords(allWords), [allWords])
  const currentTier = (value: number) => value >= 250 ? 2 : value >= 100 ? 1 : 0
  const poolForTier = (tier: number) => tier === 2 ? cleanAllWords : tier === 1 ? cleanSubjectWords : cleanWords

  useEffect(() => {
    monstersRef.current = []
    defeatEffectsRef.current = []
    wordDeckRef.current = shuffleWords(cleanWords)
    deckTierRef.current = 0
    lastDeckWordRef.current = ""
    missedWordsRef.current = []
    setMissedWords([])
    nextIdRef.current = 1
    scoreRef.current = 0
    progressScoreRef.current = 0
    livesRef.current = 3
    lastFrameRef.current = 0
    lastSpawnRef.current = 0
    setScore(0)
    setLives(3)
    setTyped("")
    setGameOver(false)
    setStarted(false)
    setPaused(false)
    setMessage("")
  }, [cleanWords])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !started || gameOver || paused || cleanWords.length === 0) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return
    let frame = 0
    let alive = true

    const draw = (time: number) => {
      if (!alive) return
      const dt = lastFrameRef.current ? Math.min((time - lastFrameRef.current) / 1000, 0.05) : 0
      lastFrameRef.current = time
      const progressScore = progressScoreRef.current
      const mode = DIFFICULTY_CONFIG[difficulty]
      const tier = currentTier(progressScore)
      const activePool = poolForTier(tier)
      const maxMonsters = Math.min(mode.monsterLimit, 1 + Math.floor(progressScore / mode.spawnProgressStep))
      const spawnInterval = Math.max(mode.minSpawnInterval, mode.initialSpawnInterval - progressScore * 2.8)

      if (tier !== deckTierRef.current) {
        const activeWords = new Set(monstersRef.current.map((monster) => normalizeWord(monster.word.word)))
        wordDeckRef.current = shuffleWords(activePool.filter((item) => !activeWords.has(normalizeWord(item.word))))
        deckTierRef.current = tier
      }

      if (time - lastSpawnRef.current > spawnInterval && monstersRef.current.length < maxMonsters) {
        const occupied = monstersRef.current.map((monster) => monster.lane)
        const available = LANES.filter((lane) => !occupied.includes(lane))
        const lane = available.length ? available[Math.floor(Math.random() * available.length)] : LANES.reduce((best, candidate) => {
          const nearestDepth = (value: number) => monstersRef.current.filter((monster) => monster.lane === value).reduce((min, monster) => Math.min(min, monster.depth), 1)
          return nearestDepth(candidate) > nearestDepth(best) ? candidate : best
        }, LANES[0])
        const usedWords = new Set(monstersRef.current.map((monster) => normalizeWord(monster.word.word)))
        if (wordDeckRef.current.length === 0) {
          wordDeckRef.current = shuffleWords(activePool)
          if (wordDeckRef.current.length > 1 && normalizeWord(wordDeckRef.current[0].word) === lastDeckWordRef.current) {
            ;[wordDeckRef.current[0], wordDeckRef.current[1]] = [wordDeckRef.current[1], wordDeckRef.current[0]]
          }
        }
        let deckIndex = wordDeckRef.current.findIndex((item) => !usedWords.has(normalizeWord(item.word)))
        if (deckIndex >= 0) {
          const [selected] = wordDeckRef.current.splice(deckIndex, 1)
          lastDeckWordRef.current = normalizeWord(selected.word)
          monstersRef.current.push({
            id: nextIdRef.current++,
            word: selected,
            lane,
            depth: 0,
            speed: (0.026 + Math.min(0.022, progressScore / 30000)) * mode.speedMultiplier,
            phase: Math.random() * Math.PI * 2,
            mood: (["mischievous", "angry", "surprised", "worried", "sleepy"] as GhostMood[])[Math.floor(Math.random() * 5)],
          })
        }
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
        const x = WIDTH / 2 + monster.lane * (180 + perspective * 100) + Math.sin(monster.phase) * (2 + depth * 5)
        const y = horizonY + 26 + perspective * (HEIGHT - horizonY - 112)
        const radius = 9 + perspective * 47
        const labelFont = 16 + perspective * 9
        const label = monster.word.meaning
        const prefixMatch = typed.length > 0 && normalizeWord(monster.word.word).startsWith(normalizeWord(typed))
        drawGhost(ctx, x, y, radius, monster.phase, prefixMatch, monster.mood)
        ctx.font = `bold ${labelFont}px sans-serif`
        const maxTextWidth = 250
        const lines: string[] = []
        let line = ""
        for (const character of label) {
          const candidate = line + character
          if (line && ctx.measureText(candidate).width > maxTextWidth) {
            lines.push(line)
            line = character
          } else {
            line = candidate
          }
        }
        if (line) lines.push(line)
        const boxWidth = Math.min(278, Math.max(92, ...lines.map((item) => ctx.measureText(item).width + 24)))
        const lineHeight = labelFont * 1.2
        const boxHeight = Math.max(34, lines.length * lineHeight + 14)
        const labelY = Math.max(boxHeight / 2 + 8, y - radius - 18 - boxHeight / 2)
        ctx.fillStyle = prefixMatch ? "#fde68a" : "rgba(255,255,255,0.96)"
        ctx.beginPath()
        const bx = Math.max(8, Math.min(WIDTH - boxWidth - 8, x - boxWidth / 2))
        const by = labelY - boxHeight / 2
        ctx.roundRect(bx, by, boxWidth, boxHeight, 10)
        ctx.fill()
        ctx.fillStyle = "#172033"
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        lines.forEach((item, lineIndex) => {
          const lineY = labelY + (lineIndex - (lines.length - 1) / 2) * lineHeight
          ctx.fillText(item, bx + boxWidth / 2, lineY)
        })
        ctx.textBaseline = "alphabetic"
      })

      if (escaped.length) {
        const escapedSet = new Set(escaped)
        const missed = escaped.map((index) => monstersRef.current[index].word)
        const knownMisses = new Set(missedWordsRef.current.map((item) => normalizeWord(item.word)))
        const newMisses = missed.filter((item) => !knownMisses.has(normalizeWord(item.word)))
        if (newMisses.length) {
          missedWordsRef.current = [...missedWordsRef.current, ...newMisses]
          setMissedWords([...missedWordsRef.current])
        }
        monstersRef.current = monstersRef.current.filter((_, index) => !escapedSet.has(index))
        const nextLives = Math.max(0, livesRef.current - escaped.length)
        livesRef.current = nextLives
        setLives(nextLives)
        if (nextLives <= 0) setGameOver(true)
      }

      // Correctly answered ghosts spin, turn into their spelling, then retreat toward the horizon.
      defeatEffectsRef.current = defeatEffectsRef.current.filter((effect) => effect.age < 0.72)
      defeatEffectsRef.current.forEach((effect) => {
        effect.age += dt
        const progress = Math.min(1, effect.age / 0.72)
        const retreat = progress * progress
        const depth = effect.startDepth * (1 - retreat)
        const perspective = depth * depth
        const x = WIDTH / 2 + effect.lane * (180 + perspective * 100)
        const y = horizonY + 26 + perspective * (HEIGHT - horizonY - 112)
        const radius = (9 + perspective * 47) * (1 - progress * 0.28)
        const alpha = Math.max(0, 1 - progress)
        if (progress < 0.34) {
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.translate(x, y)
          ctx.rotate(progress / 0.34 * Math.PI * 2)
          drawGhost(ctx, 0, 0, radius, effect.phase + effect.age * 12, true, effect.mood)
          ctx.restore()
        }
        if (progress > 0.16) {
          const reveal = Math.min(1, (progress - 0.16) / 0.24)
          const wordProgress = (progress - 0.16) / 0.84
          ctx.save()
          ctx.globalAlpha = alpha * reveal
          ctx.translate(x, y - radius * 0.15)
          ctx.rotate((1 - reveal) * Math.PI * 0.7 + Math.sin(effect.age * 24) * 0.05)
          const scale = Math.max(0.42, 1 - wordProgress * 0.55)
          ctx.scale(scale, scale)
          ctx.font = "900 22px sans-serif"
          ctx.textAlign = "center"
          ctx.textBaseline = "middle"
          ctx.shadowColor = "#67e8f9"
          ctx.shadowBlur = 18
          ctx.fillStyle = "#a5f3fc"
          ctx.fillText(effect.word, 0, 0, 260)
          ctx.restore()
        }
      })

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
  }, [cleanWords, cleanSubjectWords, cleanAllWords, difficulty, gameOver, paused, started, typed])

  function handleTyping(value: string) {
    const next = value.slice(0, 100)
    setTyped(next)
    setMessage("")
    const normalized = normalizeWord(next)
    if (!normalized) return
    const matchIndex = monstersRef.current.findIndex((monster) => normalizeWord(monster.word.word) === normalized)
    if (matchIndex >= 0) {
      const [defeated] = monstersRef.current.splice(matchIndex, 1)
      defeatEffectsRef.current.push({
        id: defeated.id,
        word: defeated.word.word.toUpperCase(),
        lane: defeated.lane,
        startDepth: defeated.depth,
        age: 0,
        phase: defeated.phase,
        mood: defeated.mood,
      })
      const basePoints = 10 + Math.round(defeated.depth * 15)
      progressScoreRef.current += basePoints
      const points = Math.round(basePoints * DIFFICULTY_CONFIG[difficulty].scoreMultiplier)
      scoreRef.current += points
      setScore(scoreRef.current)
      setTyped("")
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(18)
    }
  }

  function restart() {
    monstersRef.current = []
    defeatEffectsRef.current = []
    wordDeckRef.current = shuffleWords(cleanWords)
    deckTierRef.current = 0
    lastDeckWordRef.current = ""
    missedWordsRef.current = []
    setMissedWords([])
    nextIdRef.current = 1
    scoreRef.current = 0
    progressScoreRef.current = 0
    livesRef.current = 3
    lastFrameRef.current = 0
    lastSpawnRef.current = performance.now()
    setScore(0)
    setLives(3)
    setTyped("")
    setGameOver(false)
    setStarted(true)
    setPaused(false)
    setMessage("")
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-1 sm:px-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold tracking-[0.18em] text-slate-400">WORD DEFENSE</p>
          <p className="text-xl font-black text-foreground">유령 몬스터 타자 디펜스</p>
        </div>
        <HapticButton type="button" onClick={onClose} aria-label="게임 닫기" className="flex size-10 items-center justify-center rounded-full border border-border">
          <X className="size-5" />
        </HapticButton>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-inner">
        <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} className="block h-auto max-h-[560px] w-full" aria-label="한글 뜻이 표시된 유령 몬스터들이 원근감 있게 다가오는 게임 화면" />
        <div className="pointer-events-none absolute left-2 right-2 top-2 z-10 flex items-start justify-between gap-2">
          <div className="rounded-lg border border-white/10 bg-slate-950/75 px-2 py-1 text-left text-white shadow-lg backdrop-blur-sm">
            <p className="text-[8px] font-bold tracking-wider text-slate-300">SCORE · {DIFFICULTY_CONFIG[difficulty].label}</p>
            <p className="text-sm font-black leading-tight tabular-nums">{score}</p>
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-slate-950/75 px-2 py-1.5 text-white shadow-lg backdrop-blur-sm" aria-label={`남은 생명 ${lives}개`}>
            <p className="mr-0.5 text-[8px] font-bold tracking-wider text-slate-300">LIFE</p>
            {[0,1,2].map((item) => <Heart key={item} className={`size-4 ${item < lives ? "fill-rose-500 text-rose-500" : "text-slate-600"}`} />)}
          </div>
        </div>
        {!started && !gameOver && <div className="absolute inset-0 flex min-h-0 flex-col items-center justify-center gap-1 overflow-hidden bg-slate-950/90 px-2 py-1.5 text-center text-white backdrop-blur-sm">
          <p className="shrink-0 text-xl leading-none">👻</p>
          <p className="shrink-0 text-base font-black leading-tight">게임 방법</p>
          <div className="grid w-full max-w-sm shrink-0 grid-cols-2 gap-x-2 gap-y-0.5 rounded-lg bg-white/10 px-2 py-1 text-left text-[10px] leading-tight">
            <p>① 한글 뜻을 확인해요</p>
            <p>② 영어 단어를 입력해요</p>
            <p>③ 정답이면 유령이 도망가요</p>
            <p>④ 방어선 전에 물리쳐요</p>
          </div>
          <p className="shrink-0 text-[9px] font-bold leading-tight text-sky-100">난이도를 선택하세요</p>
          <div className="grid w-full max-w-sm shrink-0 grid-cols-3 gap-1">
            {DIFFICULTY_OPTIONS.map((option) => {
              const config = DIFFICULTY_CONFIG[option]
              const selected = difficulty === option
              return (
                <HapticButton
                  key={option}
                  type="button"
                  onClick={() => setDifficulty(option)}
                  aria-pressed={selected}
                  className={selected ? "flex min-w-0 flex-col items-center rounded-lg border border-sky-300 bg-sky-400/25 px-1 py-1 text-center text-white ring-1 ring-sky-300" : "flex min-w-0 flex-col items-center rounded-lg border border-white/15 bg-white/5 px-1 py-1 text-center text-slate-200"}
                >
                  <span className="text-[11px] font-black">{config.label}</span>
                  <span className="text-[8px] leading-tight opacity-90">{config.speedDescription}</span>
                  <span className="text-[9px] font-bold text-amber-200">점수 ×{config.scoreMultiplier}</span>
                </HapticButton>
              )
            })}
          </div>
          <p className="shrink-0 text-[8px] leading-tight text-sky-200">쉬움은 유령이 천천히 오고, 어려움은 더 빠르게 등장해요.</p>
          <HapticButton onClick={() => { lastSpawnRef.current = performance.now(); setStarted(true); requestAnimationFrame(() => inputRef.current?.focus()) }} className="shrink-0 rounded-lg bg-amber-400 px-5 py-1.5 text-xs font-black leading-tight text-amber-950 shadow-lg">게임 시작!</HapticButton>
        </div>}
        {gameOver && <div className="absolute inset-0 flex min-h-0 flex-col items-center justify-center gap-1 overflow-hidden bg-slate-950/90 px-2 py-1.5 text-center text-white backdrop-blur-sm"><p className="text-2xl leading-none">👻</p><p className="text-lg font-black leading-tight">게임 종료!</p><div className="flex shrink-0 items-center gap-3 text-xs"><p className="text-slate-200">최종 점수 <strong>{score}점</strong></p><p className="font-bold">놓친 단어 {missedWords.length}개</p></div><HapticButton onClick={restart} className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-400 px-4 py-1.5 text-xs font-black leading-tight text-amber-950"><RotateCcw className="size-3.5" /> 다시 도전</HapticButton></div>}
        {paused && !gameOver && <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-xl font-black text-white">일시정지</div>}

      </div>

      <div className="space-y-1.5 rounded-2xl border border-border bg-card p-2">
        <label htmlFor="word-defense-input" className="block text-center text-[11px] font-bold leading-tight text-muted-foreground">몬스터의 한글 뜻을 보고 영어단어를 입력하세요</label>
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
          disabled={gameOver || !started}
          className="w-full rounded-xl border-2 border-sky-400 bg-background px-3 py-2.5 text-center text-lg font-black tracking-wide outline-none focus:ring-4 focus:ring-sky-400/20 disabled:opacity-50"
        />
        <div className="flex items-center justify-between gap-2 text-[10px] leading-tight text-muted-foreground">
          <span>정답을 맞히면 유령이 영단어로 변해 도망가요!</span>
          <HapticButton type="button" onClick={() => setTyped("")} className="shrink-0 rounded-lg px-2 py-0.5 font-bold">지우기</HapticButton>
        </div>
      </div>

      <div className="rounded-xl border border-amber-300/40 bg-amber-50/70 p-3 dark:bg-amber-950/20">
        <div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-black text-amber-800 dark:text-amber-200">방어선 · 놓친 단어</p><span className="text-[11px] font-bold text-muted-foreground">{missedWords.length}개</span></div>
        {missedWords.length ? <div className="flex flex-wrap gap-2">{missedWords.slice(-5).map((item) => <span key={normalizeWord(item.word)} className="rounded-lg bg-background px-2.5 py-1.5 text-xs shadow-sm"><strong>{item.word}</strong><span className="ml-1.5 text-muted-foreground">{item.meaning}</span></span>)}</div> : <p className="text-xs text-muted-foreground">놓친 단어가 여기에 쌓여요. 정답을 확인하고 다시 기억해 봐요.</p>}
      </div>

      <div className="flex gap-2">
        <HapticButton type="button" onClick={() => setPaused((value) => !value)} disabled={gameOver} className="flex-1 rounded-xl border border-border px-3 py-2.5 text-sm font-bold">{paused ? "계속하기" : "일시정지"}</HapticButton>
        <HapticButton type="button" onClick={onClose} className="flex-1 rounded-xl bg-muted px-3 py-2.5 text-sm font-bold">나가기</HapticButton>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">처음엔 선택한 날짜·과목에서, 점수가 오르면 같은 과목 전체와 이 자녀의 다른 과목 단어까지 출제돼요. 몬스터가 방어선을 넘으면 정답이 복습 목록에 남아요.</p>
    </div>
  )
}
