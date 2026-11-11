import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "영단어 마스터",
  applicationName: "영단어 마스터",
  manifest: "/child/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/child-rounded.svg", type: "image/svg+xml" }],
    shortcut: ["/icons/child-rounded.svg"],
    apple: [{ url: "/icons/child-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "영단어 마스터" },
}
export default function ChildLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
