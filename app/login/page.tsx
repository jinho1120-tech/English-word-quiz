import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { and, eq, gt, isNull } from "drizzle-orm"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { families, familyInvitations, user } from "@/lib/db/schema"
import { hashOpaqueToken } from "@/lib/child-auth"
import { AuthForm } from "@/components/auth-form"

type InviteStatus = "valid" | "expired" | "revoked" | "accepted" | "invalid"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string; invite_error?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  const params = await searchParams
  const token = params.invite
  if (!token && session) redirect("/")

  let inviteEmail: string | undefined
  let inviteStatus: InviteStatus = "invalid"
  let familyOwnerName: string | undefined

  if (token && token.length >= 30 && token.length <= 200) {
    const [invitation] = await db.select({
      email: familyInvitations.email,
      expiresAt: familyInvitations.expiresAt,
      acceptedAt: familyInvitations.acceptedAt,
      revokedAt: familyInvitations.revokedAt,
      ownerName: user.name,
    }).from(familyInvitations)
      .innerJoin(families, eq(familyInvitations.familyId, families.id))
      .innerJoin(user, eq(families.ownerUserId, user.id))
      .where(eq(familyInvitations.tokenHash, hashOpaqueToken(token)))
      .limit(1)

    if (invitation) {
      inviteEmail = invitation.email
      familyOwnerName = invitation.ownerName
      if (invitation.acceptedAt) inviteStatus = "accepted"
      else if (invitation.revokedAt) inviteStatus = "revoked"
      else if (invitation.expiresAt <= new Date()) inviteStatus = "expired"
      else inviteStatus = "valid"
    }
  }

  const sessionEmail = session?.user?.email?.trim().toLowerCase()
  const emailMatches = !!sessionEmail && !!inviteEmail && sessionEmail === inviteEmail
  if (session && token && inviteStatus === "valid" && emailMatches && !params.invite_error) {
    redirect("/parent/invite/accept?token=" + encodeURIComponent(token))
  }

  const inviteErrorMessage = params.invite_error === "already_has_family"
    ? "이 계정은 이미 다른 가족 공간에 참여하고 있어요. 기존 가족을 자동으로 탈퇴시키거나 데이터를 옮기지는 않습니다."
    : params.invite_error === "email_mismatch"
      ? "현재 로그인한 이메일이 초대받은 주소와 다릅니다. 초대받은 이메일로 계정을 전환해 주세요."
      : params.invite_error === "already_member"
        ? "이미 이 가족의 공동관리자로 참여하고 있습니다."
        : null

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-black tracking-tight">우리 가족 단어장</h1>
        {token ? (
          <>
            <p className="mt-2 text-base font-bold">가족 공동관리자 초대</p>
            <p className="mt-2 text-sm text-muted-foreground">초대를 수락하면 초대한 가족의 학습 공간을 함께 관리할 수 있어요.</p>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">우리 가족 단어장을 만들고 퀴즈로 함께 연습해요!</p>
            <p className="mt-2 text-xs text-muted-foreground">가족 관리자는 단어장을 관리하고, 아이들은 퀴즈를 풀며 즐겁게 영어 단어를 익혀요.</p>
          </>
        )}
      </header>
      {token && inviteStatus !== "valid" ? (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-5 text-center">
          <p role="alert" className="font-semibold text-red-600">
            {inviteStatus === "expired" ? "초대 링크의 유효기간이 지났어요." : inviteStatus === "revoked" ? "취소된 초대 링크입니다." : inviteStatus === "accepted" ? "이미 수락한 초대 링크입니다." : "유효하지 않은 초대 링크입니다."}
          </p>
          <p className="text-sm text-muted-foreground">초대한 가족 관리자에게 새 초대 링크를 요청해 주세요.</p>
        </section>
      ) : token ? (
        <>
          <section className="space-y-2 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <p className="text-xs font-semibold text-muted-foreground">초대된 이메일 주소</p>
            <p className="break-all text-lg font-bold">{inviteEmail}</p>
            <p className="text-xs text-muted-foreground">이 이메일 주소로 가입하거나 로그인해야 초대를 수락할 수 있습니다. 초대 링크는 7일 후 만료됩니다.</p>
          </section>
          {inviteErrorMessage && <p role="alert" className="rounded-xl bg-muted p-3 text-sm">{inviteErrorMessage}</p>}
          <AuthForm inviteToken={token} inviteEmail={inviteEmail} signedInEmail={sessionEmail} inviteError={params.invite_error} />
        </>
      ) : (
        <>
          <AuthForm />
          <p className="text-center text-xs text-muted-foreground">가족 관리자 계정으로 가입한 뒤 아이 프로필을 만들고 우리 가족만의 학습 공간을 시작할 수 있어요.</p>
        </>
      )}
    </main>
  )
}
