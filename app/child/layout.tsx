import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "영단어 마스터",
  applicationName: "영단어 마스터",
  manifest: "/child/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icons/child-master.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/child-master.svg", type: "image/svg+xml" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "영단어 마스터",
  },
}

export default function ChildLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
