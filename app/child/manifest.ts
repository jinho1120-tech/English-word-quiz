import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/child",
    name: "우리 가족 단어장 · 자녀 모드",
    short_name: "자녀 단어장",
    description: "자녀가 사용하는 영어 단어 학습 앱",
    start_url: "/child",
    scope: "/child",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "ko",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  }
}
