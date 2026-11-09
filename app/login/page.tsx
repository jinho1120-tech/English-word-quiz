import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/auth-form"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ invite?: string; invite_error?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  const params = await searchParams
  if (session) redirect(params.invite ? "/parent/invite/accept?token=" + encodeURIComponent(params.invite) : "/")
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-black tracking-tight">우리 가족의 단어장</h1>
        <p className="mt-2 text-sm text-muted-foreground">우리 가족의 단어장을 만들고 퀴즈로 함께 연습해요!</p>
        <p className="mt-2 text-xs text-muted-foreground">부모가 단어장을 관리하고, 자녀는 퀴즈를 풀며 즐겁게 영어 단어를 익혀요.</p>
      </header>
      <AuthForm inviteToken={params.invite} />
      <p className="text-center text-xs text-muted-foreground">{params.invite ? "초대받은 이메일 주소로 로그인하거나 새 계정을 만들어 주세요." : "부모 계정으로 가입한 뒤 자녀 프로필을 만들고 가족만의 학습 공간을 시작할 수 있어요."}</p>{params.invite_error && <p role="alert" className="text-center text-sm text-red-600">초대가 만료되었거나 이메일이 일치하지 않습니다. 초대한 부모에게 새 초대 링크를 요청해 주세요.</p>}
    </main>
  )
}
