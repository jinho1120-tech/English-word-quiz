"use client"

import { useEffect, useState } from "react"

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>
}

export function PwaInstallGuide() {
  const [platform, setPlatform] = useState<"ios" | "android" | "other">("other")
  const [isStandalone, setIsStandalone] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [installMessage, setInstallMessage] = useState("")

  useEffect(() => {
    const ua = navigator.userAgent
    const isIos = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    setPlatform(isIos ? "ios" : /Android/i.test(ua) ? "android" : "other")
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
    setIsStandalone(standalone)

    const handleBeforeInstall = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener("beforeinstallprompt", handleBeforeInstall)
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall)
  }, [])

  async function install() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    setInstallMessage(choice.outcome === "accepted" ? "홈 화면에 추가했어요. 다음부터 아이콘으로 실행하세요!" : "원할 때 다시 설치할 수 있어요.")
    setInstallPrompt(null)
  }

  // 홈 화면에 설치된 앱에서는 별도의 실행 안내 상자를 표시하지 않습니다.
  if (isStandalone) return null

  return (
    <details className="rounded-xl border border-border bg-muted/30 p-3 text-left">
      <summary className="cursor-pointer font-semibold">📲 홈 화면에 아이콘 추가하기</summary>
      <div className="mt-3 space-y-3 text-sm">
        {platform === "ios" ? (
          <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
            <li><strong className="text-foreground">Safari</strong>로 이 페이지를 열어주세요.</li>
            <li>화면 아래쪽의 <strong className="text-foreground">공유 버튼(□↑)</strong>을 누르세요.</li>
            <li>메뉴에서 <strong className="text-foreground">홈 화면에 추가</strong>를 선택하세요.</li>
            <li>오른쪽 위 <strong className="text-foreground">추가</strong>를 누르면 완료!</li>
          </ol>
        ) : platform === "android" ? (
          <>
            {installPrompt ? (
              <button onClick={install} className="w-full rounded-lg bg-foreground px-3 py-2.5 font-bold text-background">앱 설치하기</button>
            ) : null}
            <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
              <li>Chrome 오른쪽 위 <strong className="text-foreground">⋮ 메뉴</strong>를 누르세요.</li>
              <li><strong className="text-foreground">앱 설치</strong> 또는 <strong className="text-foreground">홈 화면에 추가</strong>를 선택하세요.</li>
              <li>설치 또는 추가를 확인하면 완료!</li>
            </ol>
          </>
        ) : (
          <p className="text-muted-foreground">브라우저 메뉴에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택하세요. 아이폰·아이패드는 Safari, 안드로이드는 Chrome 사용을 권장합니다.</p>
        )}
        {installMessage && <p role="status" className="text-xs text-muted-foreground">{installMessage}</p>}
        <p className="text-xs text-muted-foreground">아이콘 추가는 기기에서 한 번만 직접 승인하면 됩니다. 이후에는 주소창 없이 앱처럼 실행돼요.</p>
      </div>
    </details>
  )
}
