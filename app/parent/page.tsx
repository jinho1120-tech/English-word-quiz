import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"
import { getParentFamilyDashboard } from "@/app/actions/family"
import { ParentDashboard } from "@/components/parent-dashboard"

export const dynamic = "force-dynamic"

export default async function ParentPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")
  const dashboard = await getParentFamilyDashboard()

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl space-y-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div><p className="text-sm text-muted-foreground">English Word Quiz</p><h1 className="text-2xl font-black">부모 관리 화면</h1><p className="text-sm text-muted-foreground">{session.user.name}님 가족 공간</p></div>

      </header>
      <ParentDashboard children={dashboard.children} devices={dashboard.devices} members={dashboard.members} invitations={dashboard.invitations} settings={dashboard.settings} coupons={dashboard.coupons} parentRole={dashboard.parentRole} currentUserId={dashboard.currentUserId} ownerUserId={dashboard.ownerUserId} />
    </main>
  )
}
