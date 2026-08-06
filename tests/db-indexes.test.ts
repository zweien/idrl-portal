import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Guard the hot-column indexes: assert both the Prisma schema declares them
 * (so `prisma migrate dev` keeps them in sync) and the migration SQL creates
 * them (so `prisma migrate deploy` on the VPS applies them). A future schema
 * edit that drops these would silently regress the sync N+1 and list-scan
 * performance.
 */
const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8')
const migrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260806010909_add_hot_column_indexes',
  'migration.sql',
)

const expected: { model: string; index: string }[] = [
  { model: 'NewsItem', index: 'status' },
  { model: 'NewsItem', index: 'categoryId' },
  { model: 'NewsItem', index: 'pinned' },
  { model: 'Resource', index: 'categoryId' },
  { model: 'Resource', index: 'accessLevel' },
  { model: 'Resource', index: 'status' },
  { model: 'Person', index: 'dingUserId' },
  { model: 'Person', index: 'status' },
]

describe('hot-column indexes', () => {
  it('migration file exists', () => {
    expect(existsSync(migrationPath)).toBe(true)
  })

  for (const { model, index } of expected) {
    it(`schema declares @@index([${index}]) on ${model}`, () => {
      // Extract the model block: from `model X {` to the next `}` at column 0
      // (Prisma closes models at the start of a line). Field comments can hold
      // a `}` (e.g. "{ where: { dingUserId } }"), so a naive indexOf('}')
      // would stop inside a comment — use a line-anchored search instead.
      const modelStart = schema.indexOf(`model ${model} {`)
      expect(modelStart, `${model} model not found`).toBeGreaterThan(-1)
      const tail = schema.slice(modelStart)
      const endIdx = tail.search(/\n\}/)
      expect(endIdx, `${model} model block not closed`).toBeGreaterThan(-1)
      const block = tail.slice(0, endIdx)
      expect(block).toMatch(new RegExp(`@@index\\(\\[${index}\\]\\)`))
    })

    it(`migration creates an index for ${model}.${index}`, () => {
      const sql = readFileSync(migrationPath, 'utf8')
      expect(sql).toMatch(new RegExp(`CREATE INDEX.*${model}_${index}_idx`, 'i'))
    })
  }
})
