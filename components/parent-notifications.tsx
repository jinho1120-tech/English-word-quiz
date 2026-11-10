"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  getParentNotificationData,
  deleteParentNotification,
  deleteAllReadParentNotifications,
  getPushPublicKey,
  markAllParentNotificationsRead,
  markParentNotificationRead,
  removeParentPushSubscription,
  saveParentNotificationPreferences,
  saveParentPushSubscription,
} from "@/app/actions/notifications"

type NotificationItem = {
  id: string
  type: string
  title: string
  message: string
  href: string
  readAt: Date | null
  createdAt: Date
}
type Preferences = {
  pushEnabled: boolean
  couponIssued: boolean
  couponUseRequested: boolean
  penaltyIssued: boolean
  penaltyCompleted: boolean
  deviceRegistered: boolean
}
type NotificationData = {
  notifications: NotificationItem[]
  unreadCount: number
  preferences: Preferences
  hasPushSubscription: boolean
}

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  return Uint8Array.from(raw, (char) => char.charCodeAt(0))
}

function updateAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (value?: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
  if (count > 0) void nav.setAppBadge?.(count).catch(() => {})
  else void nav.clearAppBadge?.().catch(() => {})
}

export function ParentNotifications({ initialData }: { initialData: NotificationData }) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [message, setMessage] = useState("")
  const [isPending, startTransition] = useTransition()

  const refresh = useCallback(async () => {
    try {
      const next = await getParentNotificationData()
      setData(next)
    } catch {
      // Keep the last known notification state if the network briefly fails.
    }
  }, [])

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => console.error("서비스 워커 등록 실패:", error))
    }
    updateAppBadge(data.unreadCount)
  }, [data.unreadCount])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, 30000)
    const onVisible = () => { if (document.visibilityState === "visible") void refresh() }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [refresh])

  async function enablePush() {
    setMessage("")
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setMessage("이 브라우저는 푸시 알림을 지원하지 않습니다. 앱 내부 알림은 계속 사용할 수 있어요.")
      return
    }
    try {
      const permission = await Notification.requestPermission()
      if (permission !== "granted") {
        setMessage("브라우저 알림 권한을 허용해야 푸시 알림을 받을 수 있어요.")
        return
      }
      const publicKey = await getPushPublicKey()
      if (!publicKey) {
        setMessage("푸시 알림 서버 설정이 아직 완료되지 않았습니다.")
        return
      }
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(publicKey) as BufferSource,
      })
      const json = subscription.toJSON()
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) throw new Error("브라우저 구독 정보를 읽지 못했습니다.")
      await saveParentPushSubscription({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } })
      const preferences = { ...data.preferences, pushEnabled: true }
      await saveParentNotificationPreferences(preferences)
      setData((current) => ({ ...current, preferences, hasPushSubscription: true }))
      setMessage("푸시 알림을 켰어요. 새 알림이 오면 기기에서도 알려드릴게요.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "푸시 알림을 설정하지 못했습니다.")
    }
  }

  async function disablePush() {
    setMessage("")
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await removeParentPushSubscription(subscription.endpoint)
        await subscription.unsubscribe()
      }
      const preferences = { ...data.preferences, pushEnabled: false }
      await saveParentNotificationPreferences(preferences)
      setData((current) => ({ ...current, preferences, hasPushSubscription: false }))
      setMessage("푸시 알림을 껐어요. 앱 내부 알림함은 계속 사용할 수 있습니다.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "푸시 알림을 끄지 못했습니다.")
    }
  }

  function changePreference(key: keyof Preferences, value: boolean) {
    const preferences = { ...data.preferences, [key]: value }
    setData((current) => ({ ...current, preferences }))
    startTransition(async () => {
      try {
        await saveParentNotificationPreferences(preferences)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "알림 설정을 저장하지 못했습니다.")
        void refresh()
      }
    })
  }

  async function openNotification(item: NotificationItem) {
    if (!item.readAt) {
      await markParentNotificationRead(item.id)
      setData((current) => ({
        ...current,
        unreadCount: Math.max(0, current.unreadCount - 1),
        notifications: current.notifications.map((notification) =>
          notification.id === item.id ? { ...notification, readAt: new Date() } : notification,
        ),
      }))
    }
    router.push(item.href || "/parent")
  }

  async function deleteReadNotification(id: string) {
    try {
      await deleteParentNotification(id)
      setData((current) => ({ ...current, notifications: current.notifications.filter((item) => item.id !== id) }))
      setMessage("읽은 알림을 삭제했어요.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "알림을 삭제하지 못했습니다.")
    }
  }

  async function deleteAllRead() {
    try {
      await deleteAllReadParentNotifications()
      setData((current) => ({ ...current, notifications: current.notifications.filter((item) => !item.readAt) }))
      setMessage("읽은 알림을 모두 삭제했어요.")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "읽은 알림을 삭제하지 못했습니다.")
    }
  }

  async function markAllRead() {
    await markAllParentNotificationsRead()
    setData((current) => ({
      ...current,
      unreadCount: 0,
      notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? new Date() })),
    }))
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-label="부모 알림함">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex size-9 items-center justify-center rounded-full bg-muted">
            <span aria-hidden="true">🔔</span>
            {data.unreadCount > 0 && <span className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{data.unreadCount > 99 ? "99+" : data.unreadCount}</span>}
          </span>
          <div><h2 className="font-bold">알림함</h2><p className="text-xs text-muted-foreground">확인하지 않은 알림 {data.unreadCount}개</p></div>
        </div>
        <div className="flex items-center gap-3">
          {data.unreadCount > 0 && <button onClick={markAllRead} className="text-xs font-semibold text-muted-foreground underline underline-offset-2">모두 읽음</button>}
          {data.notifications.some((item) => item.readAt) && <button onClick={() => void deleteAllRead()} className="text-xs font-semibold text-red-600 underline underline-offset-2">읽은 알림 모두 삭제</button>}
        </div>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto">
        {data.notifications.length === 0 ? (
          <p className="rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">새로운 알림이 없습니다.</p>
        ) : data.notifications.map((item) => (
          <div key={item.id} className={`flex items-start gap-2 rounded-xl border p-2 ${item.readAt ? "border-border bg-background" : "border-blue-200 bg-blue-50/70"}`}>
            <button onClick={() => void openNotification(item)} className="min-w-0 flex-1 p-1 text-left">
              <span className="flex items-start gap-2">
                {!item.readAt && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-600" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{item.message}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString("ko-KR")}</span>
                </span>
              </span>
            </button>
            {item.readAt && <button type="button" onClick={() => void deleteReadNotification(item.id)} aria-label="읽은 알림 삭제" className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-red-600">삭제</button>}
          </div>
        ))}
      </div>

      <details className="border-t border-border pt-3">
        <summary className="cursor-pointer text-sm font-semibold">알림 및 푸시 설정</summary>
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/60 p-3">
            <div><p className="text-sm font-semibold">기기 푸시 알림</p><p className="text-xs text-muted-foreground">앱을 닫아도 알림 받기</p></div>
            {data.hasPushSubscription && data.preferences.pushEnabled
              ? <button onClick={() => void disablePush()} className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold">끄기</button>
              : <button onClick={() => void enablePush()} className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background">켜기</button>}
          </div>
          <div className="space-y-2">
            {([
              ["couponIssued", "쿠폰 발행"],
              ["couponUseRequested", "쿠폰 사용 요청"],
              ["penaltyIssued", "벌칙 발행"],
              ["penaltyCompleted", "벌칙 완료 요청"],
              ["deviceRegistered", "자녀 기기 등록"],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-3 text-sm">
                <span>{label}</span>
                <input type="checkbox" checked={data.preferences[key]} disabled={isPending} onChange={(event) => changePreference(key, event.target.checked)} className="size-4 accent-foreground" />
              </label>
            ))}
          </div>
          {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
        </div>
      </details>
    </section>
  )
}
