import fs from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

// Make only edge-connected near-white padding transparent. White details inside
// the illustration (faces, clouds, snow) remain untouched.
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

function isEdgeWhite(data, offset) {
  const alpha = data[offset + 3]
  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  return alpha > 0 && red >= 238 && green >= 238 && blue >= 238 &&
    Math.max(red, green, blue) - Math.min(red, green, blue) <= 18
}

function clearConnectedWhiteBorder(data, width, height) {
  const total = width * height
  const visited = new Uint8Array(total)
  const queue = new Uint32Array(total)
  let cleared = 0

  // The source artwork has white corner padding from its old rounded frame.
  // Limit flood fill to corner zones so white snow/cloud details elsewhere stay.
  const marginX = Math.ceil(width * 0.18)
  const marginY = Math.ceil(height * 0.18)
  const zones = [
    { x0: 0, x1: marginX, y0: 0, y1: marginY },
    { x0: width - marginX, x1: width, y0: 0, y1: marginY },
    { x0: 0, x1: marginX, y0: height - marginY, y1: height },
    { x0: width - marginX, x1: width, y0: height - marginY, y1: height },
  ]

  for (const zone of zones) {
    let head = 0
    let tail = 0
    const add = (x, y) => {
      if (x < zone.x0 || x >= zone.x1 || y < zone.y0 || y >= zone.y1) return
      const index = y * width + x
      if (visited[index] || !isEdgeWhite(data, index * 4)) return
      visited[index] = 1
      queue[tail++] = index
    }

    for (let offset = 0; offset < 16; offset += 1) {
      const left = zone.x0
      const right = zone.x1 - 1
      const top = zone.y0
      const bottom = zone.y1 - 1
      add(Math.min(left + offset, right), top)
      add(Math.max(right - offset, left), top)
      add(Math.min(left + offset, right), bottom)
      add(Math.max(right - offset, left), bottom)
      add(left, Math.min(top + offset, bottom))
      add(left, Math.max(bottom - offset, top))
      add(right, Math.min(top + offset, bottom))
      add(right, Math.max(bottom - offset, top))
    }

    while (head < tail) {
      const index = queue[head++]
      const x = index % width
      const y = Math.floor(index / width)
      data[index * 4 + 3] = 0
      cleared += 1
      add(x - 1, y)
      add(x + 1, y)
      add(x, y - 1)
      add(x, y + 1)
    }
  }

  return cleared
}

const iconDir = path.join(process.cwd(), "public", "icons")
for (const file of iconFiles) {
  const filePath = path.join(iconDir, file)
  const { data, info } = await sharp(await fs.readFile(filePath))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const cleared = clearConnectedWhiteBorder(data, info.width, info.height)
  const output = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer()

  await fs.writeFile(filePath, output)
  console.log(`Prepared ${file}: ${info.width}x${info.height}, transparent edge pixels ${cleared}`)
}
