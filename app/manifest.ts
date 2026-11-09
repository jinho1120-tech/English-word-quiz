import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "영단어 마스터 매니저", short_name: "영단어 마스터 매니저",
    description: "가족의 영어 단어 학습과 자녀의 학습 활동을 관리하는 앱",
    start_url: "/", scope: "/", display: "standalone", display_override: ["standalone", "minimal-ui"],
    background_color: "#f8faf9", theme_color: "#0f766e", lang: "ko",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" }],
  }
}
