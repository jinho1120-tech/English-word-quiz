"use client"

import { useState } from "react"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"

export function PasswordResetRequestForm() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setMessage("")
    setError("")
    try {
      const result = await authClient.requestPasswordReset({
        email: email.trim(),
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (result.error) {
        setError(result.error.message || "재설정 이메일을 요청하지 못했습니다.")
        return
      }
      setMessage("계정이 존재한다면 비밀번호 재설정 이메일을 보냈습니다. 받은편지함과 스팸함을 확인해 주세요.")
    } catch {
      setError("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-bold">비밀번호 찾기</h1>
      <p className="mt-2 text-sm text-muted-foreground">가입할 때 사용한 이메일 주소를 입력하면 재설정 링크를 보내드립니다.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">이메일</span>
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="w-full rounded-xl border bg-background px-3 py-3" placeholder="name@example.com" />
        </label>
        {message && <p role="status" className="text-sm text-green-700">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "전송 요청 중..." : "재설정 이메일 받기"}</button>
      </form>
      <p className="mt-5 text-center text-sm"><Link href="/login" className="font-medium text-primary underline underline-offset-4">로그인으로 돌아가기</Link></p>
    </div>
  )
}
