import { notFound, redirect } from "next/navigation"
import { requireSuperAdmin } from "@/lib/super-admin"
import { getSuperAdminAuditReport } from "@/lib/super-admin-operations"
import { SuperAdminNav } from "@/components/super-admin-nav"
import { LogoutButton } from "@/components/logout-button"

export const dynamic = "force-dynamic"

export default async function SuperAdminAuditPage() {
  let operator
  try { operator = await requireSuperAdmin() }
  catch (error) {
    if (error instanceof Error && error.message === "운영자 로그인이 필요합니다.") redirect("/login")
    notFound()
  }
  const report = await getSuperAdminAuditReport()

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-violet-600">ENGLISH WORD QUIZ · INTERNAL</p><h1 className="text-2xl font-black">관리자 활동 기록</h1><p className="text-sm text-muted-foreground">{operator.email} · 최근 200건</p></div>
        <LogoutButton />
      </header>
      <SuperAdminNav active="/super-admin/audit" />
      {!report.ready && <p className="rounded-xl border bg-muted p-3 text-sm text-muted-foreground">시스템 운영 기록 테이블을 아직 생성하지 않았습니다. 현재 가족별 수정 기록만 표시합니다. 추가 기록을 보려면 운영 통계 마이그레이션을 실행해야 합니다.</p>}
      <section className="space-y-3">
        {report.entries.map((entry) => <article key={entry.id} className="rounded-2xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="font-bold">{entry.action}</p><p className="mt-1 text-xs text-muted-foreground">{entry.actor_email} · {entry.scope === "system" ? "시스템 설정" : "가족 데이터"}{entry.target ? ` · ${entry.target}` : ""}</p></div>
            <time className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString("ko-KR")}</time>
          </div>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-muted p-3 text-xs">{JSON.stringify(entry.details, null, 2)}</pre>
        </article>)}
        {report.entries.length === 0 && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">등록된 관리자 활동 기록이 없습니다.</div>}
      </section>
    </main>
  )
}
