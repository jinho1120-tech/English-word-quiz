import { notFound } from "next/navigation"
import { getChildSubjects } from "@/app/actions/subjects"
import { ParentChildSubjects } from "@/components/parent-child-subjects"

export const dynamic = "force-dynamic"

export default async function ParentChildSubjectsPage({ searchParams }: { searchParams: Promise<{ childId?: string }> }) {
  const { childId } = await searchParams
  if (!childId) notFound()
  try {
    const subjects = await getChildSubjects(childId)
    return <main className="mx-auto min-h-dvh w-full max-w-2xl space-y-6 px-4 py-8"><header><a href="/parent" className="text-sm text-muted-foreground">← 부모 대시보드</a><h1 className="mt-2 text-2xl font-black">자녀 과목 관리</h1><p className="text-sm text-muted-foreground">자녀마다 독립적인 과목 목록을 관리합니다.</p></header><ParentChildSubjects childProfileId={childId} initialSubjects={subjects.map(({ id, name }) => ({ id, name }))} /></main>
  } catch { notFound() }
}
