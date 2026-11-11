import { existsSync, readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"

const requiredFiles = [
  "AGENTS.md",
  ".github/copilot-instructions.md",
  ".github/pull_request_template.md",
  "docs/design-system.md",
  "app/globals.css",
  "components/child-profile-settings.tsx",
  "components/child-learning.tsx",
  "components/word-quiz.tsx",
]

const errors = []
for (const file of requiredFiles) {
  if (!existsSync(file)) errors.push(`필수 디자인 시스템 파일이 없습니다: ${file}`)
}

const css = existsSync("app/globals.css") ? readFileSync("app/globals.css", "utf8") : ""
for (const token of [
  "--color-primary-container: var(--primary-container)",
  "--color-primary-container-foreground: var(--primary-container-foreground)",
  "--primary-container:",
  "--theme-outline:",
  "--child-accent:",
]) {
  if (!css.includes(token)) errors.push(`app/globals.css에 디자인 토큰이 없습니다: ${token}`)
}

const palettePath = "components/child-profile-settings.tsx"
const palette = existsSync(palettePath) ? readFileSync(palettePath, "utf8") : ""
for (const marker of [
  "function getAccessibleAccent(",
  "function getContrastingForeground(",
  "function applyAppearance(",
  'setProperty("--primary", accent)',
  'setProperty("--child-accent", accent)',
  'meta[name="theme-color"]',
]) {
  if (!palette.includes(marker)) errors.push(`테마 팔레트의 필수 접근성/동기화 구현이 없습니다: ${marker}`)
}

const quiz = existsSync("components/word-quiz.tsx") ? readFileSync("components/word-quiz.tsx", "utf8") : ""
if (!quiz.includes("function accentTint(") || !quiz.includes("color-mix(in srgb")) {
  errors.push("퀴즈 강조색은 CSS 변수와 호환되는 color-mix 방식으로 투명도를 표현해야 합니다.")
}

const mutationPattern = /\.style\.setProperty\(\s*["']--(?:primary|primary-foreground|ring|child-accent|child-accent-foreground)["']/g
function walk(directory) {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return walk(path)
    return /\.(tsx|ts|jsx|js)$/.test(entry.name) ? [path] : []
  })
}

for (const path of ["app", "components", "lib"].flatMap(walk)) {
  const normalized = relative(".", path).replaceAll("\\", "/")
  if (normalized === palettePath) continue
  const source = readFileSync(path, "utf8")
  if (mutationPattern.test(source)) errors.push(`전역 테마 색상은 ChildProfileSettings에서만 변경해야 합니다: ${normalized}`)
  mutationPattern.lastIndex = 0
}

const designDoc = existsSync("docs/design-system.md") ? readFileSync("docs/design-system.md", "utf8") : ""
for (const marker of ["4.5:1", "3:1", "부모 앱", "자녀 앱", "테마색"]) {
  if (!designDoc.includes(marker)) errors.push(`디자인 시스템 문서에 필수 정책이 누락되었습니다: ${marker}`)
}

if (errors.length) {
  console.error("Design system check failed:")
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log("Design system check passed: semantic tokens, theme ownership, accessibility helpers, and shared UI rules are present.")
