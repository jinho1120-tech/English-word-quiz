"use client"

import { HapticButton, HapticSummary, HapticLink } from "@/components/haptic-button"

import { useEffect, useState, useTransition } from "react"
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
  updateFamilyPacmanSettings,
  createCouponType,
  updateCouponType,
  deleteCouponType,
  setCouponTypeActive,
} from "@/app/actions/family"

type Child = { id: string; displayName: string; isActive: boolean; createdAt: Date }
type Device = { id: string; childProfileId: string; childName: string; deviceLabel: string | null; lastSeenAt: Date; createdAt: Date }
type Member = { userId: string; email: string; role: string; createdAt: Date }
type Invitation = { id: string; email: string; expiresAt: Date; createdAt: Date }
type ArcadeSettings = { pacmanEnabled: boolean; pacmanDailyPlayLimit: number; pacmanMinDailyQuestions: number; pacmanRequireNoWrongWords: boolean }
type CouponSettings = { childProfileId: string; couponsEnabled: boolean; rewardMinScore: number; rewardMinQuestions: number; requireNoHint: boolean; blankCouponProbability: number; maxStoredCoupons: number }
type Coupon = { id: string; childProfileId: string | null; title: string; description: string | null; isActive: boolean; couponKind: string; drawWeight: number }
type Reward = { id: string; childProfileId: string; childName: string; title: string; status: string; couponKind: string | null; earnedAt: Date }

