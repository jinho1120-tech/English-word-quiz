import { redirect, notFound } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getParentChildWords, getParentChildCalendarData } from "@/app/actions/parent-words"
import { getFamilyDisplayTerms } from "@/app/actions/family"
import { ParentWordManager } from "@/components/parent-word-manager"

export const dynamic = "force-dynamic"

function todayInSeoul() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export default async function ParentChildWordsPage({ params, searchParams }: {
  params: Promise<{ childId: string }>
  searchParams: Promise<{ date?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const { childId } = await params
  const terms = await getFamilyDisplayTerms()
  const query = await searchParams
  const today = todayInSeoul()
  const date = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : today
  let data
  let initialStorage
  try {
    ;[data, initialStorage] = await Promise.all([
      getParentChildWords(childId, date),
      getParentChildCalendarData(childId, date.slice(0, 7)),
    ])
  } catch { notFound() }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl space-y-6 px-4 py-8">
      <header className="space-y-1"><a href="/parent" className="text-sm text-muted-foreground">← {terms.guardian} 화면</a><h1 className="text-2xl font-black">{data.childName}의 단어장</h1><p className="text-sm text-muted-foreground">{terms.guardian}도 {terms.child}의 단어를 추가하고 관리할 수 있습니다.</p></header>
      <ParentWordManager childProfileId={childId} subjects={data.subjects.map(({ id, name, calendarColor }) => ({ id, name, color: calendarColor }))} initialWords={data.words.map(({ id, subjectId, subject, word, meaning, example, wrongCount }) => ({ id, subjectId, subject, word, meaning, example, wrongCount }))} initialDate={date} initialStorage={initialStorage} stats={data.stats} />
    </main>
  )
}
