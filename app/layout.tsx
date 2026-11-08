import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "영어 단어 학습",
  description: "나만의 단어장을 만들고 퀴즈와 발표 연습으로 영어를 공부해요.",
  generator: "Next.js",
}

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ffffff",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
