import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { requireSuperAdmin, getSuperAdminFamilies, getSuperAdminFamilyDetail, getSuperAdminFamilyActivity } from "@/lib/super-admin"
import { updateSuperAdminChildName, updateSuperAdminMemberName, updateSuperAdminOwnerName } from "@/app/actions/super-admin"
import { LogoutButton } from "@/components/logout-button"
import { formatKoreaDate, formatKoreaDateTime } from "@/lib/korea-time"
import { SuperAdminNav } from "@/components/super-admin-nav"
import { SuperAdminFamilyActivity } from "@/components/super-admin-family-activity"

export const dynamic = "force-dynamic"

export default async function SuperAdminPage({ searchParams }: { searchParams: Promise<{ q?: string; family?: string; updated?: string }> }) {
  let operator
  try {
    operator = await requireSuperAdmin()
  } catch (error) {
    if (error instanceof Error && error.message === "운영자 로그인이 필요합니다.") redirect("/login")
    notFound()
  }

  const params = await searchParams
  const families = await getSuperAdminFamilies(params.q ?? "")
  const detail = params.family && /^[0-9a-f-]{36}$/i.test(params.family) ? await getSuperAdminFamilyDetail(params.family) : null
  if (params.family && !detail) notFound()
  const activity = detail ? await getSuperAdminFamilyActivity(detail.family.id) : null

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-violet-600">ENGLISH WORD QUIZ · INTERNAL</p>
          <h1 className="text-2xl font-black">슈퍼 관리자</h1>
          <p className="text-sm text-muted-foreground">{operator.email} · 운영자 전용</p>
        </div>
        <LogoutButton />
      </header>
      <SuperAdminNav active="/super-admin" />

      <section className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold">전체 가족 <span className="text-sm font-medium text-muted-foreground">({families.length}{families.length === 200 ? "+" : ""})</span></h2>
          <span className="text-xs text-muted-foreground">최근 가입순 · 최대 200개</span>
        </div>
        <form className="mb-4 flex gap-2" action="/super-admin" method="get">
          <input name="q" defaultValue={params.q ?? ""} placeholder="대표자 이름, 이메일, 가족 ID 검색" className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm" />
          <button className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">검색</button>
        </form>
        <div className="space-y-2">
          {families.map((family) => (
            <Link key={family.id} href={`/super-admin?family=${family.id}`} className="block rounded-xl border p-3 transition hover:bg-muted">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{family.ownerName || "이름 없음"} <span className="text-xs font-normal text-muted-foreground">대표자</span></p>
                  <p className="truncate text-sm text-muted-foreground">{family.ownerEmail || "이메일 없음"}</p>
                  <p className="mt-1 break-all text-[11px] text-muted-foreground">{family.id}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <p>아이 {family.childCount}명</p>
                  <p>공동관리자 {family.adminCount}명</p>
                  <p>{formatKoreaDateTime(family.createdAt)}</p>
                </div>
              </div>
            </Link>
          ))}
          {families.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>}
        </div>
      </section>

      {detail && (
        <section className="space-y-4 rounded-2xl border bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-semibold text-violet-600">FAMILY DETAIL</p><h2 className="text-lg font-bold">가족 상세 관리</h2></div>
            <Link href="/super-admin" className="text-sm underline">목록으로</Link>
          </div>
          {params.updated === "1" && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">변경 사항을 저장했습니다.</p>}
          <div className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">가족 ID: {detail.family.id}<br />가입일: {formatKoreaDateTime(detail.family.createdAt)}</div>
          <div className="space-y-3">
            <h3 className="font-bold">가족 대표</h3>
            <p className="text-sm text-muted-foreground">{detail.family.ownerEmail}</p>
            <form action={updateSuperAdminOwnerName} className="flex gap-2">
              <input type="hidden" name="familyId" value={detail.family.id} />
              <input name="name" defaultValue={detail.family.ownerName ?? ""} aria-label="대표자 호칭" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" maxLength={80} required />
              <button className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">저장</button>
            </form>
          </div>
          <div className="space-y-3 border-t pt-4">
            <h3 className="font-bold">공동관리자 ({detail.members.length})</h3>
            {detail.members.map((member) => <form key={member.userId} action={updateSuperAdminMemberName} className="space-y-1 rounded-xl border p-3">
              <input type="hidden" name="familyId" value={detail.family.id} />
              <input type="hidden" name="userId" value={member.userId} />
              <p className="text-xs text-muted-foreground">{member.email} · {member.role}</p>
              <div className="flex gap-2"><input name="name" defaultValue={member.name} aria-label="공동관리자 관계 호칭" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" maxLength={80} required /><button className="rounded-lg border px-3 py-2 text-sm">저장</button></div>
            </form>)}
            {detail.members.length === 0 && <p className="text-sm text-muted-foreground">공동관리자가 없습니다.</p>}
          </div>
          <div className="space-y-3 border-t pt-4">
            <h3 className="font-bold">아이 프로필 ({detail.children.length})</h3>
            {detail.children.map((child) => <form key={child.id} action={updateSuperAdminChildName} className="space-y-2 rounded-xl border p-3">
              <input type="hidden" name="familyId" value={detail.family.id} />
              <input type="hidden" name="childId" value={child.id} />
              <p className="text-xs text-muted-foreground">{child.isActive ? "활성" : "비활성"} · {formatKoreaDate(child.createdAt)}</p>
              <div className="flex gap-2"><input name="name" defaultValue={child.displayName} aria-label="아이 이름" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" maxLength={40} required /><button className="rounded-lg border px-3 py-2 text-sm">저장</button></div>
            </form>)}
            {detail.children.length === 0 && <p className="text-sm text-muted-foreground">등록된 아이 프로필이 없습니다.</p>}
          </div>
          <section className="space-y-3 border-t pt-4">
            <div>
              <h3 className="font-bold">가정별 쿠폰 설정 및 쿠폰 내용</h3>
              <p className="mt-1 text-xs text-muted-foreground">자녀별 지급 조건과 자녀에게 등록된 쿠폰을 조회합니다. 기본 쿠폰 내용과 다른 항목만 색상으로 강조합니다. 조회 전용 화면입니다.</p>
            </div>
            <div className="rounded-xl bg-muted p-3 text-sm">
              <p className="font-semibold">가족 공통 기본 설정</p>
              {detail.familyCouponSettings ? <>
                <p className="mt-1">쿠폰 기능 {detail.familyCouponSettings.couponsEnabled ? "사용" : "사용 안 함"} · 최소 정답률 {detail.familyCouponSettings.rewardMinScore}% · 최소 문제 수 {detail.familyCouponSettings.rewardMinQuestions}개</p>
                <p>힌트 미사용 조건 {detail.familyCouponSettings.requireNoHint ? "필수" : "선택"} · 꽝 쿠폰 확률 {detail.familyCouponSettings.blankCouponProbability}%</p>
                <p className="mt-1 text-xs text-muted-foreground">마지막 수정 {formatKoreaDateTime(detail.familyCouponSettings.updatedAt)}</p>
              </> : <p className="mt-1 text-muted-foreground">별도의 가족 공통 설정이 없습니다.</p>}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">자녀별 지급 설정</p>
              {detail.childCouponSettings.map((setting) => <article key={setting.childProfileId} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{setting.childName}</p>
                  <span className={setting.couponsEnabled ? "rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800" : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"}>{setting.couponsEnabled ? "쿠폰 사용 중" : "쿠폰 꺼짐"}</span>
                </div>
                <p className="mt-1">최소 정답률 {setting.rewardMinScore}% · 최소 문제 {setting.rewardMinQuestions}개 · 힌트 미사용 {setting.requireNoHint ? "필수" : "무관"}</p>
                <p>꽝 확률 {setting.blankCouponProbability}% · 최대 보관 {setting.maxStoredCoupons}개</p>
                <p className="mt-1 text-xs text-muted-foreground">마지막 수정 {formatKoreaDateTime(setting.updatedAt)}</p>
              </article>)}
              {detail.childCouponSettings.length === 0 && <p className="text-xs text-muted-foreground">자녀별 쿠폰 설정이 없습니다.</p>}
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">자녀에게 등록된 쿠폰 ({detail.couponTypes.length})</p>
              {detail.couponTypes.map((coupon) => <article key={coupon.id} className={coupon.differsFromDefault ? "rounded-xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-700 dark:bg-amber-950/20" : "rounded-xl border p-3"}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{coupon.title}</p>
                      {coupon.differsFromDefault && <span className="rounded-full bg-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-900 dark:text-amber-100">기본 내용과 다름</span>}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{coupon.description || "설명 없음"}</p>
                  </div>
                  <span className={coupon.isActive ? "shrink-0 rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-800" : "shrink-0 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"}>{coupon.isActive ? "활성" : "비활성"}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{coupon.childName} · {coupon.couponKind === "blank" ? "꽝 쿠폰" : "일반 쿠폰"} · 추첨 가중치 {coupon.drawWeight} · 수정 {formatKoreaDateTime(coupon.updatedAt)}</p>
              </article>)}
              {detail.couponTypes.length === 0 && <p className="text-xs text-muted-foreground">등록된 쿠폰이 없습니다.</p>}
            </div>
          </section>
          {activity && <SuperAdminFamilyActivity activity={activity} />}
          <div className="space-y-2 border-t pt-4">
            <h3 className="font-bold">운영 변경 기록</h3>
            {detail.audit.map((entry) => <div key={entry.id} className="rounded-lg bg-muted p-3 text-xs">
              <p className="font-semibold">{entry.action}</p>
              <p className="text-muted-foreground">{entry.actorEmail} · {formatKoreaDateTime(entry.createdAt)}</p>
              <p>{JSON.stringify(entry.details)}</p>
            </div>)}
            {detail.audit.length === 0 && <p className="text-sm text-muted-foreground">아직 운영자 변경 기록이 없습니다.</p>}
          </div>
        </section>
      )}
      <p className="text-center text-xs text-muted-foreground">운영자 권한은 SUPER_ADMIN_EMAILS 환경변수로만 부여됩니다.</p>
    </main>
  )
}
