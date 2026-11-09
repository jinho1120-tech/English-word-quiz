import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/child",
    name: "영단어 마스터",
    short_name: "영단어 마스터",
    description: "단어를 배우고 퀴즈로 실력을 키우는 영어 학습 앱",
    start_url: "/child",
    scope: "/child",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#eff8ff",
    theme_color: "#1675d1",
    lang: "ko",
    icons: [
      { src: "/icons/child-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/child-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  }
}
