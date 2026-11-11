import { redirect } from "next/navigation"
import { getChildDeviceSession } from "@/lib/child-auth"
import { getChildCalendarData, getChildLearningData, getChildPacmanStatus } from "@/app/actions/child-words"
import { ChildLearning } from "@/components/child-learning"
import { PwaInstallGuide } from "@/components/pwa-install-guide"
import { getChildCouponWallet } from "@/app/actions/coupons"
import { ChildCouponWallet } from "@/components/child-coupon-wallet"
import { ChildProfileSettings } from "@/components/child-profile-settings"

export const dynamic = "force-dynamic"

export const metadata = { manifest: "/child/manifest.webmanifest", title: "영단어 마스터", applicationName: "영단어 마스터", appleWebApp: { capable: true, statusBarStyle: "default" as const, title: "영단어 마스터" }, icons: { apple: [{ url: "/icons/child-icon-180.png", sizes: "180x180", type: "image/png" }] } }


function todayInSeoul(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

export default async function ChildPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getChildDeviceSession()
  if (!session) redirect("/child/login")

  const params = await searchParams
  const today = todayInSeoul()
  const date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today
  const [data, couponWallet, calendarData, pacmanStatus] = await Promise.all([getChildLearningData(date), getChildCouponWallet(), getChildCalendarData(date.slice(0, 7)), getChildPacmanStatus()])

  return (
    <main className="mx-auto min-h-dvh w-full max-w-7xl space-y-3 px-3 py-3 sm:space-y-4 sm:px-5 sm:py-4 lg:space-y-5 lg:px-8 lg:py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">영단어 마스터</p><h1 className="truncate text-xl font-black">{data.childName}의 학습 공간</h1></div>
        <div className="flex shrink-0 items-center gap-2">
          <ChildCouponWallet rewards={couponWallet.rewards} maxStoredCoupons={couponWallet.maxStoredCoupons} />
          <ChildProfileSettings profileKey={session.childProfileId} />
        </div>
      </header>
      <PwaInstallGuide />
      <ChildLearning pacmanStatus={pacmanStatus} childName={data.childName} allWords={data.allWords.map(({ id, subjectId, subject, word, meaning, example, wrongCount }) => ({ id, subjectId, subject, word, meaning, example, wrongCount }))} subjects={data.subjects.map(({ id, name, calendarColor }) => ({ id, name, color: calendarColor }))} initialStorage={calendarData} wrongWords={data.wrongWords.map(({ id, subjectId, subject, word, meaning, example, wrongCount }) => ({ id, subjectId, subject, word, meaning, example, wrongCount }))} initialWords={data.words.map(({ id, subjectId, subject, word, meaning, example, wrongCount }) => ({ id, subjectId, subject, word, meaning, example, wrongCount }))} initialDate={date} />
    </main>
  )
}
