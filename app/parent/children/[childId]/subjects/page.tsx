import { notFound, redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getChildSubjects } from "@/app/actions/subjects"
import { getFamilyDisplayTerms } from "@/app/actions/family"
import { SubjectManager } from "@/components/subject-manager"

export const dynamic = "force-dynamic"

export default async function ChildSubjectsPage({
  params,
}: {
  params: Promise<{ childId: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const { childId } = await params
  const terms = await getFamilyDisplayTerms()
  let subjects
  try {
    subjects = await getChildSubjects(childId)
  } catch {
    notFound()
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <a href="/parent" className="text-sm text-muted-foreground">← {terms.guardian} 화면</a>
        <h1 className="text-2xl font-black">{terms.child} 과목 관리</h1>
        <p className="text-sm text-muted-foreground">{terms.child}마다 과목 수와 이름을 다르게 설정할 수 있습니다.</p>
      </header>
      <SubjectManager childProfileId={childId} initialSubjects={subjects.map(({ id, name, sortOrder }) => ({ id, name, sortOrder }))} />
    </main>
  )
}
