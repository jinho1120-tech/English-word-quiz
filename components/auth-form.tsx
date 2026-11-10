"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { authClient } from "@/lib/auth-client"
import { Eye, EyeOff } from "lucide-react"

type ParentRole = "아빠" | "엄마" | "기타 보호자"

export function AuthForm({ inviteToken, inviteEmail, signedInEmail, inviteError }: { inviteToken?: string; inviteEmail?: string; signedInEmail?: string; inviteError?: string }) {
  const router = useRouter()
  const [mode, setMode] = useState<"signin" | "signup">(inviteToken ? "signup" : "signin")
  const [parentRole, setParentRole] = useState<ParentRole>("아빠")
  const [guardianRelation, setGuardianRelation] = useState("")
  const [email, setEmail] = useState(inviteEmail ?? "")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function switchAccount() {
    await authClient.signOut()
    router.refresh()
  }

  if (inviteToken && signedInEmail && inviteEmail && signedInEmail.toLowerCase() !== inviteEmail.toLowerCase()) {
    return (
      <section className="w-full space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <p className="font-bold">다른 계정으로 로그인되어 있어요.</p>
        <p className="text-sm text-muted-foreground">현재 계정: {signedInEmail}</p>
        <p className="text-sm text-muted-foreground">초대받은 주소: {inviteEmail}</p>
        <p className="text-sm">초대받은 이메일 주소로만 공동관리자 초대를 수락할 수 있습니다.</p>
        <button type="button" onClick={switchAccount} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">로그아웃하고 초대 계정으로 전환</button>
      </section>
    )
  }

  if (inviteToken && signedInEmail && inviteError === "already_has_family") {
    return (
      <section className="w-full space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <p className="font-bold">이 계정은 다른 가족 공간에 연결되어 있어요.</p>
        <p className="text-sm text-muted-foreground">기존 가족 공간과 학습 데이터는 그대로 유지됩니다. 다른 계정으로 초대를 수락하려면 로그아웃해 주세요.</p>
        <button type="button" onClick={switchAccount} className="w-full rounded-xl border px-4 py-3 font-semibold">로그아웃하고 다른 계정 사용</button>
        <button type="button" onClick={() => router.push("/parent")} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">현재 가족 관리 화면으로 이동</button>
      </section>
    )
  }

  if (inviteToken && signedInEmail && inviteError === "already_member") {
    return (
      <section className="w-full space-y-3 rounded-2xl border bg-card p-6 shadow-sm">
        <p className="font-bold">이미 이 가족의 공동관리자로 참여하고 있어요.</p>
        <button type="button" onClick={() => router.push("/parent")} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground">가족 관리 화면으로 이동</button>
      </section>
    )
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const callbackURL = inviteToken ? "/parent/invite/accept?token=" + encodeURIComponent(inviteToken) : "/"
      const relation = guardianRelation.trim()
      if (mode === "signup" && password !== confirmPassword) {
        setError("비밀번호가 일치하지 않습니다. 다시 확인해 주세요.")
        return
      }
      if (!inviteToken && mode === "signup" && parentRole === "기타 보호자" && !relation) {
        setError("자녀와의 관계를 입력해 주세요.")
        return
      }
      const displayName = inviteToken ? "공동 관리자" : parentRole === "기타 보호자" ? relation : parentRole
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
        <button type="button" onClick={() => setMode("signin")} className={`rounded-lg py-2 font-semibold ${mode === "signin" ? "bg-background shadow" : "text-muted-foreground"}`}>로그인</button>
        <button type="button" onClick={() => setMode("signup")} className={`rounded-lg py-2 font-semibold ${mode === "signup" ? "bg-background shadow" : "text-muted-foreground"}`}>회원가입</button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {!inviteToken && mode === "signup" && (
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
        <label className="block space-y-1 text-sm"><span className="font-medium">이메일</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} readOnly={!!inviteToken} autoComplete="email" className="w-full rounded-xl border bg-background px-3 py-3 read-only:bg-muted read-only:text-muted-foreground" placeholder="name@example.com" /></label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">비밀번호</span>
          <span className="relative block">
            <input
              required
              type={showPassword ? "text" : "password"}
              minLength={8}
              maxLength={128}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className={`w-full rounded-xl border bg-background py-3 pl-3 pr-11 outline-none transition-colors focus:ring-2 focus:ring-offset-1 ${
                mode === "signup" && password.length > 0
                  ? password.length >= 8
                    ? "border-blue-500 focus:ring-blue-500"
                    : "border-red-500 focus:ring-red-500"
                  : "border-input focus:ring-ring"
              }`}
              placeholder={mode === "signup" ? "8자 이상" : "비밀번호"}
            />
            <button
              type="button"
              onClick={() => setShowPassword(value => !value)}
              aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
              aria-pressed={showPassword}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
            </button>
          </span>
          {mode === "signup" && password.length > 0 && password.length < 8 && (
            <span className="block text-xs text-red-600">비밀번호는 8자 이상이어야 합니다.</span>
          )}
        </label>
        {mode === "signup" && (
          <label className="block space-y-1 text-sm">
            <span className="font-medium">비밀번호 재입력</span>
            <span className="relative block">
              <input
                required
                type={showConfirmPassword ? "text" : "password"}
                minLength={8}
                maxLength={128}
                value={confirmPassword}
                onChange={e => {
                  setConfirmPassword(e.target.value)
                  setError("")
                }}
                autoComplete="new-password"
                className={"w-full rounded-xl border bg-background py-3 pl-3 pr-11 outline-none transition-colors focus:ring-2 focus:ring-offset-1 " + (
                  confirmPassword.length > 0
                    ? confirmPassword === password
                      ? "border-blue-500 focus:ring-blue-500"
                      : "border-red-500 focus:ring-red-500"
                    : "border-input focus:ring-ring"
                )}
                placeholder="비밀번호를 한 번 더 입력해 주세요"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(value => !value)}
                aria-label={showConfirmPassword ? "재입력 비밀번호 숨기기" : "재입력 비밀번호 표시"}
                aria-pressed={showConfirmPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
              >
                {showConfirmPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
              </button>
            </span>
            {confirmPassword.length > 0 && (
              <span className={"block text-xs " + (confirmPassword === password ? "text-blue-600" : "text-red-600")}>
                {confirmPassword === password ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다."}
              </span>
            )}
          </label>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50">{busy ? "처리 중..." : mode === "signup" ? "무료로 가입하기" : "로그인"}</button>
      </form>
      {mode === "signin" && (
        <div className="mt-4 flex flex-col gap-3 text-sm">
          <p className="text-center text-muted-foreground">
            아직 계정이 없으신가요?{" "}
            <button type="button" onClick={() => setMode("signup")} className="font-semibold text-primary underline underline-offset-4">회원가입</button>
            을 눌러 우리 가족 단어장을 시작해 보세요.
          </p>
          <p className="text-right"><Link href="/forgot-password" className="font-medium text-primary underline underline-offset-4">비밀번호를 잊으셨나요?</Link></p>
        </div>
      )}
    </div>
  )
}
