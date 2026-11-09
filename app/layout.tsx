import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "영단어 마스터 매니저",
  description: "가족의 영어 단어 학습과 자녀의 학습 활동을 관리해요.",
  applicationName: "영단어 마스터 매니저",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/parent-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/parent-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/icons/parent-icon-192.png"],
    apple: [{ url: "/icons/parent-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "영단어 마스터 매니저" },
  formatDetection: { telephone: false },
}
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: "#1675d1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
}
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body className="antialiased">{children}{process.env.NODE_ENV === "production" && <Analytics />}</body></html>
}
