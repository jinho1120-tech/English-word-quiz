import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "영단어 마스터 매니저", description: "가족의 영어 단어 학습과 자녀의 학습 활동을 관리해요.",
  applicationName: "영단어 마스터 매니저", manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon", type: "image/png" }], apple: [{ url: "/apple-icon", type: "image/png" }] },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "마스터 매니저" },
  formatDetection: { telephone: false },
}
export const viewport: Viewport = { colorScheme: "light", themeColor: "#0f766e", width: "device-width", initialScale: 1, viewportFit: "cover" }
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body className="antialiased">{children}{process.env.NODE_ENV === "production" && <Analytics />}</body></html>
}
