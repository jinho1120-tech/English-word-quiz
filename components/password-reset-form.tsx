"use client"

import { useState } from "react"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"

export function PasswordResetForm({ token, invalid }: { token?: string; invalid?: boolean }) {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage("")
    setError("")
    if (!token) {
      setError("재설정 링크가 없거나 만료되었습니다. 비밀번호 찾기에서 새 링크를 요청해 주세요.")
      return
    }
    if (password !== confirmPassword) {
      setError("두 비밀번호가 일치하지 않습니다.")
      return
    }
    setBusy(true)
    try {
      const result = await authClient.resetPassword({ newPassword: password, token })
      if (result.error) {
        setError(result.error.message || "비밀번호를 변경하지 못했습니다. 재설정 링크가 만료되었을 수 있습니다.")
        return
      }
      setMessage("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.")
    } catch {
      setError("요청을 처리하지 못했습니다. 재설정 링크가 만료되었을 수 있습니다.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
      <h1 className="text-xl font-bold">새 비밀번호 설정</h1>
      <p className="mt-2 text-sm text-muted-foreground">새 비밀번호를 8자 이상 입력해 주세요.</p>
      {invalid && <p role="alert" className="mt-4 text-sm text-destructive">재설정 링크가 만료되었거나 이미 사용되었습니다.</p>}
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block space-y-1 text-sm">
          <span className="font-medium">새 비밀번호</span>
          <input required minLength={8} maxLength={128} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" className="w-full rounded-xl border bg-background px-3 py-3" placeholder="8자 이상" />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">새 비밀번호 확인</span>
          <input required minLength={8} maxLength={128} type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" className="w-full rounded-xl border bg-background px-3 py-3" placeholder="새 비밀번호 다시 입력" />
        </label>
        {message && <p role="status" className="text-sm text-green-700">{message}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {message ? <Link href="/login" className="block w-full rounded-xl bg-primary px-4 py-3 text-center font-semibold text-primary-foreground">로그인하기</Link> : <button disabled={busy || !token} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "변경 중..." : "비밀번호 변경"}</button>}
      </form>
      {!token && <p className="mt-5 text-center text-sm"><Link href="/forgot-password" className="font-medium text-primary underline underline-offset-4">재설정 이메일 다시 받기</Link></p>}
    </div>
  )
}
