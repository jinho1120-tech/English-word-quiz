import { ImageResponse } from "next/og"

export const runtime = "edge"
export const size = { width: 512, height: 512 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 112, background: "#2563eb" }}>
      <div style={{ width: 310, height: 330, display: "flex", flexDirection: "column", justifyContent: "center", gap: 30, padding: 42, borderRadius: 34, background: "white", position: "relative" }}>
        <div style={{ height: 20, width: 220, borderRadius: 20, background: "#2563eb" }} />
        <div style={{ height: 20, width: 220, borderRadius: 20, background: "#2563eb" }} />
        <div style={{ height: 20, width: 145, borderRadius: 20, background: "#2563eb" }} />
        <div style={{ position: "absolute", right: 22, bottom: 22, width: 92, height: 92, borderRadius: 46, display: "flex", alignItems: "center", justifyContent: "center", background: "#16a34a", color: "white", fontSize: 66, fontWeight: 900 }}>✓</div>
      </div>
    </div>,
    { ...size },
  )
}
