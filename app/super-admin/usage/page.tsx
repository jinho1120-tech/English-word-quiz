import { notFound, redirect } from "next/navigation"
import { requireSuperAdmin } from "@/lib/super-admin"
import { getSuperAdminUsageReport } from "@/lib/super-admin-operations"
import { saveProviderMonthlyCost } from "@/app/actions/super-admin-operations"
import { SuperAdminNav } from "@/components/super-admin-nav"
import { LogoutButton } from "@/components/logout-button"

export const dynamic = "force-dynamic"

const PROVIDERS = [
  { id: "gemini", label: "Google Gemini" },
  { id: "azure_speech", label: "Azure Speech" },
  { id: "vercel", label: "Vercel" },
  { id: "neon", label: "Neon" },
]
const number = (value: unknown) => Number(value ?? 0).toLocaleString("ko-KR")
const money = (amount: string, currency: string) => new Intl.NumberFormat("ko-KR", { style: "currency", currency }).format(Number(amount))

export default async function SuperAdminUsagePage({ searchParams }: { searchParams: Promise<{ month?: string; saved?: string }> }) {
  let operator
  try { operator = await requireSuperAdmin() }
  catch (error) {
    if (error instanceof Error && error.message === "운영자 로그인이 필요합니다.") redirect("/login")
    notFound()
  }

  const params = await searchParams
  const currentMonth = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date())
  const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : currentMonth
  const report = await getSuperAdminUsageReport(month)
  const providerLabel = (id: string) => PROVIDERS.find((item) => item.id === id)?.label ?? id

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-violet-600">ENGLISH WORD QUIZ · INTERNAL</p><h1 className="text-2xl font-black">서비스 사용량 · 비용</h1><p className="text-sm text-muted-foreground">{operator.email} · 서비스별 운영 지표</p></div>
        <LogoutButton />
      </header>
      <SuperAdminNav active="/super-admin/usage" />
      <section className="rounded-2xl border bg-card p-4">
        <form method="get" action="/super-admin/usage" className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm font-semibold">조회 월<input type="month" name="month" defaultValue={month} className="rounded-lg border bg-background px-3 py-2 font-normal" /></label>
          <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">조회</button>
        </form>
      </section>
      {!report.ready ? (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="font-bold">사용량 기록 준비 필요</h2>
          <p className="mt-2 text-sm text-muted-foreground">GitHub 저장소의 Actions에서 ‘Apply super admin operations migration’을 실행하면 요청 기록·월간 한도·운영 비용 저장 테이블이 생성됩니다. 마이그레이션 전까지 기존 시간당 제한은 계속 적용됩니다.</p>
        </section>
      ) : (
        <>
          {params.saved === "1" && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">월별 청구액을 저장했습니다.</p>}
          <section className="grid gap-3 sm:grid-cols-2">
            {PROVIDERS.map((provider) => {
              const usage = report.providers.find((row) => row.provider === provider.id)
              const cost = report.costs.find((row) => row.provider === provider.id)
              return <article key={provider.id} className="rounded-2xl border bg-card p-4">
                <p className="text-sm font-semibold text-muted-foreground">{provider.label}</p>
                <p className="mt-2 text-2xl font-black tabular-nums">{number(usage?.requests)}회</p>
                <p className="text-xs text-muted-foreground">{provider.id === "gemini" ? "Gemini API 요청" : provider.id === "azure_speech" ? "Azure 음성 토큰 발급 요청 · 실제 합성 횟수/문자 수와는 다름" : "앱 내부에서 직접 수집하지 않는 호스팅/DB 청구 항목"}</p>
                <div className="mt-3 border-t pt-3"><p className="text-xs text-muted-foreground">등록된 실제 월 청구액</p><p className="mt-1 text-lg font-bold">{cost ? money(cost.amount, cost.currency) : "미등록"}</p>{cost?.note && <p className="mt-1 text-xs text-muted-foreground">{cost.note}</p>}</div>
              </article>
            })}
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="text-lg font-bold">월별 실제 청구액 등록</h2>
            <p className="mt-1 text-sm text-muted-foreground">Vercel·Neon은 계정 청구 데이터를 직접 가져오지 않습니다. 각 서비스 콘솔에서 확인한 금액을 입력하세요. 저장하면 같은 서비스·월의 기존 값을 갱신합니다.</p>
            <form action={saveProviderMonthlyCost} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <input type="hidden" name="month" value={month} />
              <label className="grid gap-1 text-sm font-semibold">서비스<select name="provider" className="rounded-lg border bg-background px-3 py-2 font-normal">{PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">금액<input name="amount" type="number" min="0" step="0.01" required className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="0" /></label>
              <label className="grid gap-1 text-sm font-semibold">통화<select name="currency" defaultValue="KRW" className="rounded-lg border bg-background px-3 py-2 font-normal"><option value="KRW">KRW (원)</option><option value="USD">USD ($)</option></select></label>
              <label className="grid gap-1 text-sm font-semibold sm:col-span-2">메모<input name="note" maxLength={500} className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="청구서 기준, 요금제, 특이사항 등" /></label>
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground lg:self-end">청구액 저장</button>
            </form>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="font-bold">가족별 API 요청</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead><tr className="border-b text-xs text-muted-foreground"><th className="pb-2 pr-3">가족 대표</th><th className="pb-2 pr-3">이메일</th><th className="pb-2 pr-3">서비스</th><th className="pb-2 text-right">요청</th></tr></thead>
                <tbody>{report.families.map((row, index) => <tr key={`${row.family_id ?? "unknown"}:${row.provider}:${index}`} className="border-b last:border-0"><td className="py-2 pr-3">{row.owner_name}</td><td className="py-2 pr-3 text-muted-foreground">{row.owner_email || "연결된 가족 없음"}</td><td className="py-2 pr-3">{providerLabel(row.provider)}</td><td className="py-2 text-right tabular-nums">{number(row.requests)}</td></tr>)}</tbody>
              </table>
            </div>
            {report.families.length === 0 && <p className="py-4 text-sm text-muted-foreground">해당 월 API 요청 기록이 없습니다.</p>}
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="font-bold">기능별 요청 상세</h2>
            <div className="mt-3 space-y-2">{report.actions.map((row) => <div key={`${row.provider}:${row.action}`} className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3 text-sm"><div><p className="font-semibold">{providerLabel(row.provider)}</p><p className="text-xs text-muted-foreground">{row.action}</p></div><p className="font-bold tabular-nums">{number(row.requests)}회</p></div>)}</div>
            {report.actions.length === 0 && <p className="py-4 text-sm text-muted-foreground">기능별 요청 기록이 없습니다.</p>}
          </section>
        </>
      )}
    </main>
  )
}
