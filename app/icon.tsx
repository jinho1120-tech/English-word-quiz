import { ImageResponse } from "next/og"

export const runtime = "edge"
export const size = { width: 512, height: 512 }
export const contentType = "image/png"
export default function Icon() {
  return new ImageResponse(<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="bg" x2="1" y2="1"><stop stopColor="#fffdf3"/><stop offset=".55" stopColor="#e5f5ed"/><stop offset="1" stopColor="#83d4c7"/></linearGradient><linearGradient id="teal" x2="0" y2="1"><stop stopColor="#147f83"/><stop offset="1" stopColor="#07536a"/></linearGradient><linearGradient id="gold" x2="1" y2="1"><stop stopColor="#ffe28a"/><stop offset="1" stopColor="#e9a92f"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#bg)"/><path d="M66 224a190 190 0 0 1 380 0" fill="none" stroke="#eab33d" strokeWidth="13" strokeLinecap="round"/><path d="m256 91 12 25 27 4-20 19 5 27-24-13-24 13 5-27-20-19 27-4z" fill="url(#gold)"/><circle cx="160" cy="211" r="43" fill="url(#teal)"/><circle cx="352" cy="211" r="43" fill="url(#teal)"/><circle cx="256" cy="251" r="39" fill="url(#gold)"/><path d="M82 359c7-67 40-105 78-105s72 38 79 105M273 359c7-67 41-105 79-105s71 38 78 105" fill="url(#teal)"/><path d="M174 390c8-74 39-116 82-116s74 42 82 116" fill="url(#gold)"/><path d="M54 342c77-22 143-15 202 48 59-63 125-70 202-48l-37 65c-67-13-119-2-165 47-46-49-98-60-165-47z" fill="#fff" stroke="#f4ead8" strokeWidth="7" strokeLinejoin="round"/><path d="M256 390v64" stroke="#e8d9c1" strokeWidth="5" strokeLinecap="round"/></svg>,{...size})
}
