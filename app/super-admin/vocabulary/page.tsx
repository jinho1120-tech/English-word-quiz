import { notFound, redirect } from "next/navigation"
import { requireSuperAdmin } from "@/lib/super-admin"
import { getSuperAdminVocabularyCandidateDashboard } from "@/app/actions/ai-vocabulary"
import { SuperAdminNav } from "@/components/super-admin-nav"
import { LogoutButton } from "@/components/logout-button"
import { VocabularyCandidateImporter } from "@/components/vocabulary-candidate-importer"
import { VocabularyCandidateReview } from "@/components/vocabulary-candidate-review"

export const dynamic = "force-dynamic"

const number = (value: number) => value.toLocaleString("ko-KR")

export default async function SuperAdminVocabularyPage() {
  let operator
  try {
    operator = await requireSuperAdmin()
  } catch (error) {
    if (error instanceof Error && error.message === "운영자 로그인이 필요합니다.") redirect("/login")
    notFound()
  }

  const data = await getSuperAdminVocabularyCandidateDashboard()
  const total = Object.values(data.statusCounts).reduce((sum, value) => sum + value, 0)
  const pending = data.statusCounts.dictionary_found ?? 0
  const approved = data.statusCounts.approved ?? 0
  const rejected = data.statusCounts.rejected ?? 0
  const readiness = data.assessmentReadiness
  const wordReady = readiness.words >= readiness.required
  const idiomReady = readiness.idioms >= readiness.required

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-violet-600">ENGLISH WORD QUIZ · INTERNAL</p>
          <h1 className="text-2xl font-black">공용 어휘 문제은행</h1>
          <p className="text-sm text-muted-foreground">{operator.email} · 슈퍼 관리자 전용</p>
        </div>
        <LogoutButton />
      </header>
      <SuperAdminNav active="/super-admin/vocabulary" />

      <section className="space-y-3 rounded-2xl border bg-card p-4">
        <div>
          <h2 className="text-lg font-bold">문제은행 현황</h2>
          <p className="mt-1 text-sm text-muted-foreground">공용 후보는 모든 가족이 함께 사용하는 데이터입니다. 입력과 승인은 슈퍼 관리자만 할 수 있습니다.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <article className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">전체 후보 의미</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{number(total)}</p>
          </article>
          <article className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">검토 대기</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{number(pending)}</p>
          </article>
          <article className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">검토 승인</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{number(approved)}</p>
          </article>
          <article className="rounded-xl bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">제외</p>
            <p className="mt-1 text-2xl font-black tabular-nums">{number(rejected)}</p>
          </article>
        </div>
        <div className="space-y-2">
          <h3 className="text-sm font-bold">통합 레벨 테스트 출제 준비도</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">각 유형은 출제 가능한 후보가 최소 9개 필요합니다. 후보마다 같은 표현 유형 안에서 서로 다른 한국어 뜻이 최소 4개 있어야 선택지 구성이 가능합니다.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <article className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">단어</span>
                <span className="text-sm font-bold tabular-nums">{number(readiness.words)} / {readiness.required}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{wordReady ? "문제 출제 기준 충족" : "후보 등록과 검토가 더 필요합니다."}</p>
            </article>
            <article className="rounded-xl border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">숙어·구동사·연어</span>
                <span className="text-sm font-bold tabular-nums">{number(readiness.idioms)} / {readiness.required}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{idiomReady ? "문제 출제 기준 충족" : "후보 등록과 검토가 더 필요합니다."}</p>
            </article>
          </div>
          <p className="text-xs text-muted-foreground">위 숫자는 승인, 난이도 검토 완료, 한국어 뜻, 자녀 레벨 지정 및 선택지 구성을 모두 만족한 출제 가능 후보 수입니다.</p>
        </div>
      </section>

      <VocabularyCandidateImporter />
      <VocabularyCandidateReview candidates={data.candidates} />
    </main>
  )
}
