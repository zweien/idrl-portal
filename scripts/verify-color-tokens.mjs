// Self-verification for the color-mix compatibility fix:
// 1) no leftover alpha-modifier classes in app/components
// 2) every --x-ch channel triplet matches tokens.json v0.2.1 hex values
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

// 1) completeness
const leftovers = []
for (const f of walk('app').concat(walk('components'))) {
  const s = readFileSync(f, 'utf8')
  const re = /(?:bg|text|border|ring|divide|fill|stroke)-(?:[a-z-]+)\/(\d{1,3})(?![\w-])/g
  let m
  while ((m = re.exec(s))) leftovers.push(`${f} :: ${m[0]}`)
}
console.log('leftover alpha-modifier classes:', leftovers.length)
leftovers.slice(0, 8).forEach(l => console.log(' ', l))

// 2) triplet correctness vs tokens.json
const tokens = JSON.parse(readFileSync('public/brand/tokens.json', 'utf8'))
const css = readFileSync('app/globals.css', 'utf8')
function channels(block) {
  const out = {}
  const start = css.indexOf(block)
  const seg = css.slice(start, css.indexOf('}', start))
  const re = /--([a-z0-9-]+)-ch:\s*([0-9 ]+);/g
  let mm
  while ((mm = re.exec(seg))) out[mm[1]] = mm[2].trim()
  return out
}
function hexToRgb(h) {
  return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(' ')
}
let bad = 0, checked = 0
for (const theme of ['light', 'dark']) {
  const ch = channels(theme === 'light' ? ':root {' : '.dark {')
  const t = tokens[theme]
  for (const [name, value] of Object.entries(t)) {
    if (typeof value !== 'string' || !value.startsWith('#') || value.length !== 7) continue
    const expect = hexToRgb(value)
    const actual = ch[name]
    checked++
    if (actual !== expect) {
      bad++
      console.log('MISMATCH', theme, name, 'expect', expect, 'got', actual)
    }
  }
}
console.log('channel triplets checked:', checked, 'mismatches:', bad)
