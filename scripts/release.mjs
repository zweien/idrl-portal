#!/usr/bin/env node
/**
 * 固化发版流程：pnpm release <x.y.z> [--yes]
 *
 * 1. 前置校验：master 分支、工作区干净、与 origin/master 同步、tag 未存在
 * 2. 质量门：tsc --noEmit + vitest
 * 3. bump package.json version（版本号唯一来源）
 * 4. 从上个 tag 到 HEAD 的 commit 按 Conventional Commits 分组，生成
 *    CHANGELOG.md 条目草稿（Keep a Changelog 格式，插在首个版本条目之前）
 * 5. 非 --yes 时打开 $EDITOR 让你润色草稿，回车确认后继续
 * 6. commit + tag + push + gh release create（触发 Deploy to VPS 自动部署）
 */

import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import readline from 'node:readline'

const args = process.argv.slice(2)
const yes = args.includes('--yes')
const version = args.find(a => !a.startsWith('--'))

if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error('用法: pnpm release <x.y.z> [--yes]   例: pnpm release 0.2.0')
  process.exit(1)
}
const tag = `v${version}`

const run = (cmd, opts = {}) =>
  execSync(cmd, { encoding: 'utf8', stdio: opts.quiet ? 'pipe' : 'inherit', ...opts }).trim()
const runOut = cmd => execSync(cmd, { encoding: 'utf8' }).trim()

// ── 1. 前置校验 ──────────────────────────────────────────────
const branch = runOut('git rev-parse --abbrev-ref HEAD')
if (branch !== 'master') fail(`必须在 master 分支发版（当前: ${branch}）`)
if (runOut('git status --porcelain')) fail('工作区有未提交改动，请先提交或 stash')
run('git fetch origin --tags', { quiet: true })
if (runOut('git rev-parse HEAD') !== runOut('git rev-parse origin/master'))
  fail('本地 master 与 origin/master 不同步，请先 git pull/push')
if (runOut(`git tag -l ${tag}`)) fail(`tag ${tag} 已存在`)
if (fs.readFileSync('CHANGELOG.md', 'utf8').includes(`## [${tag}]`))
  fail(`CHANGELOG.md 已存在 ${tag} 条目`)

const lastTag = runOut('git tag --sort=-v:refname | head -1') || ''
const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
const commits = runOut(`git log ${range} --pretty=format:%s`).split('\n').filter(Boolean)
if (!commits.length) fail(`${range} 没有新 commit，无需发版`)
console.log(`\n上个版本: ${lastTag || '(首个)'}\n本版本:   ${tag}\ncommits:  ${commits.length} 条\n`)

// ── 2. 质量门 ────────────────────────────────────────────────
console.log('▶ tsc --noEmit')
run('pnpm exec tsc --noEmit')
console.log('▶ vitest')
run('pnpm test')

// ── 3. bump package.json ─────────────────────────────────────
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
pkg.version = version
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n')

// ── 4. 生成 CHANGELOG 草稿 ───────────────────────────────────
const GROUPS = [
  [/^feat(\(.+\))?!?:/, '新增'],
  [/^fix(\(.+\))?!?:/, '修复'],
  [/^perf(\(.+\))?!?:/, '优化'],
  [/.*/, '其他'],
]
const grouped = new Map(GROUPS.map(([, label]) => [label, []]))
for (const c of commits) {
  if (/^chore\(release\)/.test(c)) continue // 跳过上一个发版 commit 本身
  const label = GROUPS.find(([re]) => re.test(c))[1]
  grouped.get(label).push(`- ${c}`)
}
const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD 本地日期
let section = `## [${tag}] - ${today}\n`
for (const [, label] of GROUPS) {
  const items = grouped.get(label)
  if (items.length) section += `\n### ${label}\n\n${items.join('\n')}\n`
}

const changelog = fs.readFileSync('CHANGELOG.md', 'utf8')
const firstEntry = changelog.indexOf('## [')
if (firstEntry === -1) fail('CHANGELOG.md 中找不到任何 "## [" 版本条目')
fs.writeFileSync(
  'CHANGELOG.md',
  changelog.slice(0, firstEntry) + section + '\n' + changelog.slice(firstEntry),
)
console.log('\n──────── CHANGELOG 草稿 ────────\n' + section + '────────────────────────────────\n')

// ── 5. 润色确认 ──────────────────────────────────────────────
if (!yes && process.stdin.isTTY) {
  const editor = process.env.EDITOR
  if (editor) spawnSync(editor, ['CHANGELOG.md'], { stdio: 'inherit' })
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  await new Promise(res => rl.question('确认 CHANGELOG 后按回车继续（Ctrl+C 取消）…', res))
  rl.close()
}

// ── 6. commit + tag + release ────────────────────────────────
run(`git add package.json CHANGELOG.md`)
run(`git commit -m "chore(release): ${tag}"`)
run(`git tag -a ${tag} -m "Release ${tag}"`)
run('git push origin master')
run(`git push origin ${tag}`)

const notes = section.replace(`## [${tag}]`, '').trim()
fs.writeFileSync('.release-notes.tmp.md', notes)
try {
  run(`gh release create ${tag} --title "${tag}" --notes-file .release-notes.tmp.md`)
} finally {
  fs.unlinkSync('.release-notes.tmp.md')
}

console.log(`\n✅ ${tag} 已发布，Deploy to VPS workflow 已触发：`)
console.log('   gh run watch $(gh run list --workflow=deploy-vps.yml --limit 1 --json databaseId -q ".[0].databaseId")')

function fail(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}
