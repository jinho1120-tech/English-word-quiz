import { redirect } from "next/navigation"
import { getChildDeviceSession } from "@/lib/child-auth"
import { getChildLearningData } from "@/app/actions/child-words"
import { ChildLearning } from "@/components/child-learning"
import { PwaInstallGuide } from "@/components/pwa-install-guide"
import { getChildCouponWallet } from "@/app/actions/coupons"
import { ChildCouponWallet } from "@/components/child-coupon-wallet"
import { ChildProfileSettings } from "@/components/child-profile-settings"

export const dynamic = "force-dynamic"

function todayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export default async function ChildPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getChildDeviceSession()
  if (!session) redirect("/child/login")

  const params = await searchParams
  const today = todayInSeoul()
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today
  const month = date.slice(0, 7)
  const [data, coupons, calendarData] = await Promise.all([getChildLearningData(date), getChildCouponWallet(), (await import("@/app/actions/child-words")).getChildCalendarData(month)])

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg space-y-5 px-4 py-5">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">영단어 마스터</p><h1 className="truncate text-xl font-black">{data.childName}의 학습 공간</h1></div>
        <div className="flex shrink-0 items-center gap-2">
          <ChildProfileSettings profileKey={session.childProfileId} />
          <ChildCouponWallet rewards={coupons} />
        </div>
      </header>
      <PwaInstallGuide />
      <ChildLearning childName={data.childName} subjects={data.subjects.map(({ id, name, calendarColor }) => ({ id, name, color: calendarColor }))} initialStorage={calendarData} wrongWords={data.wrongWords.map(({ id, subjectId, subject, word, meaning, example, wrongCount }) => ({ id, subjectId, subject, word, meaning, example, wrongCount }))} initialWords={data.words.map(({ id, subjectId, subject, word, meaning, example, wrongCount }) => ({ id, subjectId, subject, word, meaning, example, wrongCount }))} initialDate={date} />
    </main>
  )
}
