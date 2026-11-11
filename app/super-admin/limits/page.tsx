import { notFound, redirect } from "next/navigation"
import { requireSuperAdmin } from "@/lib/super-admin"
import { getSuperAdminUsageLimits } from "@/lib/super-admin-operations"
import { saveServiceUsageLimit } from "@/app/actions/super-admin-operations"
import { SuperAdminNav } from "@/components/super-admin-nav"
import { LogoutButton } from "@/components/logout-button"

export const dynamic = "force-dynamic"

const PROVIDERS = [
  { id: "gemini", label: "Google Gemini" },
  { id: "azure_speech", label: "Azure Speech" },
]

function findLimit(rows: { provider: string; monthly_request_limit: number | string | null }[], provider: string) {
  const row = rows.find((item) => item.provider === provider)
  return row?.monthly_request_limit == null ? "" : String(row.monthly_request_limit)
}

export default async function SuperAdminLimitsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  let operator
  try { operator = await requireSuperAdmin() }
  catch (error) {
    if (error instanceof Error && error.message === "운영자 로그인이 필요합니다.") redirect("/login")
    notFound()
  }
  const params = await searchParams
  const data = await getSuperAdminUsageLimits()

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-violet-600">ENGLISH WORD QUIZ · INTERNAL</p><h1 className="text-2xl font-black">사용 한도 관리</h1><p className="text-sm text-muted-foreground">{operator.email} · 한국 시간 기준 월간 한도</p></div>
        <LogoutButton />
      </header>
      <SuperAdminNav active="/super-admin/limits" />
      {params.saved === "1" && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">사용 한도를 저장했습니다.</p>}
      {!data.ready ? (
        <section className="rounded-2xl border bg-card p-4">
          <h2 className="font-bold">사용 한도 기능 준비 필요</h2>
          <p className="mt-2 text-sm text-muted-foreground">GitHub Actions에서 ‘Apply super admin operations migration’을 실행하면 이 화면에서 전체·가족별 월간 한도를 관리할 수 있습니다. 기존 시간당 한도는 계속 유지됩니다.</p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border bg-card p-4">
            <h2 className="text-lg font-bold">서비스 전체 월간 한도</h2>
            <p className="mt-1 text-sm text-muted-foreground">빈칸은 제한 없음, 0은 모든 요청 차단입니다. 기존 가족별 한도와 함께 적용됩니다.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {PROVIDERS.map((provider) => <form key={provider.id} action={saveServiceUsageLimit} className="rounded-xl border p-3">
                <input type="hidden" name="provider" value={provider.id} />
                <input type="hidden" name="familyId" value="" />
                <label className="grid gap-1 text-sm font-semibold">{provider.label} · 전체 요청/월
                  <input name="monthlyRequestLimit" type="number" min="0" max="100000000" step="1" defaultValue={findLimit(data.globalLimits, provider.id)} placeholder="제한 없음" className="rounded-lg border bg-background px-3 py-2 font-normal" />
                </label>
                <button className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">전체 한도 저장</button>
              </form>)}
            </div>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="text-lg font-bold">가족별 월간 한도 추가</h2>
            <p className="mt-1 text-sm text-muted-foreground">가족 한도는 전체 한도보다 낮게 설정할 수 있습니다. 두 한도 중 먼저 도달한 쪽에서 요청이 차단됩니다.</p>
            <form action={saveServiceUsageLimit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid gap-1 text-sm font-semibold">가족<select name="familyId" required className="min-w-0 rounded-lg border bg-background px-3 py-2 font-normal"><option value="">가족 선택</option>{data.families.map((family) => <option key={family.id} value={family.id}>{family.owner_name} · {family.owner_email}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">서비스<select name="provider" className="rounded-lg border bg-background px-3 py-2 font-normal">{PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">월간 요청 횟수<input name="monthlyRequestLimit" type="number" min="0" max="100000000" step="1" required className="rounded-lg border bg-background px-3 py-2 font-normal" placeholder="예: 500" /></label>
              <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground lg:self-end">가족 한도 저장</button>
            </form>
          </section>

          <section className="rounded-2xl border bg-card p-4">
            <h2 className="text-lg font-bold">현재 가족별 한도</h2>
            <div className="mt-3 space-y-3">
              {data.familyLimits.map((row, index) => <form key={`${row.family_id}:${row.provider}:${index}`} action={saveServiceUsageLimit} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_160px_auto] sm:items-end">
                <input type="hidden" name="familyId" value={row.family_id} />
                <input type="hidden" name="provider" value={row.provider} />
                <div><p className="font-semibold">{row.owner_name}</p><p className="text-xs text-muted-foreground">{row.owner_email} · {PROVIDERS.find((p) => p.id === row.provider)?.label ?? row.provider}</p></div>
                <label className="grid gap-1 text-xs font-semibold">월간 요청 횟수<input name="monthlyRequestLimit" type="number" min="0" max="100000000" step="1" defaultValue={String(row.monthly_request_limit)} className="rounded-lg border bg-background px-3 py-2 text-sm font-normal" /></label>
                <p className="text-xs text-muted-foreground">수정 {new Date(row.updated_at).toLocaleDateString("ko-KR")}</p>
                <button className="rounded-lg border px-3 py-2 text-sm font-semibold">수정</button>
              </form>)}
              {data.familyLimits.length === 0 && <p className="py-5 text-sm text-muted-foreground">별도로 설정된 가족별 한도가 없습니다.</p>}
            </div>
          </section>
        </>
      )}
    </main>
  )
}
