import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { AuthForm } from "@/components/auth-form"

export default async function LoginPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (session) redirect("/")
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="text-2xl font-black tracking-tight">영어 단어 학습</h1>
        <p className="mt-2 text-sm text-muted-foreground">나만의 단어장을 만들고 퀴즈로 연습해요.</p>
      </header>
      <AuthForm />
      <p className="text-center text-xs text-muted-foreground">가입한 계정의 학습 데이터는 본인에게만 표시됩니다.</p>
    </main>
  )
}
