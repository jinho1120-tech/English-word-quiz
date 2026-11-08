import { notFound } from "next/navigation"
import { getParentChildWords } from "@/app/actions/parent-words"
import { ParentChildWords } from "@/components/parent-child-words"

export const dynamic = "force-dynamic"

export default async function ParentChildWordsPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams
  if (!childId) notFound()
  try {
    const data = await getParentChildWords(childId)
    return <main className="mx-auto min-h-dvh w-full max-w-3xl space-y-6 px-4 py-8">
      <header><a href="/parent" className="text-sm text-muted-foreground">← 부모 대시보드</a><h1 className="mt-2 text-2xl font-black">{data.childName}의 단어장</h1><p className="text-sm text-muted-foreground">부모와 자녀가 같은 단어 데이터를 함께 관리합니다.</p></header>
      <ParentChildWords childProfileId={childId} subjects={data.subjects} words={data.words.map(({ id, assignmentDate, subject, word, meaning, example }) => ({ id, assignmentDate, subject, word, meaning, example }))} />
    </main>
  } catch { notFound() }
}
