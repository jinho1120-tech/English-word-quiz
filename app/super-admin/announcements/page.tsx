import { notFound, redirect } from "next/navigation"
import { requireSuperAdmin, getSuperAdminAnnouncementAudience } from "@/lib/super-admin"
import { sendSuperAdminAnnouncement } from "@/app/actions/super-admin-announcements"
import { SuperAdminNav } from "@/components/super-admin-nav"
import { LogoutButton } from "@/components/logout-button"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export default async function SuperAdminAnnouncementsPage({ searchParams }: {
  searchParams: Promise<{ sent?: string; count?: string }>
}) {
  let operator
  try { operator = await requireSuperAdmin() }
  catch (error) {
    if (error instanceof Error && error.message === "운영자 로그인이 필요합니다.") redirect("/login")
    notFound()
  }
  const params = await searchParams
  const audience = await getSuperAdminAnnouncementAudience()
  const emailReady = Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD)

  return (
    <main className="mx-auto min-h-dvh w-full max-w-5xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-violet-600">ENGLISH WORD QUIZ · INTERNAL</p><h1 className="text-2xl font-black">공지·단체메일</h1><p className="text-sm text-muted-foreground">{operator.email} · 가족 대표 및 공동관리자 대상</p></div>
        <LogoutButton />
      </header>
      <SuperAdminNav active="/super-admin/announcements" />
      {params.sent === "1" && <p role="status" className="rounded-xl bg-muted p-3 text-sm text-foreground">공지 메일 발송 요청이 완료됐습니다. 대상 {Number(params.count ?? 0).toLocaleString("ko-KR")}명에게 전달을 요청했습니다.</p>}
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="text-lg font-bold">발송 대상</h2>
        <p className="mt-2 text-3xl font-black tabular-nums">{audience.recipients.toLocaleString("ko-KR")}명</p>
        <p className="mt-1 text-sm text-muted-foreground">등록된 모든 가족의 대표자와 공동관리자 이메일을 중복 제거해 계산합니다. 수신자는 서로의 이메일 주소를 볼 수 없도록 숨은참조(BCC)로 발송합니다.</p>
      </section>
      <section className="rounded-2xl border bg-card p-4">
        <h2 className="text-lg font-bold">새 공지 메일 작성</h2>
        {!emailReady && <p className="mt-3 rounded-xl border bg-muted p-3 text-sm text-muted-foreground">메일 발송 환경변수 GMAIL_USER 또는 GMAIL_APP_PASSWORD가 설정되지 않았습니다.</p>}
        {audience.recipients > 450 && <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">현재 대상이 450명을 초과합니다. 대상 분할 발송 기능을 추가하기 전까지 전체 발송은 비활성화됩니다.</p>}
        <form action={sendSuperAdminAnnouncement} className="mt-4 space-y-4">
          <label className="grid gap-1 text-sm font-semibold">메일 제목
            <input name="subject" maxLength={120} required placeholder="예: 서비스 업데이트 및 이용 안내" className="rounded-xl border bg-background px-3 py-3 font-normal" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">공지 내용
            <textarea name="message" maxLength={5000} required rows={10} placeholder="가족 회원에게 전달할 공지 내용을 입력하세요." className="resize-y rounded-xl border bg-background px-3 py-3 font-normal" />
          </label>
          <label className="flex items-start gap-2 rounded-xl bg-muted p-3 text-sm">
            <input type="checkbox" name="confirmSend" value="yes" required className="mt-1 size-4" />
            <span>위 내용이 모든 가족 대표자와 공동관리자에게 이메일로 발송되는 것을 확인했습니다.</span>
          </label>
          <button disabled={!emailReady || audience.recipients === 0 || audience.recipients > 450} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">전체 대상에게 공지 메일 발송</button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">현재 한 번에 최대 450명까지 발송합니다. Gmail SMTP 일일 발송 한도 및 스팸 정책의 영향을 받습니다. 발송 버튼을 누르면 실제 이메일이 전송됩니다.</p>
      </section>
    </main>
  )
}
