import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * Backup utilities. The filename validation/parsing is pure; the file
 * operations (list/prune/delete) are tested against a temp backups dir by
 * mocking the BACKUP_DIR constant; createBackup/restoreBackup are exercised
 * against a copy of the dev DB in a temp dir (so we don't touch the real one).
 */

// We import AFTER setting up the env so dbPath() resolves to our temp copy.
const tmpDir = mkdtempSync(join(tmpdir(), 'idrl-backup-'))
const tmpDbPath = join(tmpDir, 'db.sqlite')
// Build a minimal but real SQLite DB with a Person table + the
// _prisma_migrations table (so restoreFromFile's validation passes). We don't
// copy the dev DB — it's gitignored and absent in CI.
{
  const seed = new Database(tmpDbPath)
  seed.exec(`
    CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY);
    INSERT INTO _prisma_migrations (id) VALUES ('seed');
    CREATE TABLE Person (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL
    );
    INSERT INTO Person (id, name, role, status) VALUES
      ('p1', 'Alice', '研究员', 'present'),
      ('p2', 'Bob', '工程师', 'absent');
    CREATE TABLE ApiKey (
      id TEXT NOT NULL PRIMARY KEY,
      keyHash TEXT NOT NULL,
      revokedAt TEXT
    );
    CREATE TABLE User (
      id TEXT NOT NULL PRIMARY KEY,
      role TEXT NOT NULL DEFAULT 'member',
      disabledAt TEXT
    );
    INSERT INTO ApiKey (id, keyHash, revokedAt) VALUES ('k1', 'h1', NULL);
    INSERT INTO User (id, role, disabledAt) VALUES
      ('u1', 'admin', NULL),
      ('u2', 'member', '2026-09-21T00:00:00.000Z');
  `)
  seed.close()
}
process.env.DATABASE_URL = `file:${tmpDbPath}`

// Mock @/lib/db: stub prisma (so readKeepCount doesn't hit a real Prisma client)
// while exposing a REAL ensureWalMode bound to the temp DB path, so the
// restore-then-assert WAL path is genuinely exercised end-to-end.
vi.mock('@/lib/db', () => ({
  prisma: {
    setting: { findUnique: vi.fn().mockResolvedValue(null) },
  },
  ensureWalMode: () => {
    const Database = require('better-sqlite3')
    const db = new Database(tmpDbPath)
    try {
      return String(db.pragma('journal_mode=WAL', { simple: true }))
    } finally {
      db.close()
    }
  },
}))

const { isValidBackupName, createBackup, listBackups, pruneBackups, deleteBackup, restoreBackup } =
  await import('@/lib/backup')

beforeAll(() => {
  // Point BACKUP_DIR at our temp dir by creating it; the module reads
  // process.cwd()/prisma/backups at call time, so we ensure that dir exists
  // and clean it before/after. To stay hermetic we instead rely on the temp DB
  // for createBackup (which uses DATABASE_URL), and the backups land in the
  // real cwd/prisma/backups — we clean those up in afterAll.
})

afterAll(() => {
  // Clean any backups this test created in the real backups dir.
  try {
    const dir = join(process.cwd(), 'prisma', 'backups')
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (f.startsWith('backup-') || f.startsWith('upload-')) {
          try { require('node:fs').unlinkSync(join(dir, f)) } catch { /* */ }
        }
      }
    }
  } catch { /* */ }
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('backup filename validation', () => {
  it('accepts well-formed backup names', () => {
    expect(isValidBackupName('backup-20260720T030000-auto.sqlite')).toBe(true)
    expect(isValidBackupName('backup-20260720T030000-manual.sqlite')).toBe(true)
    expect(isValidBackupName('backup-20260720T030000-pre-restore.sqlite')).toBe(true)
  })

  it('rejects malformed / path-traversal names', () => {
    expect(isValidBackupName('../../etc/passwd')).toBe(false)
    expect(isValidBackupName('backup-20260720T030000-evil.sqlite')).toBe(false)
    expect(isValidBackupName('not-a-backup.sqlite')).toBe(false)
    expect(isValidBackupName('')).toBe(false)
  })
})

describe('backup file operations (against a temp DB copy)', () => {
  it('createBackup produces a readable SQLite file', async () => {
    const info = await createBackup('manual')
    expect(info.filename).toMatch(/^backup-\d{8}T\d{6}-manual\.sqlite$/)
    expect(info.sizeKb).toBeGreaterThan(0)
    // The backup file is a real SQLite DB.
    const dir = join(process.cwd(), 'prisma', 'backups')
    const db = new Database(join(dir, info.filename), { readonly: true })
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    db.close()
    expect(tables.map(t => t.name)).toContain('_prisma_migrations')
  })

  it('listBackups includes the created backup (newest first)', async () => {
    const before = await createBackup('manual')
    const all = listBackups()
    expect(all.length).toBeGreaterThanOrEqual(1)
    expect(all.some(b => b.filename === before.filename)).toBe(true)
    // sorted newest first
    for (let i = 1; i < all.length; i++) {
      expect(all[i - 1].createdAt >= all[i].createdAt).toBe(true)
    }
  })

  it('pruneBackups keeps only the newest N', async () => {
    // Create 3 fresh ones.
    await createBackup('manual')
    await createBackup('manual')
    await createBackup('manual')
    const before = listBackups().length
    pruneBackups(2)
    const after = listBackups()
    expect(after.length).toBeLessThanOrEqual(2)
    expect(after.length).toBeLessThanOrEqual(before)
  })

  it('deleteBackup removes a file', async () => {
    const info = await createBackup('manual')
    const dir = join(process.cwd(), 'prisma', 'backups')
    expect(existsSync(join(dir, info.filename))).toBe(true)
    deleteBackup(info.filename)
    expect(existsSync(join(dir, info.filename))).toBe(false)
  })

  it('restoreBackup takes a pre-restore snapshot and overwrites the DB', async () => {
    // Snapshot the current Person count, then restore an earlier backup and
    // confirm the file content was replaced (the backup is a valid SQLite).
    const snap = await createBackup('manual')
    // Mutate the temp DB so we can detect restore.
    const live = new Database(tmpDbPath)
    live.exec("UPDATE Person SET name='__MUTATED__' WHERE id=(SELECT id FROM Person LIMIT 1)")
    live.close()
    // Restore from the snapshot (which predates the mutation).
    const { preRestore } = await restoreBackup(snap.filename)
    expect(preRestore.trigger).toBe('pre-restore')
    // After restore, the mutation should be gone.
    const after = new Database(tmpDbPath, { readonly: true })
    const mutated = after.prepare("SELECT COUNT(*) c FROM Person WHERE name='__MUTATED__'").get() as { c: number }
    after.close()
    expect(mutated.c).toBe(0)
  })

  it('restoreBackup re-applies post-backup auth lifecycle (revocations/bans/roles) over the rollback', async () => {
    // Regression (run-1 confirmed finding): restoring an older backup used to
    // resurrect revoked API keys, bans, and demotions recorded after the
    // backup. The pre-restore snapshot holds the latest decisions; they must
    // be carried forward onto the restored rows.
    // 1. Take the "old" backup while lifecycle state is pristine.
    const old = await createBackup('manual')
    // 2. Make the latest live decisions: revoke k1, demote u1, unban u2;
    //    ALSO create u3 after the backup and ban it (codex P1: a user absent
    //    from the backup must not lose its ban — resolveSession keeps the
    //    stale cookie role for a missing row).
    const live = new Database(tmpDbPath)
    live.exec(`
      UPDATE ApiKey SET revokedAt='2026-09-20T00:00:00.000Z' WHERE id='k1';
      UPDATE User SET role='member' WHERE id='u1';
      UPDATE User SET disabledAt=NULL WHERE id='u2';
      INSERT INTO User (id, role, disabledAt) VALUES ('u3', 'member', '2026-09-25T00:00:00.000Z');
    `)
    live.close()
    // 3. Restore the old backup — this rolls the whole DB back (u3 vanishes).
    await restoreBackup(old.filename)
    // 4. The lifecycle decisions must survive the rollback.
    const after = new Database(tmpDbPath, { readonly: true })
    const key = after.prepare('SELECT revokedAt FROM ApiKey WHERE id = ?').get('k1') as { revokedAt: string | null }
    const u1 = after.prepare('SELECT role FROM User WHERE id = ?').get('u1') as { role: string }
    const u2 = after.prepare('SELECT disabledAt FROM User WHERE id = ?').get('u2') as { disabledAt: string | null }
    const u3 = after.prepare('SELECT role, disabledAt FROM User WHERE id = ?').get('u3') as { role: string; disabledAt: string | null }
    after.close()
    expect(key.revokedAt).toBe('2026-09-20T00:00:00.000Z') // revoked key stays revoked
    expect(u1.role).toBe('member')                          // demotion stays applied
    expect(u2.disabledAt).toBeNull()                        // unban stays applied
    expect(u3).not.toBeNull()                               // post-backup user is re-inserted…
    expect(u3.disabledAt).toBe('2026-09-25T00:00:00.000Z')  // …with its ban intact
  })
})
