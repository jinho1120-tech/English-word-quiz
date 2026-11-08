import { redirect } from "next/navigation"
import { getChildDeviceSession, revokeCurrentChildDeviceSession } from "@/lib/child-auth"

export const dynamic = "force-dynamic"

export default async function ChildPage() {
  const session = await getChildDeviceSession()
  if (!session) redirect("/child/login")

  async function logout() {
    "use server"
    await revokeCurrentChildDeviceSession()
    redirect("/child/login")
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-10">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">English Word Quiz · 자녀 모드</p>
        <h1 className="text-3xl font-black">{session.childName}의 학습 공간</h1>
      </header>
      <section className="rounded-2xl border border-border p-5">
        <p className="font-semibold">기기 연결 완료</p>
        <p className="mt-1 text-sm text-muted-foreground">이 기기는 부모가 연결을 해제하거나 여기서 로그아웃하기 전까지 자녀 모드로 연결됩니다.</p>
      </section>
      <form action={logout}><button className="self-start rounded-xl border border-border px-4 py-2 text-sm font-semibold">이 기기 로그아웃</button></form>
    </main>
  )
}
