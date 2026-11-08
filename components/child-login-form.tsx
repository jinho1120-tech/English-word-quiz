"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { loginChildWithAccessCode } from "@/app/actions/family"

export function ChildLoginForm() {
  const router = useRouter()
  const [accessCode, setAccessCode] = useState("")
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError("")
    startTransition(async () => {
      try {
        await loginChildWithAccessCode({ accessCode, pin, deviceLabel: "자녀 기기" })
        router.replace("/child")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "로그인하지 못했습니다.")
      }
    })
  }

  return (
    <section className="w-full max-w-sm space-y-3 rounded-2xl border border-border p-5">
      <h1 className="text-xl font-black">자녀 로그인</h1>
      <p className="text-sm text-muted-foreground">부모에게 받은 접속 코드와 PIN을 입력하세요. 이 기기는 연결 해제 전까지 로그인 상태를 유지합니다.</p>
      <input value={accessCode} onChange={(event) => setAccessCode(event.target.value.toUpperCase())} autoCapitalize="characters" placeholder="접속 코드" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm tracking-widest" />
      <input value={pin} onChange={(event) => setPin(event.target.value)} type="password" inputMode="numeric" maxLength={8} placeholder="PIN 4~8자리" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-sm" />
      <button disabled={isPending || !accessCode.trim() || !pin} onClick={submit} className="w-full rounded-xl bg-foreground px-4 py-3 text-sm font-bold text-background disabled:opacity-50">{isPending ? "연결 중..." : "이 기기 등록"}</button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </section>
  )
}