export function ParentDashboard({
  children,
  devices,
  members,
  invitations,
  parentRole,
  arcadeSettings,
  coupons,
  couponSettings,
  rewards,
  familyTerms,
}: {
  children: Child[]
  devices: Device[]
  members: Member[]
  invitations: Invitation[]
  arcadeSettings: ArcadeSettings
  coupons: Coupon[]
  couponSettings: CouponSettings[]
  rewards: Reward[]
  parentRole: "owner" | "admin"
  currentUserId: string
  ownerUserId: string
  familyTerms: { guardian: string; child: string }
}) {
  const guardianLabel = familyTerms.guardian
  const childLabel = familyTerms.child
  const router = useRouter()
  const [selectedCouponChildId, setSelectedCouponChildId] = useState(children[0]?.id ?? "")
  const [name, setName] = useState("")
  const [createdCode, setCreatedCode] = useState("")
  const [codeChildName, setCodeChildName] = useState("")
  const [qrUrl, setQrUrl] = useState("")
  const [qrChildName, setQrChildName] = useState("")
  const [adminEmail, setAdminEmail] = useState("")
  const [inviteUrl, setInviteUrl] = useState("")
  const [inviteCopyFeedback, setInviteCopyFeedback] = useState<"success" | "error" | "">("")
  const [couponsEnabled, setCouponsEnabled] = useState(couponSettings.find((item) => item.childProfileId === (children[0]?.id ?? ""))?.couponsEnabled ?? false)
  const [rewardMinScore, setRewardMinScore] = useState(couponSettings.find((item) => item.childProfileId === (children[0]?.id ?? ""))?.rewardMinScore ?? 100)
  const [rewardMinQuestions, setRewardMinQuestions] = useState(couponSettings.find((item) => item.childProfileId === (children[0]?.id ?? ""))?.rewardMinQuestions ?? 10)
  const [requireNoHint, setRequireNoHint] = useState(couponSettings.find((item) => item.childProfileId === (children[0]?.id ?? ""))?.requireNoHint ?? true)
  const [blankCouponProbability, setBlankCouponProbability] = useState(couponSettings.find((item) => item.childProfileId === (children[0]?.id ?? ""))?.blankCouponProbability ?? 20)
  const [maxStoredCoupons, setMaxStoredCoupons] = useState(couponSettings.find((item) => item.childProfileId === (children[0]?.id ?? ""))?.maxStoredCoupons ?? 20)
  const [pacmanEnabled, setPacmanEnabled] = useState(arcadeSettings.pacmanEnabled)
  const [pacmanDailyPlayLimit, setPacmanDailyPlayLimit] = useState(arcadeSettings.pacmanDailyPlayLimit)
  const [pacmanMinDailyQuestions, setPacmanMinDailyQuestions] = useState(arcadeSettings.pacmanMinDailyQuestions)
  const [pacmanRequireNoWrongWords, setPacmanRequireNoWrongWords] = useState(arcadeSettings.pacmanRequireNoWrongWords)
  const [couponTitle, setCouponTitle] = useState("")
  const [couponDescription, setCouponDescription] = useState("")
  const [couponKind, setCouponKind] = useState<"regular" | "blank">("regular")
  const [couponWeight, setCouponWeight] = useState(1)
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null)
  const [editingCouponTitle, setEditingCouponTitle] = useState("")
  const [editingCouponDescription, setEditingCouponDescription] = useState("")
  const [editingCouponKind, setEditingCouponKind] = useState<"regular" | "blank">("regular")
  const [editingCouponWeight, setEditingCouponWeight] = useState(1)
  const [error, setError] = useState("")
  const [copyFeedback, setCopyFeedback] = useState<"success" | "error" | "">("")
  const [isPending, startTransition] = useTransition()
  const selectedCouponSettings = couponSettings.find((item) => item.childProfileId === selectedCouponChildId)
  const selectedCoupons = coupons.filter((item) => item.childProfileId === selectedCouponChildId)
  const selectedRewards = rewards.filter((item) => item.childProfileId === selectedCouponChildId)

  useEffect(() => {
    if (!selectedCouponChildId && children[0]) setSelectedCouponChildId(children[0].id)
  }, [children, selectedCouponChildId])

  useEffect(() => {
    const current = couponSettings.find((item) => item.childProfileId === selectedCouponChildId)
    setCouponsEnabled(current?.couponsEnabled ?? false)
    setRewardMinScore(current?.rewardMinScore ?? 100)
    setRewardMinQuestions(current?.rewardMinQuestions ?? 10)
    setRequireNoHint(current?.requireNoHint ?? true)
    setBlankCouponProbability(current?.blankCouponProbability ?? 20)
    setMaxStoredCoupons(current?.maxStoredCoupons ?? 20)
    setCouponTitle("")
    setCouponDescription("")
    setEditingCouponId(null)
  }, [selectedCouponChildId, couponSettings])

  function saveRewardSettings() {
    setError("")
    startTransition(async () => {
      try {
        await updateFamilyRewardSettings({ childProfileId: selectedCouponChildId, couponsEnabled, rewardMinScore, rewardMinQuestions, requireNoHint, blankCouponProbability, maxStoredCoupons })
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "쿠폰 설정을 저장하지 못했습니다.")
      }
    })
  }

  function saveArcadeSettings() {
    setError("")
    startTransition(async () => {
      try {
        await updateFamilyPacmanSettings({ pacmanEnabled, pacmanDailyPlayLimit, pacmanMinDailyQuestions, pacmanRequireNoWrongWords })
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "팩맨 게임 설정을 저장하지 못했습니다.")
      }
    })
  }

  function addCouponType() {
    setError("")
    startTransition(async () => {
      try {
        await createCouponType({ childProfileId: selectedCouponChildId, title: couponTitle, description: couponDescription, couponKind, drawWeight: couponWeight })
        setCouponTitle("")
        setCouponDescription("")
        setCouponKind("regular")
        setCouponWeight(1)
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
        await setCouponTypeActive({ childProfileId: selectedCouponChildId, couponTypeId: coupon.id, isActive: !coupon.isActive })
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "쿠폰 상태를 변경하지 못했습니다.")
      }
    })
  }

  function beginEditCoupon(coupon: Coupon) {
    setEditingCouponId(coupon.id)
    setEditingCouponTitle(coupon.title)
    setEditingCouponDescription(coupon.description ?? "")
    setEditingCouponKind(coupon.couponKind === "blank" ? "blank" : "regular")
    setEditingCouponWeight(coupon.drawWeight)
  }

  function saveCouponEdit() {
    if (!editingCouponId) return
    setError("")
    startTransition(async () => {
      try {
        await updateCouponType({ childProfileId: selectedCouponChildId, couponTypeId: editingCouponId, title: editingCouponTitle, description: editingCouponDescription, couponKind: editingCouponKind, drawWeight: editingCouponWeight })
        setEditingCouponId(null)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "쿠폰을 수정하지 못했습니다.")
      }
    })
  }

  function removeCoupon(coupon: Coupon) {
    if (!window.confirm("'" + coupon.title + "' 쿠폰을 삭제할까요? 이미 발급된 쿠폰의 기록은 유지됩니다.")) return
    setError("")
    startTransition(async () => {
      try {
        await deleteCouponType({ childProfileId: selectedCouponChildId, couponTypeId: coupon.id })
        if (editingCouponId === coupon.id) setEditingCouponId(null)
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "쿠폰을 삭제하지 못했습니다.")
      }
    })
  }

  function addChild() {
    setError("")
    startTransition(async () => {
      try {
        const result = await createChildProfile({ displayName: name })
        setCreatedCode(result.accessCode)
        setCopyFeedback("")
        setCodeChildName(result.displayName)
        setName("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : `${childLabel}를 등록하지 못했습니다.`)
      }
    })
  }

  function showNewCode(childId: string) {
    setError("")
    startTransition(async () => {
      try {
        const result = await regenerateChildAccessCode(childId)
        setCreatedCode(result.accessCode)
        setCopyFeedback("")
        setCodeChildName(result.displayName)
      } catch (err) {
        setError(err instanceof Error ? err.message : "접속코드를 발급하지 못했습니다.")
      }
    })
  }

  async function copyCreatedCode() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("클립보드를 사용할 수 없습니다.")
      await navigator.clipboard.writeText(createdCode)
      setCopyFeedback("success")
    } catch {
      setCopyFeedback("error")
    }
  }

  async function copyInviteLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("클립보드를 사용할 수 없습니다.")
      await navigator.clipboard.writeText(inviteUrl)
      setInviteCopyFeedback("success")
    } catch {
      setInviteCopyFeedback("error")
    }
  }

  function toggleChild(child: Child) {
    const action = child.isActive ? "비활성화" : "다시 활성화"
    if (!window.confirm(`${child.displayName} ${childLabel} 프로필을 ${action}할까요?${child.isActive ? "\n연결된 기기에서는 로그아웃됩니다." : "\n새 접속코드가 발급됩니다."}`)) return
    setError("")
    startTransition(async () => {
      try {
        const result = await setChildProfileActive({ childProfileId: child.id, isActive: !child.isActive })
        if (result.accessCode) { setCreatedCode(result.accessCode); setCopyFeedback(""); setCodeChildName(result.displayName) }
        else { setCreatedCode(""); setCopyFeedback("") }
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : `${childLabel} 상태를 변경하지 못했습니다.`)
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
        setError(err instanceof Error ? err.message : `${childLabel}를 삭제하지 못했습니다.`)
      }
    })
  }

  function revokeDevice(id: string) {
    if (!window.confirm(`이 기기의 ${childLabel} 자동 로그인을 해제할까요?`)) return
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
          <h2 className="text-lg font-bold">{childLabel}별 과목 관리</h2>
          <p className="text-sm text-muted-foreground">{childLabel}를 선택해 과목과 단어장을 관리하세요.</p>
        </div>
        {children.length === 0 ? <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">아직 등록된 {childLabel}가 없습니다. 아래의 ‘{childLabel} 추가’를 눌러 시작하세요.</p> : children.map((child) => (
          <div key={child.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{child.displayName}</p>
              <p className="text-xs text-muted-foreground">{child.isActive ? "사용 중" : "비활성화됨"}</p>
            </div>
            {child.isActive ? <>
              <HapticLink href={`/parent/children/${child.id}/subjects`} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">과목 관리</HapticLink>
              <HapticLink href={`/parent/children/${child.id}/words`} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold">단어장</HapticLink>
            </> : <span className="text-xs text-muted-foreground">비활성화된 {childLabel}입니다</span>}
          </div>
        ))}
      </section>

      <details id="coupon-rewards" className="rounded-2xl border border-border p-4">
        <HapticSummary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <span className="min-w-0"><span className="block text-base font-bold">쿠폰 및 학습 보상 관리</span><span className="mt-0.5 block text-xs text-muted-foreground">보상 조건, 쿠폰 종류, 지급 내역</span></span>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">{selectedCouponSettings ? (couponsEnabled ? "사용 중" : "꺼짐") : "자녀 선택 필요"}</span>
        </HapticSummary>
        <div className="mt-4 space-y-4">
        <label className="block space-y-1 text-sm"><span className="font-semibold">쿠폰을 설정할 자녀</span><select value={selectedCouponChildId} onChange={(event) => setSelectedCouponChildId(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5">{children.map((child) => <option key={child.id} value={child.id}>{child.displayName}</option>)}</select>{!children.length && <span className="text-xs text-muted-foreground">먼저 자녀 프로필을 추가해 주세요.</span>}</label>
<label className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3">
          <span><span className="block text-sm font-semibold">쿠폰 보상 사용</span><span className="block text-xs text-muted-foreground">퀴즈 보상 기능을 사용할지 설정합니다.</span></span>
          <input type="checkbox" checked={couponsEnabled} onChange={(event) => setCouponsEnabled(event.target.checked)} className="size-5 accent-foreground" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1 text-sm"><span className="font-medium">최소 정답률 (%)</span><input type="number" min={1} max={100} value={rewardMinScore} onChange={(event) => setRewardMinScore(Number(event.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
          <label className="space-y-1 text-sm"><span className="font-medium">최소 문제 수</span><input type="number" min={1} max={100} value={rewardMinQuestions} onChange={(event) => setRewardMinQuestions(Number(event.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requireNoHint} onChange={(event) => setRequireNoHint(event.target.checked)} className="size-4 accent-foreground" />힌트를 사용하지 않은 경우에만 보상</label>
        <label className="block space-y-1 text-sm"><span className="font-medium">꽝 쿠폰 전체 당첨 확률 (%)</span><input type="number" min={0} max={100} value={blankCouponProbability} onChange={(event) => setBlankCouponProbability(Number(event.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2" /><span className="text-xs text-muted-foreground">일반 쿠폰 확률은 자동으로 {100 - blankCouponProbability}%가 됩니다.</span></label>
        <label className="block space-y-1 text-sm"><span className="font-medium">쿠폰함 최대 저장 개수</span><input type="number" min={1} max={100} value={maxStoredCoupons} onChange={(event) => setMaxStoredCoupons(Number(event.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2" /><span className="text-xs text-muted-foreground">자녀별 설정 · 1~100개 · 꽝 쿠폰도 포함됩니다. 가득 차면 새 쿠폰 발급이 잠시 중단됩니다.</span></label>
        <HapticButton disabled={isPending || !selectedCouponChildId || !Number.isInteger(rewardMinScore) || rewardMinScore < 1 || rewardMinScore > 100 || !Number.isInteger(rewardMinQuestions) || rewardMinQuestions < 1 || rewardMinQuestions > 100 || !Number.isInteger(blankCouponProbability) || blankCouponProbability < 0 || blankCouponProbability > 100 || !Number.isInteger(maxStoredCoupons) || maxStoredCoupons < 1 || maxStoredCoupons > 100} onClick={saveRewardSettings} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{isPending ? "저장 중..." : "보상 설정 저장"}</HapticButton>
        <div className="space-y-3 border-t border-border pt-4">
          <div><h3 className="font-bold">🎮 학습 후 팩맨 게임</h3><p className="text-xs text-muted-foreground">원할 때만 게임을 허용할 수 있어요. 플레이 횟수는 아이별로 관리되며 매일 한국 시간 자정에 초기화됩니다.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={pacmanEnabled} onChange={(event) => setPacmanEnabled(event.target.checked)} className="size-4 accent-foreground" />자녀에게 팩맨 게임 허용</label>
          <label className="block space-y-1 text-sm"><span className="font-medium">아이 한 명당 하루 플레이 가능 횟수</span><input type="number" min={1} max={10} value={pacmanDailyPlayLimit} onChange={(event) => setPacmanDailyPlayLimit(Number(event.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2" /><span className="text-xs text-muted-foreground">1~10판 · 게임을 시작할 때 1회 차감됩니다.</span></label>
          <label className="block space-y-1 text-sm"><span className="font-medium">팩맨을 위한 하루 최소 단어 문제 수</span><input type="number" min={1} max={100} value={pacmanMinDailyQuestions} onChange={(event) => setPacmanMinDailyQuestions(Number(event.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2" /><span className="text-xs text-muted-foreground">기본 10문제 · 1~100개 범위에서 설정할 수 있어요.</span></label>
           <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={pacmanRequireNoWrongWords} onChange={(event) => setPacmanRequireNoWrongWords(event.target.checked)} className="mt-0.5 size-4 accent-foreground" /><span><span className="block font-medium">남아 있는 모든 오답을 해결해야 게임 허용</span><span className="block text-xs text-muted-foreground">끄면 오답이 남아 있어도 최소 문제 수만 채우면 팩맨을 할 수 있어요.</span></span></label>
           <HapticButton disabled={isPending || !Number.isInteger(pacmanDailyPlayLimit) || pacmanDailyPlayLimit < 1 || pacmanDailyPlayLimit > 10 || !Number.isInteger(pacmanMinDailyQuestions) || pacmanMinDailyQuestions < 1 || pacmanMinDailyQuestions > 100} onClick={saveArcadeSettings} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">{isPending ? "저장 중..." : "게임 설정 저장"}</HapticButton>
        </div>
        <div className="space-y-3 border-t border-border pt-4">
          <div><h3 className="font-bold">쿠폰 추가 및 관리</h3><p className="text-xs text-muted-foreground">첫 {guardianLabel} 관리 화면 진입 시 word-test 예시 쿠폰 7종이 기본 등록됩니다. 이름, 종류, 출현 가중치는 언제든 바꿀 수 있어요. 한 종류의 활성 쿠폰이 없으면 다른 종류에서 대신 추첨합니다.</p></div>
          <input value={couponTitle} onChange={(event) => setCouponTitle(event.target.value)} maxLength={80} placeholder="쿠폰 이름" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
          <textarea value={couponDescription} onChange={(event) => setCouponDescription(event.target.value)} maxLength={1000} rows={2} placeholder="쿠폰 설명 또는 사용 조건 (선택)" className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs"><span>쿠폰 종류</span><select value={couponKind} onChange={(event) => setCouponKind(event.target.value as "regular" | "blank")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="regular">일반 쿠폰</option><option value="blank">꽝 쿠폰</option></select></label>
            <label className="space-y-1 text-xs"><span>개별 출현 가중치</span><input type="number" min={1} max={1000} value={couponWeight} onChange={(event) => setCouponWeight(Number(event.target.value))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
          </div>
          <HapticButton disabled={isPending || !selectedCouponChildId || !couponTitle.trim() || !Number.isInteger(couponWeight) || couponWeight < 1 || couponWeight > 1000} onClick={addCouponType} className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-bold disabled:opacity-50">쿠폰 추가</HapticButton>
          {selectedCoupons.length > 0 && <div className="space-y-2"><h3 className="text-sm font-semibold">등록된 쿠폰</h3>{selectedCoupons.map((coupon) => <div key={coupon.id} className="space-y-2 rounded-xl border border-border p-3">
            {editingCouponId === coupon.id ? <div className="space-y-2">
              <input value={editingCouponTitle} onChange={(event) => setEditingCouponTitle(event.target.value)} maxLength={80} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <textarea value={editingCouponDescription} onChange={(event) => setEditingCouponDescription(event.target.value)} maxLength={1000} rows={2} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <div className="grid grid-cols-2 gap-2">
                <select value={editingCouponKind} onChange={(event) => setEditingCouponKind(event.target.value as "regular" | "blank")} className="rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="regular">일반 쿠폰</option><option value="blank">꽝 쿠폰</option></select>
                <input type="number" min={1} max={1000} value={editingCouponWeight} onChange={(event) => setEditingCouponWeight(Number(event.target.value))} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2"><HapticButton disabled={isPending || !editingCouponTitle.trim() || !Number.isInteger(editingCouponWeight) || editingCouponWeight < 1 || editingCouponWeight > 1000} onClick={saveCouponEdit} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">저장</HapticButton><HapticButton onClick={() => setEditingCouponId(null)} className="rounded-lg border border-border px-3 py-2 text-xs">취소</HapticButton></div>
            </div> : <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{coupon.couponKind === "blank" ? "💥 꽝 쿠폰" : "🎁 일반 쿠폰"} · {coupon.title}</p>{coupon.description && <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{coupon.description}</p>}<p className="mt-1 text-xs text-muted-foreground">{coupon.isActive ? "사용 중" : "중지됨"} · 가중치 {coupon.drawWeight}</p></div>
              <HapticButton disabled={isPending} onClick={() => beginEditCoupon(coupon)} className="rounded-lg border border-border px-2.5 py-2 text-xs font-semibold">수정</HapticButton>
              <HapticButton disabled={isPending} onClick={() => toggleCoupon(coupon)} className="rounded-lg border border-border px-2.5 py-2 text-xs font-semibold">{coupon.isActive ? "중지" : "사용"}</HapticButton>
              <HapticButton disabled={isPending} onClick={() => removeCoupon(coupon)} className="rounded-lg border border-red-300 px-2.5 py-2 text-xs font-semibold text-red-600">삭제</HapticButton>
            </div>}
          </div>)}</div>}
        </div>
        <div className="space-y-2 border-t border-border pt-4">
          <h3 className="font-bold">최근 쿠폰 지급 내역</h3>
          {selectedRewards.length === 0 ? <p className="text-xs text-muted-foreground">아직 지급된 쿠폰이 없습니다.</p> : selectedRewards.map((reward) => <div key={reward.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{reward.childName} · {reward.title}</p><p className="text-xs text-muted-foreground">{new Date(reward.earnedAt).toLocaleString("ko-KR")} · {reward.couponKind === "blank" ? (reward.status === "redeemed" ? "꽝 쿠폰 · 사용 완료" : "꽝 쿠폰 · 사용 대기") : reward.status === "redeemed" ? "사용 완료" : "사용 대기"}</p></div>
          </div>)}
        </div>

        </div>
      </details>

      {createdCode && (
        <section className="space-y-2 rounded-2xl border border-border bg-muted/40 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-bold">{codeChildName} 접속코드</h3>
            <HapticButton onClick={() => { setCreatedCode(""); setCopyFeedback("") }} className="text-sm text-muted-foreground">닫기</HapticButton>
          </div>
          <p className="select-all text-2xl font-black tracking-[0.2em]">{createdCode}</p>
          <p className="text-xs text-muted-foreground">{childLabel} 기기에서 이 코드만 입력하면 됩니다. PIN은 필요하지 않습니다. 코드는 가족 관리 화면에서 언제든 새로 발급할 수 있습니다.</p>
          <HapticButton onClick={copyCreatedCode} className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold">
            {copyFeedback === "success" ? "✓ 복사 완료!" : "접속코드 복사"}
          </HapticButton>
          {copyFeedback === "success" ? (
            <p role="status" aria-live="polite" className="text-sm font-semibold text-emerald-600">접속코드가 클립보드에 복사되었습니다.</p>
          ) : copyFeedback === "error" ? (
            <p role="alert" className="text-sm font-medium text-red-600">복사하지 못했어요. 접속코드를 길게 눌러 직접 복사해 주세요.</p>
          ) : null}
        </section>
      )}

      <details className="rounded-2xl border border-border p-4">
        <HapticSummary className="cursor-pointer list-none font-bold">＋ {childLabel} 추가 및 접속 관리</HapticSummary>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="child-name">{childLabel} 이름</label>
            <input id="child-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder={`${childLabel} 이름`} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" />
            <HapticButton disabled={isPending || !name.trim()} onClick={addChild} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">{isPending ? "등록 중..." : `${childLabel} 프로필 만들기`}</HapticButton>
            <p className="text-xs text-muted-foreground">PIN은 필요하지 않습니다. 접속코드는 필요할 때마다 새로 발급할 수 있으며, 새 코드를 발급하면 이전 코드는 사용할 수 없습니다. QR도 언제든 다시 만들 수 있습니다.</p>
          </div>
          <div className="space-y-3 border-t border-border pt-3">
            <h3 className="text-sm font-bold">등록된 {childLabel}</h3>
            {children.map((child) => (
              <div key={child.id} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <div><p className="font-semibold">{child.displayName}</p><p className="text-xs text-muted-foreground">{child.isActive ? "사용 중" : "비활성화됨"}</p></div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {child.isActive && <>
                      <HapticButton disabled={isPending} onClick={() => showNewCode(child.id)} className="rounded-lg border border-border px-2.5 py-2 text-xs font-semibold">새 접속코드 발급</HapticButton>
                      <HapticButton disabled={isPending} onClick={() => startTransition(async () => { try { const result = await createChildQrEnrollment(child.id); setQrUrl(result.url); setQrChildName(child.displayName) } catch (err) { setError(err instanceof Error ? err.message : "QR 코드를 만들지 못했습니다.") } })} className="rounded-lg border border-border px-2.5 py-2 text-xs font-semibold">QR 발급</HapticButton>
                    </>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <HapticButton disabled={isPending} onClick={() => toggleChild(child)} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">{child.isActive ? "일시 비활성화" : "다시 활성화"}</HapticButton>
                  <HapticButton disabled={isPending} onClick={() => removeChild(child)} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600">영구 삭제</HapticButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      </details>

      {qrUrl && (
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <div className="flex items-center justify-between"><h2 className="font-bold">{qrChildName} 기기 등록 QR</h2><HapticButton onClick={() => setQrUrl("")} className="text-sm text-muted-foreground">닫기</HapticButton></div>
          <div className="flex justify-center rounded-xl bg-white p-4"><QRCodeSVG value={qrUrl} size={220} level="H" /></div>
          <p className="text-xs text-muted-foreground">{childLabel} 기기로 QR 코드를 스캔하세요. QR은 보안을 위해 5분간 유효하고 한 번만 사용할 수 있습니다. 필요하면 새 QR을 발급하세요.</p>
        </section>
      )}

      <details className="rounded-2xl border border-border p-4">
        <HapticSummary className="cursor-pointer list-none font-bold">＋ {guardianLabel} 공동관리자 관리</HapticSummary>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">다른 {guardianLabel}를 초대하면 각자 자기 계정과 기기에서 같은 가족의 {childLabel}와 학습 데이터를 관리할 수 있습니다.</p>
          <div className="rounded-xl bg-muted p-3 text-sm"><p className="font-semibold">가족 대표 {guardianLabel}</p><p className="text-muted-foreground">가족 생성자 · 대표 권한 보유</p></div>
          {members.map((member) => (
            <div key={member.userId} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1"><p className="break-all text-sm font-semibold">{member.email}</p><p className="text-xs text-muted-foreground">공동 관리자</p></div>
              {parentRole === "owner" && <HapticButton disabled={isPending} onClick={() => { if (!window.confirm(member.email + " 관리자를 가족에서 해제할까요?")) return; startTransition(async () => { try { await removeParentAdministrator(member.userId); router.refresh() } catch (err) { setError(err instanceof Error ? err.message : "관리자 해제에 실패했습니다.") } }) }} className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600">해제</HapticButton>}
            </div>
          ))}
          {parentRole === "owner" ? <>
            <div className="space-y-2"><input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} placeholder="초대할 공동관리자의 이메일" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" /><HapticButton disabled={isPending || !adminEmail.includes("@")} onClick={() => startTransition(async () => { setError(""); try { const result = await createParentInvitation(adminEmail); setInviteUrl(result.inviteUrl); setInviteCopyFeedback(""); setAdminEmail(""); router.refresh() } catch (err) { setError(err instanceof Error ? err.message : "공동관리자 초대에 실패했습니다.") } })} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50">공동관리자 초대 링크 만들기</HapticButton></div>
            {inviteUrl && <div className="space-y-2 rounded-xl bg-muted p-3"><p className="text-sm font-semibold">초대 링크가 만들어졌어요.</p><p className="break-all text-xs text-muted-foreground">{inviteUrl}</p><HapticButton onClick={() => navigator.clipboard.writeText(inviteUrl)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold">초대 링크 복사</HapticButton><p className="text-xs text-muted-foreground">초대받은 공동관리자에게 링크를 전달하세요. 7일 후 만료되며 초대받은 이메일로 가입 또는 로그인해야 합니다.</p></div>}
            {invitations.map((invitation) => <div key={invitation.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3"><div className="min-w-0 flex-1"><p className="break-all text-sm">{invitation.email}</p><p className="text-xs text-muted-foreground">초대 대기 · {new Date(invitation.expiresAt).toLocaleDateString("ko-KR")} 만료</p></div><HapticButton disabled={isPending} onClick={() => startTransition(async () => { try { await revokeParentInvitation(invitation.id); router.refresh() } catch (err) { setError(err instanceof Error ? err.message : "초대를 취소하지 못했습니다.") } })} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">취소</HapticButton></div>)}
          </> : <p className="text-xs text-muted-foreground">공동 관리자 권한으로 접속 중입니다. 다른 공동관리자 초대와 관리자 해제는 가족 대표 {guardianLabel}만 할 수 있습니다.</p>}
        </div>
      </details>

      <details className="rounded-2xl border border-border p-4">
        <HapticSummary className="cursor-pointer list-none font-bold">＋ 연결된 {childLabel} 기기</HapticSummary>
        <div className="mt-4 space-y-3">
          {devices.length === 0 ? <p className="text-sm text-muted-foreground">등록된 기기가 없습니다.</p> : devices.map((device) => (
            <div key={device.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
              <div className="min-w-0 flex-1"><p className="font-semibold">{device.childName}</p><p className="text-xs text-muted-foreground">{device.deviceLabel || "이름 없는 기기"} · 최근 접속 {new Date(device.lastSeenAt).toLocaleString("ko-KR")}</p></div>
              <HapticButton disabled={isPending} onClick={() => revokeDevice(device.id)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">연결 해제</HapticButton>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
