import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { requireSuperAdmin } from "@/lib/super-admin"
import { getSuperAdminGameUsageReport } from "@/lib/super-admin-operations"
import { SuperAdminNav } from "@/components/super-admin-nav"
import { LogoutButton } from "@/components/logout-button"

export const dynamic = "force-dynamic"

const number = (value: unknown) => Number(value ?? 0).toLocaleString("ko-KR")
const gameName = (game: string) => game === "pacman" ? "보카맨" : game === "word_defense" ? "영단어 디펜스" : game

export default async function SuperAdminGameUsagePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  try { await requireSuperAdmin() }
  catch (error) {
    if (error instanceof Error && error.message === "운영자 로그인이 필요합니다.") redirect("/login")
    notFound()
  }

  const params = await searchParams
  const allowed = ["all", "7d", "30d", "month"] as const
  const period = allowed.includes(params.period as typeof allowed[number]) ? params.period as typeof allowed[number] : "all"
  const report = await getSuperAdminGameUsageReport(period)
  const total = report.totals.reduce((sum, row) => sum + Number(row.plays), 0)
  const games = ["pacman", "word_defense", ...report.totals.map((row) => row.game).filter((game) => !["pacman", "word_defense"].includes(game))]
  const gameTotals = games.map((game) => ({ game, plays: Number(report.totals.find((row) => row.game === game)?.plays ?? 0) }))
  const familyMap = new Map<string, { family_id: string; owner_name: string; owner_email: string; pacman: number; word_defense: number; other: number }>()
  for (const row of report.families) {
    const current = familyMap.get(row.family_id) ?? { family_id: row.family_id, owner_name: row.owner_name, owner_email: row.owner_email, pacman: 0, word_defense: 0, other: 0 }
    if (row.game === "pacman") current.pacman += Number(row.plays)
    else if (row.game === "word_defense") current.word_defense += Number(row.plays)
    else current.other += Number(row.plays)
    familyMap.set(row.family_id, current)
  }
  const familyRows = [...familyMap.values()].sort((a, b) => (b.pacman + b.word_defense + b.other) - (a.pacman + a.word_defense + a.other))

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-violet-600">ENGLISH WORD QUIZ · INTERNAL</p><h1 className="text-2xl font-black">게임 이용 통계</h1><p className="text-sm text-muted-foreground">게임 시작 기록 기준 · 가족별 및 전체 집계</p></div>
        <LogoutButton />
      </header>
      <SuperAdminNav active="/super-admin/game-usage" />
      <form method="get" action="/super-admin/game-usage" className="flex flex-wrap items-center gap-2">
        {[{value:"all",label:"전체 누적"},{value:"30d",label:"최근 30일"},{value:"7d",label:"최근 7일"},{value:"month",label:"이번 달"}].map((item) => <button key={item.value} name="period" value={item.value} type="submit" aria-pressed={period === item.value} className={`rounded-xl border px-4 py-2 text-sm font-semibold ${period === item.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>{item.label}</button>)}
      </form>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <article className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">전체 게임 실행</p><p className="mt-2 text-3xl font-black tabular-nums">{number(total)}회</p><p className="mt-1 text-xs text-muted-foreground">선택한 기간</p></article>
        {gameTotals.map((row) => <article key={row.game} className="rounded-2xl border bg-card p-4"><p className="text-sm text-muted-foreground">{gameName(row.game)}</p><p className="mt-2 text-3xl font-black tabular-nums">{number(row.plays)}회</p><p className="mt-1 text-xs text-muted-foreground">전체의 {total ? (row.plays / total * 100).toFixed(1) : "0.0"}%</p></article>)}
      </section>
      <section className="rounded-2xl border bg-card p-4 space-y-4">
        <div><h2 className="text-lg font-bold">전체 게임별 이용 비율</h2><p className="text-xs text-muted-foreground">게임 시작 횟수 기준</p></div>
        {gameTotals.map((row) => <div key={row.game} className="space-y-1"><div className="flex justify-between gap-3 text-sm"><span className="font-semibold">{gameName(row.game)}</span><span className="tabular-nums">{number(row.plays)}회 · {total ? (row.plays / total * 100).toFixed(1) : "0.0"}%</span></div><div className="h-3 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${total ? row.plays / total * 100 : 0}%` }} /></div></div>)}
        {total === 0 && <p className="text-sm text-muted-foreground">선택한 기간에 기록된 게임 실행이 없습니다.</p>}
      </section>
      <section className="rounded-2xl border bg-card p-4">
        <div className="mb-3"><h2 className="text-lg font-bold">가족별 이용 순위</h2><p className="text-xs text-muted-foreground">가족별 게임 실행 합계가 많은 순서</p></div>
        {familyRows.length === 0 ? <p className="py-4 text-sm text-muted-foreground">선택한 기간에 기록된 가족별 게임 실행이 없습니다.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b text-left text-muted-foreground"><th className="py-2 pr-3">순위</th><th className="py-2 pr-3">가족 대표</th><th className="py-2 pr-3 text-right">보카맨</th><th className="py-2 pr-3 text-right">영단어 디펜스</th><th className="py-2 text-right">합계</th></tr></thead><tbody>{familyRows.map((row, index) => <tr key={row.family_id} className="border-b last:border-0"><td className="py-3 pr-3 font-bold">{index + 1}</td><td className="py-3 pr-3"><div className="font-semibold">{row.owner_name}</div><div className="text-xs text-muted-foreground">{row.owner_email}</div></td><td className="py-3 pr-3 text-right tabular-nums">{number(row.pacman)}회</td><td className="py-3 pr-3 text-right tabular-nums">{number(row.word_defense)}회</td><td className="py-3 text-right font-bold tabular-nums">{number(row.pacman + row.word_defense + row.other)}회</td></tr>)}</tbody></table></div>}
      </section>
      <p className="text-xs text-muted-foreground">※ 집계는 게임 시작 시 저장된 기록을 사용합니다. 플레이 시간이나 클리어 횟수는 현재 기록하지 않습니다.</p>
    </main>
  )
}
