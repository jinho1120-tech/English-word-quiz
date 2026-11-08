import { redirect } from "next/navigation"
import { getChildDeviceSession } from "@/lib/child-auth"
import { getChildLearningData } from "@/app/actions/child-words"
import { ChildLearning } from "@/components/child-learning"

export const dynamic = "force-dynamic"

function todayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export default async function ChildPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await getChildDeviceSession()
  if (!session) redirect("/child/login")

  const params = await searchParams
  const today = todayInSeoul()
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today
  const data = await getChildLearningData(date)

  async function logout() {
    "use server"
    const { revokeCurrentChildDeviceSession } = await import("@/lib/child-auth")
    await revokeCurrentChildDeviceSession()
    redirect("/child/login")
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">English Word Quiz · 자녀 모드</p><h1 className="text-2xl font-black">{data.childName}의 학습 공간</h1></div>
        <form action={logout}><button className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">로그아웃</button></form>
      </header>
      <ChildLearning childName={data.childName} subjects={data.subjects.map(({ id, name }) => ({ id, name }))} wrongWords={data.wrongWords.map(({ id, subjectId, subject, word, meaning, example, wrongCount }) => ({ id, subjectId, subject, word, meaning, example, wrongCount }))} initialWords={data.words.map(({ id, subjectId, subject, word, meaning, example, wrongCount }) => ({ id, subjectId, subject, word, meaning, example, wrongCount }))} initialDate={date} />
    </main>
  )
}
