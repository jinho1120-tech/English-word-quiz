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
  let head = 0
  let tail = 0

  const add = (index) => {
    if (visited[index]) return
    const offset = index * 4
    if (!isEdgeWhite(data, offset)) return
    visited[index] = 1
    queue[tail++] = index
  }

  for (let x = 0; x < width; x += 1) {
    add(x)
    add((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    add(y * width)
    add(y * width + width - 1)
  }

  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = Math.floor(index / width)
    data[index * 4 + 3] = 0

    if (x > 0) add(index - 1)
    if (x + 1 < width) add(index + 1)
    if (y > 0) add(index - width)
    if (y + 1 < height) add(index + width)
  }

  return tail
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
