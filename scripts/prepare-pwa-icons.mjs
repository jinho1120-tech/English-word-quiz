import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const iconFiles = [
  "parent-icon-1024.png",
  "parent-icon-512.png",
  "parent-icon-192.png",
  "parent-icon-180.png",
  "child-icon-1024.png",
  "child-icon-512.png",
  "child-icon-192.png",
  "child-icon-180.png",
]

// The source PNGs contain a rounded-square illustration on a white square
// canvas. Extend the artwork's own corner background into that white padding.
// Reflecting across the rounded boundary keeps the adjacent background colors
// and gradients continuous; it does not create transparency or round the PNG.
function extendCornerBackground(data, width, height) {
  const channels = 4
  const radius = Math.round(Math.min(width, height) * 0.172)
  const corners = [
    { cx: radius, cy: radius, x0: 0, x1: radius, y0: 0, y1: radius },
    { cx: width - radius - 1, cy: radius, x0: width - radius, x1: width, y0: 0, y1: radius },
    { cx: radius, cy: height - radius - 1, x0: 0, x1: radius, y0: height - radius, y1: height },
    { cx: width - radius - 1, cy: height - radius - 1, x0: width - radius, x1: width, y0: height - radius, y1: height },
  ]

  const sample = (x, y, channel) => {
    const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)))
    const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)))
    const x1 = Math.min(width - 1, x0 + 1)
    const y1 = Math.min(height - 1, y0 + 1)
    const tx = x - Math.floor(x)
    const ty = y - Math.floor(y)
    const a = data[(y0 * width + x0) * channels + channel]
    const b = data[(y0 * width + x1) * channels + channel]
    const c = data[(y1 * width + x0) * channels + channel]
    const d = data[(y1 * width + x1) * channels + channel]
    return Math.round((a * (1 - tx) + b * tx) * (1 - ty) +
      (c * (1 - tx) + d * tx) * ty)
  }

  let filled = 0
  for (const corner of corners) {
    for (let y = corner.y0; y < corner.y1; y += 1) {
      for (let x = corner.x0; x < corner.x1; x += 1) {
        const dx = x - corner.cx
        const dy = y - corner.cy
        const distance = Math.hypot(dx, dy)
        if (distance <= radius) continue

        // Mirror the pixel location across the rounded-square boundary.
        const reflectedDistance = Math.max(0, 2 * radius - distance)
        const scale = distance === 0 ? 0 : reflectedDistance / distance
        const sourceX = corner.cx + dx * scale
        const sourceY = corner.cy + dy * scale
        const offset = (y * width + x) * channels

        for (let channel = 0; channel < 3; channel += 1) {
          data[offset + channel] = sample(sourceX, sourceY, channel)
        }
        data[offset + 3] = 255
        filled += 1
      }
    }
  }
  return filled
}

const iconDir = path.join(process.cwd(), "public", "icons")
for (const file of iconFiles) {
  const filePath = path.join(iconDir, file)
  const { data, info } = await sharp(await fs.readFile(filePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const filled = extendCornerBackground(data, info.width, info.height)
  const output = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer()

  await fs.writeFile(filePath, output)
  console.log(`Extended corner background in ${file}: ${info.width}x${info.height}, filled ${filled} pixels`)
}
