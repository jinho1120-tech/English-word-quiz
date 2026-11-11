import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/parent",
    name: "영단어 마스터 매니저",
    short_name: "영단어 마스터 매니저",
    description: "가족의 영어 단어 학습과 자녀의 학습 활동을 관리하는 앱",
    start_url: "/parent",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#f8faf9",
    theme_color: "#1675d1",
    lang: "ko",
    icons: [
      { src: "/icons/parent-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icons/parent-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  }
}
