import { describe, it, expect } from 'vitest'
import { parseChangelog } from '@/lib/changelog'

const SAMPLE = `# 更新日志

intro text

## [v0.2.0] - 2026-07-22

### 新增

- 功能 A
- 功能 B

### 修复

- 修复 C

## [v0.1.0] - 2026-07-21

### 新增

- 首个版本
`

describe('parseChangelog', () => {
  it('parses version headers with dates and bodies', () => {
    const entries = parseChangelog(SAMPLE)
    expect(entries).toHaveLength(2)
    expect(entries[0].version).toBe('v0.2.0')
    expect(entries[0].date).toBe('2026-07-22')
    expect(entries[0].body).toContain('功能 A')
    expect(entries[1].version).toBe('v0.1.0')
  })

  it('skips content before the first version header', () => {
    const entries = parseChangelog(SAMPLE)
    expect(entries[0].body).not.toContain('intro text')
  })

  it('handles headers without a date', () => {
    const entries = parseChangelog('## [v1.0.0]\n\n- x\n')
    expect(entries[0].date).toBe('')
  })

  it('returns [] for empty input', () => {
    expect(parseChangelog('')).toEqual([])
    expect(parseChangelog('# 更新日志\n\nno versions yet\n')).toEqual([])
  })

  it('real CHANGELOG.md parses to at least v0.1.0/v0.1.1', async () => {
    const { readChangelog } = await import('@/lib/changelog')
    const entries = readChangelog()
    expect(entries.map(e => e.version)).toEqual(expect.arrayContaining(['v0.1.0', 'v0.1.1']))
  })
})
