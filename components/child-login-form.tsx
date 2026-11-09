"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { loginChildWithAccessCode } from "@/app/actions/family"

export function ChildLoginForm() {
  const router = useRouter()
  const [accessCode, setAccessCode] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError("")
    startTransition(async () => {
      try {
        await loginChildWithAccessCode({ accessCode, deviceLabel: "자녀 기기" })
        router.replace("/child")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "기기를 연결하지 못했습니다.")
      }
    })
  }

  return (
    <section className="w-full max-w-sm space-y-3 rounded-2xl border border-border p-5">
      <h1 className="text-xl font-black">자녀 기기 연결</h1>
      <p className="text-sm text-muted-foreground">부모 관리 화면에서 발급한 접속코드를 입력하세요. PIN이나 비밀번호는 필요하지 않습니다. 연결 후에는 자동 로그인됩니다.</p>
      <input value={accessCode} onChange={(event) => setAccessCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="one-time-code" placeholder="접속 코드" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm tracking-widest" />
      <button disabled={isPending || !accessCode.trim()} onClick={submit} className="w-full rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background disabled:opacity-50">{isPending ? "연결 중..." : "이 기기 연결하기"}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
