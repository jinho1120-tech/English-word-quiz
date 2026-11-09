"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import {
  createChildProfile,
  createChildQrEnrollment,
  deleteChildProfile,
  regenerateChildAccessCode,
  revokeChildDeviceSession,
  createParentInvitation,
  revokeParentInvitation,
  removeParentAdministrator,
  setChildProfileActive,
  updateFamilyRewardSettings,
  createCouponType,
  setCouponTypeActive,
  sendParentRewardTestSms,
  resendCouponRewardSms,
} from "@/app/actions/family"

type Child = { id: string; displayName: string; isActive: boolean; createdAt: Date }
type Device = { id: string; childProfileId: string; childName: string; deviceLabel: string | null; lastSeenAt: Date; createdAt: Date }
type Member = { userId: string; email: string; role: string; createdAt: Date }
type Invitation = { id: string; email: string; expiresAt: Date; createdAt: Date }
type FamilySettings = { couponsEnabled: boolean; parentPhone: string | null; rewardMinScore: number; rewardMinQuestions: number; requireNoHint: boolean } | null
type Coupon = { id: string; title: string; description: string | null; isActive: boolean }
type Reward = { id: string; childName: string; title: string; status: string; earnedAt: Date; notifiedAt: Date | null }

export function ParentDashboard({
  children,
  devices,
  members,
  invitations,
  parentRole,
  settings,
  coupons,
  rewards,
}: {
  children: Child[]
  devices: Device[]
  members: Member[]
  invitations: Invitation[]
  settings: FamilySettings
  coupons: Coupon[]
  rewards: Reward[]
  parentRole: "owner" | "admin"
  currentUserId: string
  ownerUserId: string
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [createdCode, setCreatedCode] = useState("")
  const [codeChildName, setCodeChildName] = useState("")
  const [qrUrl, setQrUrl] = useState("")
  const [qrChildName, setQrChildName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [inviteUrl, setInviteUrl] = useState("")
  const [parentPhone, setParentPhone] = useState(settings?.parentPhone ?? "")
  const [couponsEnabled, setCouponsEnabled] = useState(settings?.couponsEnabled ?? false)
  const [rewardMinScore, setRewardMinScore] = useState(settings?.rewardMinScore ?? 100)
  const [rewardMinQuestions, setRewardMinQuestions] = useState(settings?.rewardMinQuestions ?? 10)
  const [requireNoHint, setRequireNoHint] = useState(settings?.requireNoHint ?? true)
  const [couponTitle, setCouponTitle] = useState("")
  const [couponDescription, setCouponDescription] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function saveRewardSettings() {
    setError("")
    startTransition(async () => {
      try {
        await updateFamilyRewardSettings({ couponsEnabled, parentPhone, rewardMinScore, rewardMinQuestions, requireNoHint })
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "쿠폰 설정을 저장하지 못했습니다.")
      }
    })
  }

  function addCouponType() {
    setError("")
    startTransition(async () => {
      try {
        await createCouponType({ title: couponTitle, description: couponDescription })
        setCouponTitle("")
        setCouponDescription("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "쿠폰을 만들지 못했습니다.")
      }
    })
  }

  function toggleCoupon(coupon: Coupon) {
    setError("")
    startTransition(async () => {
      try {
        await setCouponTypeActive({ couponTypeId: coupon.id, isActive: !coupon.isActive })
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "쿠폰 상태를 변경하지 못했습니다.")
      }
    })
  }

  function addChild() {
    setError("")
    startTransition(async () => {
      try {
        const result = await createChildProfile({ displayName: name })
        setCreatedCode(result.accessCode)
        setCodeChildName(result.displayName)
        setName("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "자녀를 등록하지 못했습니다.")
      }
    })
  }

  function showNewCode(childId: string) {
    setError("")
    startTransition(async () => {
      try {
        const result = await regenerateChildAccessCode(childId)
        setCreatedCode(result.accessCode)
        setCodeChildName(result.displayName)
      } catch (err) {
        setError(err instanceof Error ? err.message : "접속코드를 발급하지 못했습니다.")
      }
    })
  }

  function toggleChild(child: Child) {
    const action = child.isActive ? "비활성화" : "다시 활성화"
    if (!window.confirm(`${child.displayName} 자녀 프로필을 ${action}할까요?${child.isActive ? "\n연결된 기기에서는 로그아웃됩니다." : "\n새 접속코드가 발급됩니다."}`)) return
    setError("")
    startTransition(async () => {
      try {
        const result = await setChildProfileActive({ childProfileId: child.id, isActive: !child.isActive })
        if (result.accessCode) { setCreatedCode(result.accessCode); setCodeChildName(result.displayName) }
        else setCreatedCode("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "자녀 상태를 변경하지 못했습니다.")
      }
    })
  }

  function removeChild(child: Child) {
    if (!window.confirm(`정말 ${child.displayName} 프로필을 영구 삭제할까요?\n과목, 단어장, 학습 기록, 보상 기록 및 연결 기기가 모두 삭제되며 복구할 수 없습니다.`)) return
    setError("")
    startTransition(async () => {
      try {
        await deleteChildProfile(child.id)
        setCreatedCode("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "자녀를 삭제하지 못했습니다.")
      }
    })
  }

  function revokeDevice(id: string) {
    if (!window.confirm("이 기기의 자녀 자동 로그인을 해제할까요?")) return
    setError("")
    startTransition(async () => {
      try {
        await revokeChildDeviceSession(id)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "기기 연결을 해제하지 못했습니다.")
      }
    })
  }

  return (
    <div className="space-y-7">
      {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold">자녀별 과목 관리</h2>
          <p className="text-sm text-muted-foreground">자녀를 선택해 과목과 단어장을 관리하세요.</p>
        </div>
        {children.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">아직 등록된 자녀가 없습니다. 아래의 ‘자녀 추가’를 눌러 시작하세요.</p> : children.map((child) => (
          <div key={child.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{child.displayName}</p>
              <p className="text-xs text-muted-foreground">{child.isActive ? "사용 중" : "비활성화됨"}</p>
            </div>
            {child.isActive ? <>
              <a href={`/parent/children/${child.id}/subjects`} className="rounded-lg bg-foreground px-3 py-2 text-sm font-semibold text-background">과목 관리</a>
              <a href={`/parent/children/${child.id}/words`} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">단어장</a>
            </> : <span className="text-xs text-muted-foreground">비활성화된 자녀입니다</span>}
          </div>
        ))}
      </section>

      <section className="space-y-4 rounded-2xl border border-border p-4">
        <div>
          <h2 className="text-lg font-bold">쿠폰 및 학습 보상 관리</h2>
          <p className="text-sm text-muted-foreground">부모 연락처와 퀴즈 보상 조건, 자녀에게 제공할 쿠폰 종류를 설정합니다.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="parent-reward-phone" className="text-sm font-semibold">부모 전화번호</label>
          <input id="parent-reward-phone" type="tel" autoComplete="tel" value={parentPhone} onChange={(event) => setParentPhone(event.target.value)} placeholder="예: 010-1234-5678" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
          <p className="text-xs text-muted-foreground">쿠폰을 받을 때 알림 문자를 받을 번호입니다.</p>
          <button disabled={isPending || !parentPhone.trim()} onClick={() => startTransition(async () => { setError(""); try { await updateFamilyRewardSettings({ couponsEnabled, parentPhone, rewardMinScore, rewardMinQuestions, requireNoHint }); await sendParentRewardTestSms(); router.refresh(); } catch (err) { setError(err instanceof Error ? err.message : "테스트 문자를 보내지 못했습니다.") } })} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-semibold disabled:opacity-50">테스트 문자 보내기</button>
          <p className="text-xs text-muted-foreground">문자 자동 발송을 사용하려면 Vercel 환경변수 SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER_PHONE을 설정하고 솔라피에 발신번호를 등록해야 합니다.</p>

        </div>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3">
          <span><span className="block text-sm font-semibold">쿠폰 보상 사용</span><span className="block text-xs text-muted-foreground">퀴즈 보상 기능을 사용할지 설정합니다.</span></span>
          <input type="checkbox" checked={couponsEnabled} onChange={(event) => setCouponsEnabled(event.target.checked)} className="size-5 accent-foreground" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm"><span className="font-medium">최소 정답률 (%)</span><input type="number" min={1} max={100} value={rewardMinScore} onChange={(event) => setRewardMinScore(Number(event.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">최소 문제 수</span><input type="number" min={1} max={100} value={rewardMinQuestions} onChange={(event) => setRewardMinQuestions(Number(event.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requireNoHint} onChange={(event) => setRequireNoHint(event.target.checked)} className="size-4 accent-foreground" />힌트를 사용하지 않은 경우에만 보상</label>
        <button disabled={isPending || !Number.isInteger(rewardMinScore) || rewardMinScore < 1 || rewardMinScore > 100 || !Number.isInteger(rewardMinQuestions) || rewardMinQuestions < 1 || rewardMinQuestions > 100} onClick={saveRewardSettings} className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">{isPending ? "저장 중..." : "보상 설정 저장"}</button>
        <div className="space-y-3 border-t border-border pt-4">
          <div><h3 className="font-bold">쿠폰 종류 만들기</h3><p className="text-xs text-muted-foreground">예: 아이스크림 1개, 게임 30분, 주말 외식 메뉴 선택권</p></div>
          <input value={couponTitle} onChange={(event) => setCouponTitle(event.target.value)} maxLength={80} placeholder="쿠폰 이름" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
          <textarea value={couponDescription} onChange={(event) => setCouponDescription(event.target.value)} maxLength={1000} rows={2} placeholder="쿠폰 설명 또는 사용 조건 (선택)" className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
          <button disabled={isPending || !couponTitle.trim()} onClick={addCouponType} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">쿠폰 종류 추가</button>
          {coupons.length > 0 && <div className="space-y-2"><h3 className="text-sm font-semibold">등록된 쿠폰</h3>{coupons.map((coupon) => <div key={coupon.id} className="flex items-center gap-3 rounded-xl border border-border p-3"><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{coupon.title}</p>{coupon.description && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{coupon.description}</p>}<p className="mt-1 text-xs text-muted-foreground">{coupon.isActive ? "사용 중" : "중지됨"}</p></div><button disabled={isPending} onClick={() => toggleCoupon(coupon)} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold">{coupon.isActive ? "중지" : "사용"}</button></div>)}</div>}
        </div>
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="font-bold">최근 쿠폰 지급 내역</h3>
          {rewards.length === 0 ? <p className="text-xs text-muted-foreground">아직 지급된 쿠폰이 없습니다.</p> : rewards.map((reward) => <div key={reward.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{reward.childName} · {reward.title}</p><p className="text-xs text-muted-foreground">{new Date(reward.earnedAt).toLocaleString("ko-KR")} · {reward.notifiedAt ? "문자 알림 발송" : "문자 알림 미발송"}</p></div>
            {!reward.notifiedAt && <button disabled={isPending || !parentPhone.trim()} onClick={() => startTransition(async () => { setError(""); try { await resendCouponRewardSms(reward.id); router.refresh() } catch (err) { setError(err instanceof Error ? err.message : "문자를 다시 보내지 못했습니다.") } })} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50">문자 재발송</button>}
          </div>)}
        </div>

      </section>

      {createdCode && (
        <section className="space-y-2 rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold">{codeChildName} 접속코드</h3>
            <button onClick={() => setCreatedCode("")} className="text-sm text-muted-foreground">닫기</button>
          </div>
          <p className="select-all text-2xl font-black tracking-[0.2em]">{createdCode}</p>
          <p className="text-xs text-muted-foreground">자녀 기기에서 이 코드만 입력하면 됩니다. PIN은 필요하지 않습니다. 코드는 부모 화면에서 언제든 새로 발급할 수 있습니다.</p>
          <button onClick={() => navigator.clipboard.writeText(createdCode)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold">접속코드 복사</button>
        </section>
      )}

      <details className="rounded-2xl border border-border p-4">
        <summary className="cursor-pointer list-none font-bold">＋ 자녀 추가 및 접속 관리</summary>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="child-name">자녀 이름</label>
            <input id="child-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="자녀 이름" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
            <button disabled={isPending || !name.trim()} onClick={addChild} className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">{isPending ? "등록 중..." : "자녀 프로필 만들기"}</button>
            <p className="text-xs text-muted-foreground">PIN은 필요하지 않습니다. 접속코드는 필요할 때마다 새로 발급할 수 있으며, 새 코드를 발급하면 이전 코드는 사용할 수 없습니다. QR도 언제든 다시 만들 수 있습니다.</p>
          </div>
          <div className="space-y-3 border-t border-border pt-3">
            <h3 className="text-sm font-bold">등록된 자녀</h3>
            {children.map((child) => (
              <div key={child.id} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div><p className="font-semibold">{child.displayName}</p><p className="text-xs text-muted-foreground">{child.isActive ? "사용 중" : "비활성화됨"}</p></div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {child.isActive && <>
                      <button disabled={isPending} onClick={() => showNewCode(child.id)} className="rounded-lg border border-border px-2.5 py-2 text-xs font-semibold">새 접속코드 발급</button>
                      <button disabled={isPending} onClick={() => startTransition(async () => { try { const result = await createChildQrEnrollment(child.id); setQrUrl(result.url); setQrChildName(child.displayName) } catch (err) { setError(err instanceof Error ? err.message : "QR 코드를 만들지 못했습니다.") } })} className="rounded-lg border border-border px-2.5 py-2 text-xs font-semibold">QR 발급</button>
                    </>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button disabled={isPending} onClick={() => toggleChild(child)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">{child.isActive ? "일시 비활성화" : "다시 활성화"}</button>
                  <button disabled={isPending} onClick={() => removeChild(child)} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600">영구 삭제</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      {qrUrl && (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between"><h2 className="font-bold">{qrChildName} 기기 등록 QR</h2><button onClick={() => setQrUrl("")} className="text-sm text-muted-foreground">닫기</button></div>
          <div className="flex justify-center rounded-xl bg-white p-4"><QRCodeSVG value={qrUrl} size={220} level="H" /></div>
          <p className="text-xs text-muted-foreground">자녀 기기로 QR 코드를 스캔하세요. QR은 보안을 위해 5분간 유효하고 한 번만 사용할 수 있습니다. 필요하면 새 QR을 발급하세요.</p>
        </section>
      )}

      <details className="rounded-2xl border border-border p-4">
        <summary className="cursor-pointer list-none font-bold">＋ 부모 공동관리자 관리</summary>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">다른 부모를 초대하면 각자 자기 계정과 기기에서 같은 가족의 자녀와 학습 데이터를 관리할 수 있습니다.</p>
          <div className="rounded-xl bg-muted p-3 text-sm"><p className="font-semibold">가족 대표 부모</p><p className="text-muted-foreground">가족 생성자 · 대표 권한 보유</p></div>
          {members.map((member) => (
            <div key={member.userId} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold">{member.email}</p><p className="text-xs text-muted-foreground">공동 관리자</p></div>
              {parentRole === "owner" && <button disabled={isPending} onClick={() => { if (!window.confirm(member.email + " 관리자를 가족에서 해제할까요?")) return; startTransition(async () => { try { await removeParentAdministrator(member.userId); router.refresh() } catch (err) { setError(err instanceof Error ? err.message : "관리자 해제에 실패했습니다.") } }) }} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600">해제</button>}
            </div>
          ))}
          {parentRole === "owner" ? <>
            <div className="space-y-2"><input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="초대할 부모의 이메일" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" /><button disabled={isPending || !adminEmail.includes("@")} onClick={() => startTransition(async () => { setError(""); try { const result = await createParentInvitation(adminEmail); setInviteUrl(result.inviteUrl); setAdminEmail(""); router.refresh() } catch (err) { setError(err instanceof Error ? err.message : "부모 초대에 실패했습니다.") } })} className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">부모 관리자 초대 링크 만들기</button></div>
            {inviteUrl && <div className="space-y-2 rounded-xl bg-muted p-3"><p className="text-sm font-semibold">초대 링크가 만들어졌어요.</p><p className="break-all text-xs text-muted-foreground">{inviteUrl}</p><button onClick={() => navigator.clipboard.writeText(inviteUrl)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold">초대 링크 복사</button><p className="text-xs text-muted-foreground">초대받은 부모에게 링크를 전달하세요. 7일 후 만료되며 초대받은 이메일로 가입 또는 로그인해야 합니다.</p></div>}
            {invitations.map((invitation) => <div key={invitation.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3"><div className="min-w-0 flex-1"><p className="break-all text-sm">{invitation.email}</p><p className="text-xs text-muted-foreground">초대 대기 · {new Date(invitation.expiresAt).toLocaleDateString("ko-KR")} 만료</p></div><button disabled={isPending} onClick={() => startTransition(async () => { try { await revokeParentInvitation(invitation.id); router.refresh() } catch (err) { setError(err instanceof Error ? err.message : "초대를 취소하지 못했습니다.") } })} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">취소</button></div>)}
          </> : <p className="text-xs text-muted-foreground">공동 관리자 권한으로 접속 중입니다. 다른 부모 초대와 관리자 해제는 가족 대표 부모만 할 수 있습니다.</p>}
        </div>
      </details>

      <details className="rounded-2xl border border-border p-4">
        <summary className="cursor-pointer list-none font-bold">＋ 연결된 자녀 기기</summary>
        <div className="mt-4 space-y-3">
          {devices.length === 0 ? <p className="text-sm text-muted-foreground">등록된 기기가 없습니다.</p> : devices.map((device) => (
            <div key={device.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1"><p className="font-semibold">{device.childName}</p><p className="text-xs text-muted-foreground">{device.deviceLabel || "이름 없는 기기"} · 최근 접속 {new Date(device.lastSeenAt).toLocaleString("ko-KR")}</p></div>
              <button disabled={isPending} onClick={() => revokeDevice(device.id)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">연결 해제</button>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
