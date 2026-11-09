import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "영단어 마스터",
  applicationName: "영단어 마스터",
  manifest: "/child/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/child-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/child-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: ["/icons/child-icon-192.png"],
    apple: [{ url: "/icons/child-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "영단어 마스터" },
}
export default function ChildLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
