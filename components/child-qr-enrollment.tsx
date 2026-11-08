"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { completeChildQrEnrollment } from "@/app/actions/family"

export function ChildQrEnrollment({ token }: { token: string }) {
  const router = useRouter()
  const started = useRef(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (started.current) return
    started.current = true
    completeChildQrEnrollment({ token, deviceLabel: "QR 등록 기기" })
      .then(() => {
        router.replace("/child")
        router.refresh()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "기기를 등록하지 못했습니다.")
      })
  }, [router, token])

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm items-center px-4">
      <section className="w-full space-y-3 rounded-2xl border border-border p-5 text-center">
        <h1 className="text-xl font-black">자녀 기기 등록</h1>
        {error ? <><p role="alert" className="text-sm text-red-600">{error}</p><a href="/child/login" className="inline-block rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background">접속 코드로 등록</a></> : <p className="text-sm text-muted-foreground">등록 정보를 확인하고 있습니다...</p>}
      </section>
    </main>
  )
}
