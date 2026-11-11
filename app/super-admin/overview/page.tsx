import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { requireSuperAdmin } from "@/lib/super-admin"
import { getSuperAdminOperationsOverview } from "@/lib/super-admin-operations"
import { SuperAdminNav } from "@/components/super-admin-nav"
import { LogoutButton } from "@/components/logout-button"

export const dynamic = "force-dynamic"

const number = (value: unknown) => Number(value ?? 0).toLocaleString("ko-KR")

export default async function SuperAdminOverviewPage() {
  let operator
  try { operator = await requireSuperAdmin() }
  catch (error) {
    if (error instanceof Error && error.message === "운영자 로그인이 필요합니다.") redirect("/login")
    notFound()
  }

  const data = await getSuperAdminOperationsOverview()
  const cards = [
    { label: "등록 가족", value: number(data.metrics.families), note: "전체 가족 계정" },
    { label: "활성 자녀", value: number(data.metrics.active_children), note: "현재 활성 프로필" },
    { label: "등록 단어", value: number(data.metrics.words), note: "전체 학습 단어" },
    { label: "최근 30일 퀴즈", value: number(data.metrics.quiz_attempts_30d), note: "채점 기록 기준" },
    { label: "최근 30일 게임", value: number(data.metrics.game_plays_30d), note: "게임 시작 기록 기준" },
  ]

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-violet-600">ENGLISH WORD QUIZ · INTERNAL</p><h1 className="text-2xl font-black">운영 현황</h1><p className="text-sm text-muted-foreground">{operator.email} · {data.month} 기준</p></div>
        <LogoutButton />
      </header>
      <SuperAdminNav active="/super-admin/overview" />
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => <article key={card.label} className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{card.label}</p>
          <p className="mt-2 text-3xl font-black tabular-nums">{card.value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{card.note}</p>
        </article>)}
      </section>
      <section className="rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold">이번 달 외부 API 요청</h2><p className="text-xs text-muted-foreground">기존 시간당 제한을 통과한 요청을 가족별로 집계합니다.</p></div><Link href="/super-admin/usage" className="text-sm font-semibold underline">상세 보기</Link></div>
        {!data.usageReady ? <p className="mt-4 rounded-xl bg-muted p-3 text-sm text-muted-foreground">운영 통계 테이블을 아직 준비하지 않았습니다. GitHub Actions에서 ‘Apply super admin operations migration’을 한 번 실행해야 합니다.</p> : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {data.usage.map((item) => <div key={item.provider} className="rounded-xl bg-muted p-3"><p className="text-sm text-muted-foreground">{item.provider === "gemini" ? "Gemini" : item.provider === "azure_speech" ? "Azure 음성 토큰" : item.provider}</p><p className="mt-1 text-2xl font-bold tabular-nums">{number(item.requests)}회</p></div>)}
            {data.usage.length === 0 && <p className="text-sm text-muted-foreground">이번 달 기록된 API 요청이 없습니다.</p>}
          </div>
        )}
      </section>
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="font-bold">운영 관리 바로가기</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Link href="/super-admin/usage" className="rounded-xl border p-3 text-sm font-semibold hover:bg-muted">서비스 사용량 및 실제 청구액 등록</Link>
          <Link href="/super-admin/limits" className="rounded-xl border p-3 text-sm font-semibold hover:bg-muted">전체·가족별 월간 사용 한도 설정</Link>
          <Link href="/super-admin/audit" className="rounded-xl border p-3 text-sm font-semibold hover:bg-muted">슈퍼관리자 전체 활동 기록</Link>
        </div>
      </section>
    </main>
  )
}
