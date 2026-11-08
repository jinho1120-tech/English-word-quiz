"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createChildProfile, revokeChildDeviceSession } from "@/app/actions/family"

type Child = { id: string; displayName: string; isActive: boolean; createdAt: Date }
type Device = { id: string; childProfileId: string; childName: string; deviceLabel: string | null; lastSeenAt: Date; createdAt: Date }

export function ParentDashboard({
  children,
  devices,
}: {
  children: Child[]
  devices: Device[]
}) {
  const router = useRouter()
  const [name, setName] = useState("")
  const [pin, setPin] = useState("")
  const [createdCode, setCreatedCode] = useState("")
  const [error, setError] = useState("")
  const [isPending, startTransition] = useTransition()

  function addChild() {
    setError("")
    startTransition(async () => {
      try {
        const result = await createChildProfile({ displayName: name, pin })
        setCreatedCode(result.accessCode)
        setName("")
        setPin("")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "자녀를 등록하지 못했습니다.")
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
    <div className="space-y-8">
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h2 className="text-lg font-bold">자녀 추가</h2>
        <p className="text-sm text-muted-foreground">자녀 이름과 최초 접속 PIN을 정해 주세요. 접속 코드는 생성 후 한 번 표시됩니다.</p>
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="자녀 이름" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <input value={pin} onChange={(event) => setPin(event.target.value)} inputMode="numeric" type="password" maxLength={8} placeholder="숫자 PIN 4~8자리" className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
        <button disabled={isPending || !name.trim() || !/^\d{4,8}$/.test(pin)} onClick={addChild} className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background disabled:opacity-50">자녀 프로필 만들기</button>
        {createdCode && <div className="rounded-xl bg-muted p-3"><p className="text-xs text-muted-foreground">자녀 기기 최초 접속 코드</p><p className="select-all text-xl font-black tracking-widest">{createdCode}</p><p className="mt-1 text-xs text-muted-foreground">PIN과 함께 자녀에게 안전하게 전달해 주세요.</p></div>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">자녀별 과목 관리</h2>
        {children.length === 0 ? <p className="text-sm text-muted-foreground">아직 자녀 프로필이 없습니다.</p> : children.map((child) => (
          <div key={child.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1"><p className="font-semibold">{child.displayName}</p><p className="text-xs text-muted-foreground">{child.isActive ? "사용 중" : "비활성"}</p></div>
            <a href={`/parent/children/${child.id}/subjects`} className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold">과목 관리</a>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">연결된 자녀 기기</h2>
        {devices.length === 0 ? <p className="text-sm text-muted-foreground">등록된 기기가 없습니다.</p> : devices.map((device) => (
          <div key={device.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <div className="min-w-0 flex-1"><p className="font-semibold">{device.childName}</p><p className="text-xs text-muted-foreground">{device.deviceLabel || "이름 없는 기기"} · 최근 접속 {new Date(device.lastSeenAt).toLocaleString("ko-KR")}</p></div>
            <button disabled={isPending} onClick={() => revokeDevice(device.id)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-600 disabled:opacity-50">연결 해제</button>
          </div>
        ))}
      </section>
    </div>
  )
}
