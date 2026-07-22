import fs from 'node:fs'
import path from 'node:path'

export interface ChangelogEntry {
  /** e.g. "v0.1.1" */
  version: string
  /** e.g. "2026-07-21" (empty string if absent) */
  date: string
  /** Raw markdown body of this version's section. */
  body: string
}

const HEADER_RE = /^## \[(v[^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/

/**
 * Parse CHANGELOG.md (Keep a Changelog format) into per-version entries.
 * Server-only — reads from the repo checkout at build/runtime cwd.
 * Returns [] when the file is missing so the page can show an empty state.
 */
export function readChangelog(): ChangelogEntry[] {
  const file = path.join(process.cwd(), 'CHANGELOG.md')
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return []
  }
  return parseChangelog(text)
}

/** Pure parser, split out for testing. Lines before the first version
 * header (title, intro) are skipped. */
export function parseChangelog(text: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null
  for (const line of text.split('\n')) {
    const m = HEADER_RE.exec(line)
    if (m) {
      current = { version: m[1], date: m[2] ?? '', body: '' }
      entries.push(current)
    } else if (current) {
      current.body += line + '\n'
    }
  }
  for (const e of entries) e.body = e.body.trim()
  return entries
}
