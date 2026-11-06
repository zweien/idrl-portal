// Regenerate the favicon set from the official IDRL VI assets.
//
// Usage: node scripts/generate-favicons.mjs
//
// Browser favicon: public/brand/logo/favicon.svg (official transparent
// adaptive SVG — follows the browser/OS color scheme). Application icons
// (ICO / PNG / apple-touch / PWA): brand navy #203663 tile + the dedicated
// reverse symbol — never a CSS filter over the color logo. Clear space
// around the symbol ≥ 1/4 of its height. favicon.ico is assembled manually
// (ICO container with embedded PNGs) because sharp has no ICO writer.
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
// sharp is a transitive dependency of next; resolve it from the pnpm store.
let sharp
try {
  sharp = require('sharp')
} catch {
  sharp = require(require('node:path').resolve(
    import.meta.dirname,
    '../node_modules/.pnpm/sharp@0.34.5/node_modules/sharp',
  ))
}

const ROOT = path.resolve(import.meta.dirname, '..')
const PUBLIC = path.join(ROOT, 'public')
const NAVY = '#203663'
// symbol-color-reverse.svg intrinsic viewBox is 226.86025 x 128.8813
const SYMBOL_W = 226.86025
const SYMBOL_H = 128.8813
const SYMBOL = readFileSync(path.join(PUBLIC, 'brand/logo/symbol-color-reverse.svg'))

/** Rasterize the reverse symbol at a given pixel width. */
function symbolPng(width) {
  const density = 72 * (width / SYMBOL_W)
  return sharp(SYMBOL, { density }).png().toBuffer()
}

/** Square navy tile with the symbol centered, clear space = 1/4 symbol height. */
async function tile(size, outName) {
  // Fit: symbol width = size / (1 + 2*pad-ratio-ish) — use clear space of
  // symbol-height/4 on all sides: total w = sw + 2*(sh/4), solve for sw.
  const sh = size / (SYMBOL_W / SYMBOL_H + 0.5)
  const sw = sh * (SYMBOL_W / SYMBOL_H)
  const symbol = await symbolPng(sw)
  await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY },
  })
    .composite([
      {
        input: symbol,
        left: Math.round((size - sw) / 2),
        top: Math.round((size - sh) / 2),
      },
    ])
    .png()
    .toFile(path.join(PUBLIC, outName))
    .then(() => console.log('✓', outName))
}

/** Minimal ICO container embedding PNG images (Vista+ format). */
async function ico(sizes, outName) {
  const pngs = await Promise.all(sizes.map(symbolTilePng))
  async function symbolTilePng(size) {
    const sh = size / (SYMBOL_W / SYMBOL_H + 0.5)
    const sw = sh * (SYMBOL_W / SYMBOL_H)
    const symbol = await symbolPng(sw)
    return sharp({
      create: { width: size, height: size, channels: 4, background: NAVY },
    })
      .composite([
        {
          input: symbol,
          left: Math.round((size - sw) / 2),
          top: Math.round((size - sh) / 2),
        },
      ])
      .png()
      .toBuffer()
  }

  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(sizes.length, 4)

  const entries = []
  let offset = 6 + 16 * sizes.length
  sizes.forEach((size, i) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size >= 256 ? 0 : size, 0) // width
    entry.writeUInt8(size >= 256 ? 0 : size, 1) // height
    entry.writeUInt8(0, 2) // palette
    entry.writeUInt8(0, 3) // reserved
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(pngs[i].length, 8)
    entry.writeUInt32LE(offset, 12)
    offset += pngs[i].length
    entries.push(entry)
  })

  writeFileSync(path.join(PUBLIC, outName), Buffer.concat([header, ...entries, ...pngs]))
  console.log('✓', outName)
}

// Browser favicon: the official transparent adaptive favicon.svg from the VI
// (per VI contract since idrl-vi 8e6d55d: bare transparent canvas, navy block
// switches to navyOnDark via prefers-color-scheme — follows the browser/OS
// theme, not the in-app theme toggle). The navy-tile composition below stays
// for application icons only (ICO / PWA / apple-touch), which need a fixed
// background.
copyFileSync(
  path.join(PUBLIC, 'brand/logo/favicon.svg'),
  path.join(PUBLIC, 'favicon.svg'),
)
console.log('✓ favicon.svg (official adaptive)')

await ico([16, 32, 48], 'favicon.ico')
for (const s of [16, 32, 48, 64]) await tile(s, `favicon-${s}x${s}.png`)
await tile(180, 'apple-touch-icon.png')
await tile(192, 'android-chrome-192x192.png')
await tile(512, 'android-chrome-512x512.png')
// Legacy names kept for site.webmanifest / existing links.
await tile(192, 'favicon-192x192.png')
await tile(512, 'favicon-512x512.png')
await tile(180, 'favicon-180x180.png')
console.log('done')
