import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * WAL mode. The migration `20260806002721_enable_wal_mode` flips the DB's
 * journal_mode to WAL (a persistent file-level property), and lib/db exports
 * ensureWalMode() to re-assert it after a restore from a DELETE-mode backup.
 *
 * These tests verify:
 *   1. the migration SQL contains the PRAGMA statement (guards against
 *      accidental deletion);
 *   2. ensureWalMode() flips a DELETE-mode DB to WAL on disk;
 *   3. WAL persists for new connections after the switch.
 */

const tmpDir = mkdtempSync(join(tmpdir(), 'idrl-wal-'))
const dbPath = join(tmpDir, 'db.sqlite')

beforeAll(() => {
  // Start the temp DB in the default DELETE journal mode.
  const seed = new Database(dbPath)
  seed.pragma('journal_mode=DELETE')
  seed.close()
})

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('WAL migration', () => {
  it('contains a journal_mode=WAL pragma', () => {
    const sqlPath = join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260806002721_enable_wal_mode',
      'migration.sql',
    )
    expect(existsSync(sqlPath)).toBe(true)
    const sql = readFileSync(sqlPath, 'utf8')
    expect(sql).toMatch(/PRAGMA\s+journal_mode\s*=\s*WAL/i)
  })
})

describe('ensureWalMode', () => {
  it('switches a DELETE-mode DB to WAL on disk', async () => {
    // Sanity: starts in DELETE.
    let db = new Database(dbPath, { readonly: true })
    expect(db.pragma('journal_mode', { simple: true })).toBe('delete')
    db.close()

    // ensureWalMode reads DATABASE_URL to find the file. Point it at our temp DB.
    process.env.DATABASE_URL = `file:${dbPath}`
    const { ensureWalMode } = await import('@/lib/db')
    const result = ensureWalMode()
    expect(result).toBe('wal')

    // A fresh read-only connection now observes WAL (file-level persistence).
    db = new Database(dbPath, { readonly: true })
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    db.close()
  })

  it('is idempotent — calling again on an already-WAL db keeps WAL', async () => {
    const { ensureWalMode } = await import('@/lib/db')
    expect(ensureWalMode()).toBe('wal')
    const db = new Database(dbPath, { readonly: true })
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    db.close()
  })
})
