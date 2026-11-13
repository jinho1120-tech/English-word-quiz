"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { completeChildQrEnrollment } from "@/app/actions/family"
import { PwaInstallGuide } from "@/components/pwa-install-guide"

export function ChildQrEnrollment({ token }: { token: string }) {
  const router = useRouter()
  const started = useRef(false)
  const [error, setError] = useState("")
  const [registered, setRegistered] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    completeChildQrEnrollment({ token, deviceLabel: "QR 등록 기기" })
      .then((result) => {
        if (result.ok) {
          setRegistered(true)
        } else if (result.reason === "rate_limited") {
          setError(`등록 요청이 많아요. ${Math.ceil(result.retryAfterSeconds / 60)}분 뒤에 다시 시도해 주세요.`)
        } else {
          setError("QR 등록 링크가 만료되었거나 이미 사용되었어요. 부모님께 새 QR 코드를 요청해 주세요.")
        }
      })
      .catch(() => setError("기기를 등록하지 못했습니다. 잠시 후 다시 시도해 주세요."))
  }, [router, token])

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4 py-8">
      <section className="w-full space-y-4 rounded-2xl border border-border p-5 text-center">
        {registered ? (
          <>
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
            <h1 className="text-xl font-black">기기 등록이 완료됐어요!</h1>
            <p className="text-sm text-muted-foreground">이제 이 기기에서 자동으로 로그인됩니다. 홈 화면에 아이콘을 추가하면 다음부터 더 편하게 접속할 수 있어요.</p>
            <PwaInstallGuide />
            <button onClick={() => router.replace("/child")} className="w-full rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background">학습 시작하기</button>
          </>
        ) : error ? (
          <>
            <h1 className="text-xl font-black">자녀 기기 등록</h1>
            <p role="alert" className="text-sm text-red-600">{error}</p>
            <a href="/child/login" className="inline-block rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background">접속 코드로 등록</a>
          </>
        ) : (
          <>
            <h1 className="text-xl font-black">자녀 기기 등록</h1>
            <p className="text-sm text-muted-foreground">등록 정보를 확인하고 있습니다...</p>
          </>
        )}
      </section>
    </main>
  )
}
