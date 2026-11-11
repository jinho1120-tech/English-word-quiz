import type { Metadata } from "next"
import { PwaInstallGuide } from "@/components/pwa-install-guide"

export const metadata: Metadata = {
  title: "슈퍼 관리자 | 영단어 마스터 운영센터",
  applicationName: "영단어 마스터 운영센터",
  manifest: "/super-admin/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/super-admin-icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icons/super-admin-icon.svg"],
    apple: [{ url: "/icons/super-admin-icon.svg", sizes: "any", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "운영센터",
  },
}

export default function SuperAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 pt-4">
        <PwaInstallGuide title="슈퍼 관리자 앱을 홈 화면에 추가하기" />
      </div>
      {children}
    </>
  )
}
