"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"

type ParentRole = "아빠" | "엄마" | "기타 보호자"

export function AuthForm({ inviteToken }: { inviteToken?: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<"signin" | "signup">("signup")
  const [parentRole, setParentRole] = useState<ParentRole>("아빠")
  const [guardianRelation, setGuardianRelation] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const callbackURL = inviteToken ? "/parent/invite/accept?token=" + encodeURIComponent(inviteToken) : "/"
      const relation = guardianRelation.trim()
      if (mode === "signup" && parentRole === "기타 보호자" && !relation) {
        setError("자녀와의 관계를 입력해 주세요.")
        return
      }
      const displayName = parentRole === "기타 보호자" ? relation : parentRole
      const result = mode === "signup"
        ? await authClient.signUp.email({ name: displayName, email: email.trim(), password, callbackURL })
        : await authClient.signIn.email({ email: email.trim(), password, callbackURL })
      if (result.error) {
        setError(result.error.message || "로그인에 실패했습니다.")
        return
      }
      router.replace(callbackURL)
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
        {mode === "signup" && (
          <div className="space-y-2">
            <label htmlFor="parent-role" className="block text-sm font-medium">보호자 구분</label>
            <select id="parent-role" required value={parentRole} onChange={event => setParentRole(event.target.value as ParentRole)} className="w-full rounded-xl border bg-background px-3 py-3 text-sm">
              <option value="아빠">아빠</option>
              <option value="엄마">엄마</option>
              <option value="기타 보호자">기타 보호자</option>
            </select>
            {parentRole === "기타 보호자" && (
              <label className="block space-y-1 text-sm">
                <span className="font-medium">자녀와의 관계</span>
                <input required value={guardianRelation} onChange={event => setGuardianRelation(event.target.value)} maxLength={30} autoComplete="off" className="w-full rounded-xl border bg-background px-3 py-3" placeholder="예: 할머니, 할아버지, 삼촌, 이모" />
              </label>
            )}
          </div>
        )}
        <label className="block space-y-1 text-sm"><span className="font-medium">이메일</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="w-full rounded-xl border bg-background px-3 py-3" placeholder="name@example.com" /></label>
        <label className="block space-y-1 text-sm"><span className="font-medium">비밀번호</span><input required type="password" minLength={8} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="w-full rounded-xl border bg-background px-3 py-3" placeholder={mode === "signup" ? "8자 이상" : "비밀번호"} /></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "처리 중..." : mode === "signup" ? "무료로 가입하기" : "로그인"}</button>
      </form>
      {mode === "signin" && <p className="mt-4 text-right text-sm"><Link href="/forgot-password" className="font-medium text-primary underline underline-offset-4">비밀번호를 잊으셨나요?</Link></p>}
    </div>
  )
}
