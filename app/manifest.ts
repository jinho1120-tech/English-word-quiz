import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "우리 가족 단어장",
    short_name: "가족 단어장",
    description: "우리 가족이 함께 사용하는 영어 단어 학습 앱",
    start_url: "/",
    scope: "/",
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
