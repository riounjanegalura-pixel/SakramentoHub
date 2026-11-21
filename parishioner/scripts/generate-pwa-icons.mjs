import sharp from 'sharp'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public')
mkdirSync(outDir, { recursive: true })

function monogramSvg(size) {
  const fontSize = Math.round(size * 0.42)
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#1B2A4A" />
      <text
        x="50%" y="53%"
        text-anchor="middle" dominant-baseline="middle"
        font-family="Georgia, 'Times New Roman', serif"
        font-size="${fontSize}"
        font-weight="700"
        fill="#D4AD63"
      >SH</text>
    </svg>
  `
}

for (const size of [192, 512]) {
  await sharp(Buffer.from(monogramSvg(size))).png().toFile(join(outDir, `pwa-${size}x${size}.png`))
  console.log(`Generated pwa-${size}x${size}.png`)
}
