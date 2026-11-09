import { redirect } from "next/navigation"
import { getChildDeviceSession } from "@/lib/child-auth"
import { getChildLearningData } from "@/app/actions/child-words"
import { ChildLearning } from "@/components/child-learning"
import { PwaInstallGuide } from "@/components/pwa-install-guide"
import { getChildCouponWallet } from "@/app/actions/coupons"
import { ChildCouponWallet } from "@/components/child-coupon-wallet"
import { ChildLogoutButton } from "@/components/child-logout-button"

export const dynamic = "force-dynamic"

function todayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export default async function ChildPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getChildDeviceSession()
  if (!session) redirect("/child/login")

  const params = await searchParams
  const today = todayInSeoul()
  const date = params.date && /^\\d{4}-\\d{2}-\\d{2}$/.test(params.date) ? params.date : today
  const [data, coupons] = await Promise.all([getChildLearningData(date), getChildCouponWallet()])

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg space-y-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div><p className="text-sm text-muted-foreground">영단어 마스터</p><h1 className="text-2xl font-black">{data.childName}의 학습 공간</h1></div>
        <ChildLogoutButton />
      </header>
      <PwaInstallGuide />
      <ChildCouponWallet rewards={coupons} />
      <ChildLearning childName={data.childName} subjects={data.subjects.map(({ id, name }) => ({ id, name }))} wrongWords={data.wrongWords.map(({ id, subjectId, subject, word, meaning, example, wrongCount }) => ({ id, subjectId, subject, word, meaning, example, wrongCount }))} initialWords={data.words.map(({ id, subjectId, subject, word, meaning, example, wrongCount }) => ({ id, subjectId, subject, word, meaning, example, wrongCount }))} initialDate={date} stats={data.stats} />
    </main>
  )
}
