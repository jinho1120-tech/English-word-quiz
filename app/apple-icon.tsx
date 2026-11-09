import { ImageResponse } from "next/og"

export const runtime = "edge"
export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 40, background: "#2563eb" }}>
      <div style={{ width: 112, height: 120, display: "flex", flexDirection: "column", justifyContent: "center", gap: 11, padding: 15, borderRadius: 13, background: "white", position: "relative" }}>
        <div style={{ height: 7, width: 80, borderRadius: 7, background: "#2563eb" }} />
        <div style={{ height: 7, width: 80, borderRadius: 7, background: "#2563eb" }} />
        <div style={{ height: 7, width: 52, borderRadius: 7, background: "#2563eb" }} />
        <div style={{ position: "absolute", right: 8, bottom: 8, width: 34, height: 34, borderRadius: 17, display: "flex", alignItems: "center", justifyContent: "center", background: "#16a34a", color: "white", fontSize: 24, fontWeight: 900 }}>✓</div>
      </div>
    </div>,
    { ...size },
  )
}
