"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"

export function AuthForm({ inviteToken }: { inviteToken?: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<"signin" | "signup">("signup")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const result = mode === "signup"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: inviteToken ? "/parent/invite/accept?token=" + encodeURIComponent(inviteToken) : "/" })
        : await authClient.signIn.email({ email: email.trim(), password, callbackURL: "/" })
      if (result.error) {
        setError(result.error.message || "로그인에 실패했습니다.")
        return
      }
      router.replace("/")
      router.refresh()
    } catch {
      setError("요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="w-full rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1 text-sm">
        <button type="button" onClick={() => setMode("signup")} className={`rounded-lg py-2 font-semibold ${mode === "signup" ? "bg-background shadow" : "text-muted-foreground"}`}>회원가입</button>
        <button type="button" onClick={() => setMode("signin")} className={`rounded-lg py-2 font-semibold ${mode === "signin" ? "bg-background shadow" : "text-muted-foreground"}`}>로그인</button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" && <label className="block space-y-1 text-sm"><span className="font-medium">이름</span><input required value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="w-full rounded-xl border bg-background px-3 py-3" placeholder="표시할 이름" /></label>}
        <label className="block space-y-1 text-sm"><span className="font-medium">이메일</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="w-full rounded-xl border bg-background px-3 py-3" placeholder="name@example.com" /></label>
        <label className="block space-y-1 text-sm"><span className="font-medium">비밀번호</span><input required type="password" minLength={10} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="w-full rounded-xl border bg-background px-3 py-3" placeholder="10자 이상" /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "처리 중..." : mode === "signup" ? "무료로 가입하기" : "로그인"}</button>
      </form>
    </div>
  )
}
