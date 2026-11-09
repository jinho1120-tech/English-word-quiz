import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "영단어 마스터", applicationName: "영단어 마스터", manifest: "/child/manifest.webmanifest",
  icons: { icon: [{ url: "/child/icon", type: "image/png" }], apple: [{ url: "/child/apple-icon", type: "image/png" }] },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "영단어 마스터" },
}
export default function ChildLayout({ children }: Readonly<{ children: React.ReactNode }>) { return children }
