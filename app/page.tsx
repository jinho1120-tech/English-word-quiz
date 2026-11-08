import { getWords, getWrongWords, getLatestActiveDate, type Profile } from "@/app/actions/words"
import { StudyApp } from "@/components/study-app"
import { DateNav } from "@/components/date-nav"
import { LogoutButton } from "@/components/logout-button"
import { redirect } from "next/navigation"
import { headers } from "next/headers"
import { auth } from "@/lib/auth"

export const dynamic = "force-dynamic"

const profile: Profile = "지온"
const accent = "#8b5cf6"

function todayInSeoul(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>
}) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect("/login")

  const params = await searchParams
  const today = todayInSeoul()
  let date = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : undefined

  if (!date) {
    const todayWords = await getWords(profile, today)
    if (todayWords.length === 0) {
      const latestDate = await getLatestActiveDate(profile)
      date = latestDate || today
    } else {
      date = today
    }
  }

  const words = await getWords(profile, date)
  const wrongWords = await getWrongWords(profile)

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-foreground">영어 단어 학습</h1>
          <p className="text-sm text-muted-foreground">{session.user.name}님의 단어장을 관리하고 퀴즈로 연습해요.</p>
        </div>
        <LogoutButton />
      </header>
      <DateNav profile={profile} date={date} today={today} accent={accent} />
      <StudyApp profile={profile} date={date} words={words} wrongWords={wrongWords} accent={accent} userId={session.user.id} userName={session.user.name} />
    </main>
  )
}
