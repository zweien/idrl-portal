// Verify the color-mix compatibility fix:
// 1) No leftover alpha-modifier classes in app/components, except the
//    Tailwind default palette (which carries hex-alpha fallbacks).
// 2) Every --x-rgb channel triplet matches the tokens.json v0.2.1 hex
//    value it must mirror (solid var and triplet stay in sync).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function walk(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (/\.tsx$/.test(e)) acc.push(full)
  }
  return acc
}

// 1) completeness（默认调色板有 hex-alpha 回退，白名单豁免）
const whitelist = /^(text-white|bg-black|text-black|border-white|ring-white)\b/
const leftovers = []
for (const f of walk('app').concat(walk('components'))) {
  const s = readFileSync(f, 'utf8')
  const re = /(?:bg|text|border|ring|divide|fill|stroke)-(?:[a-z-]+)\/(\d{1,3})(?![\w-])/g
  let m
  while ((m = re.exec(s))) {
    if (whitelist.test(m[0])) continue
    leftovers.push(`${f} :: ${m[0]}`)
  }
}
console.log('leftover non-whitelist alpha classes:', leftovers.length)
leftovers.slice(0, 8).forEach(l => console.log(' ', l))

// 2) every --x-rgb channel triplet matches tokens.json v0.2.1 hex values
const tokens = JSON.parse(readFileSync('public/brand/tokens.json', 'utf8'))
const css = readFileSync('app/globals.css', 'utf8')
function tripletBlock(block) {
  const out = {}
  const start = css.indexOf(block)
  const seg = css.slice(start, css.indexOf('}', start))
  const re = /--([a-z0-9-]+)-rgb:\s*([0-9 ]+);/g
  let mm
  while ((mm = re.exec(seg))) out[mm[1]] = mm[2].trim()
  return out
}
// tokens.json key → -rgb 变量名（仅列实色同名项）
const keyMap = {
  background: 'background', foreground: 'foreground', card: 'card',
  popover: 'popover', primary: 'primary', secondary: 'secondary',
  muted: 'muted', 'mutedForeground': 'muted-foreground',
  accent: 'accent', destructive: 'destructive', border: 'border',
  input: 'input', ring: 'ring', success: 'success', warning: 'warning',
  chart1: 'chart-1', chart2: 'chart-2', chart3: 'chart-3',
  chart4: 'chart-4', chart5: 'chart-5',
}
let bad = 0, checked = 0
for (const theme of ['light', 'dark']) {
  const rgb = tripletBlock(theme === 'light' ? '/* VI light 主题语义值' : '.dark {')
  const t = tokens[theme]
  for (const [key, varName] of Object.entries(keyMap)) {
    const hex = t[key]
    if (typeof hex !== 'string' || !hex.startsWith('#') || hex.length !== 7) continue
    const expect = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(' ')
    const actual = rgb[varName]
    checked++
    if (actual !== expect) {
      bad++
      console.log('MISMATCH', theme, key, 'expect', expect, 'got', actual)
    }
  }
}
console.log('channel triplets checked:', checked, 'mismatches:', bad)
if (leftovers.length || bad) process.exit(1)
console.log('COLOR TOKENS OK')
