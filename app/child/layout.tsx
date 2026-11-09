import type { Metadata } from "next"

export const metadata: Metadata = {
  manifest: "/child/manifest.webmanifest",
}

export default function ChildLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children
}
