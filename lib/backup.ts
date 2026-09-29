/**
 * SQLite backup / restore / prune utilities.
 *
 * Backups are full file copies of the live DB (all 11 tables), created with
 * better-sqlite3's online `.backup()` API (safe to run while the app is
 * serving requests — no need to disconnect Prisma). Stored in a local
 * directory; the admin UI can list/download/restore/upload them.
 *
 * Restore overwrites the live DB file in place (after taking a pre-restore
 * safety snapshot), so the next reads see the restored data.
 */

import Database from 'better-sqlite3'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { prisma, ensureWalMode } from '@/lib/db'

const BACKUP_DIR = join(process.cwd(), 'prisma', 'backups')

/** Resolve the live DB file path from the same default lib/db uses. */
function dbPath(): string {
  const url = process.env.DATABASE_URL ?? 'file:prisma/db.sqlite'
  // DATABASE_URL is like "file:prisma/db.sqlite" — strip the leading "file:".
  return url.startsWith('file:') ? url.slice('file:'.length) : url
}

export type BackupTrigger = 'auto' | 'manual' | 'pre-restore'

export interface BackupInfo {
  filename: string
  sizeKb: number
  /** ISO timestamp parsed from the filename. */
  createdAt: string
  trigger: BackupTrigger
}

function ensureDir() {
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
}

function timestamp(): string {
  // YYYYMMDDTHHMMSS, stable for filename sorting.
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function parseFilename(filename: string): { createdAt: string; trigger: BackupTrigger } | null {
  // backup-20260720T030000-auto.sqlite
  const m = filename.match(/^backup-(\d{8}T\d{6})-(auto|manual|pre-restore)\.sqlite$/)
  if (!m) return null
  const ts = m[1]
  // 20260720T030000 → ISO
  const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}`
  return { createdAt: iso, trigger: m[2] as BackupTrigger }
}

/** Validate a filename is a real backup name (no path traversal). */
export function isValidBackupName(filename: string): boolean {
  return /^backup-\d{8}T\d{6}-(auto|manual|pre-restore)\.sqlite$/.test(filename)
}

/**
 * Create a backup of the live DB. Uses better-sqlite3's online backup so the
 * app keeps serving. Returns the new backup's info.
 */
export async function createBackup(trigger: BackupTrigger): Promise<BackupInfo> {
  ensureDir()
  const filename = `backup-${timestamp()}-${trigger}.sqlite`
  const dest = join(BACKUP_DIR, filename)
  const src = dbPath()
  if (!existsSync(src)) throw new Error(`DB file not found at ${src}`)

  // Open the source and back it up to the destination file. better-sqlite3's
  // .backup() does an online page-by-page copy (safe under concurrent writes).
  const db = new Database(src)
  try {
    await db.backup(dest)
  } finally {
    db.close()
  }
  const st = statSync(dest)
  return { filename, sizeKb: Math.round(st.size / 1024), createdAt: parseFilename(filename)!.createdAt, trigger }
}

/** List all backups, newest first. */
export function listBackups(): BackupInfo[] {
  ensureDir()
  return readdirSync(BACKUP_DIR)
    .map(name => {
      const parsed = parseFilename(name)
      if (!parsed) return null
      const st = statSync(join(BACKUP_DIR, name))
      return { filename: name, sizeKb: Math.round(st.size / 1024), createdAt: parsed.createdAt, trigger: parsed.trigger } satisfies BackupInfo
    })
    .filter((x): x is BackupInfo => x !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Absolute path for a backup filename (after validating it). */
export function backupPath(filename: string): string {
  if (!isValidBackupName(filename)) throw new Error('invalid backup filename')
  return join(BACKUP_DIR, filename)
}

/** Delete a single backup by filename. */
export function deleteBackup(filename: string): void {
  const p = backupPath(filename)
  if (existsSync(p)) unlinkSync(p)
}

/**
 * Keep only the `keepN` newest backups; delete the rest. Used after each
 * createBackup to bound disk usage.
 */
export function pruneBackups(keepN: number): { deleted: string[] } {
  const all = listBackups() // newest first
  const toDelete = all.slice(keepN)
  for (const b of toDelete) deleteBackup(b.filename)
  return { deleted: toDelete.map(b => b.filename) }
}

/**
 * After overwriting the live DB from a backup, run `prisma migrate deploy` so
 * any migrations that were added after the backup was taken (e.g. AuditLog)
 * get applied. Without this, restoring an older backup leaves the schema
 * missing tables — causing runtime errors in code that expects them.
 */
function migrateAfterRestore(): void {
  try {
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: process.cwd(),
      stdio: 'pipe', // suppress output; errors surface via the thrown exception
      timeout: 30_000,
    })
  } catch (e) {
    // Non-fatal: the restore itself succeeded; migrations may have partially
    // applied. Log so the admin knows to check.
    console.error('post-restore migration failed:', e)
  }
}

/**
 * Carry auth lifecycle decisions (ApiKey.revokedAt, User.disabledAt, User.role)
 * from the pre-restore snapshot into the freshly restored DB.
 *
 * A restore rolls the whole database back to snapshot-of-the-backup time, which
 * silently resurrects revoked API keys, banned users, and demoted roles that
 * were recorded AFTER the backup was taken — exactly the per-request state
 * lib/auth-api.ts re-reads (a leaked key re-authenticates, a banned user's
 * unexpired cookie re-authorizes). The pre-restore snapshot holds the latest
 * live decisions, so replaying its lifecycle columns over the restored rows
 * re-applies them. Rows missing from the restored DB: ApiKey rows need no
 * handling (a vanished keyHash fails the lookup, i.e. stays revoked), but
 * User rows must be re-inserted — resolveSession keeps the stale cookie role
 * for a missing row, which would resurrect a since-demoted/banned admin.
 * Tables absent from a very old snapshot (created by later migrations) carry
 * nothing.
 */
function reapplyAuthLifecycle(snapshotPath: string): void {
  try {
    const snap = new Database(snapshotPath, { readonly: true })
    const live = new Database(dbPath())
    try {
      const tableExists = (db: Database.Database, name: string) =>
        db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(name)

      let keysCarried = 0
      if (tableExists(snap, 'ApiKey') && tableExists(live, 'ApiKey')) {
        const reapplyKey = live.prepare(
          'UPDATE ApiKey SET revokedAt = ? WHERE id = ? AND revokedAt IS NULL',
        )
        const keys = snap.prepare(
          'SELECT id, revokedAt FROM ApiKey WHERE revokedAt IS NOT NULL',
        ).all() as Array<{ id: string; revokedAt: string }>
        for (const k of keys) keysCarried += reapplyKey.run(k.revokedAt, k.id).changes
      }
      let usersCarried = 0
      let usersReinserted = 0
      if (tableExists(snap, 'User') && tableExists(live, 'User')) {
        const reapplyUser = live.prepare(
          'UPDATE User SET disabledAt = ?, role = ? WHERE id = ?',
        )
        const existsInLive = live.prepare('SELECT 1 FROM User WHERE id = ?')
        // Snapshot users missing from the restored DB (account created after
        // the backup) must be re-inserted, not skipped: a vanished row makes
        // resolveSession fall back to the stale cookie role (lib/auth-api.ts),
        // which would resurrect a since-demoted/banned admin, and a later SSO
        // login would recreate the account without its ban. After
        // migrateAfterRestore both schemas are the running code's, so the
        // column sets match; insert the snapshot row verbatim.
        const cols = (live.pragma('table_info(User)') as Array<{ name: string }>).map(c => c.name)
        const personExists = live.prepare('SELECT 1 FROM Person WHERE id = ?')
        // Login identity is what the auth callbacks actually upsert by — the
        // restored DB may hold the same (provider, externalId) under a
        // different id (deleted+recreated account, or a backup from another
        // install), and a verbatim insert would violate the unique key while
        // leaving the snapshot's newer ban/demotion unapplied. Resolve that
        // row and update it instead.
        const byLogin = live.prepare('SELECT id FROM User WHERE provider = ? AND externalId = ?')
        const insertUser = live.prepare(
          `INSERT INTO User (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        )
        const users = snap.prepare(
          `SELECT ${cols.join(', ')} FROM User`,
        ).all() as Array<Record<string, unknown>>
        for (const u of users) {
          if (existsInLive.get(u.id)) {
            usersCarried += reapplyUser.run(u.disabledAt, u.role, u.id).changes
          } else {
            const sameLogin = u.provider != null && u.externalId != null
              ? byLogin.get(u.provider as string, u.externalId as string) as { id: string } | undefined
              : undefined
            if (sameLogin) {
              usersCarried += reapplyUser.run(u.disabledAt, u.role, sameLogin.id).changes
              continue
            }
            // The snapshot row may reference a Person also created after the
            // backup (absent from the restored DB) — drop the dangling link so
            // the FK holds; the auth record and its ban must still land. Each
            // insert is isolated so one bad row cannot abort the rest.
            try {
              const dangling = u.personId != null && !personExists.get(u.personId as string)
              insertUser.run(...cols.map(c => (c === 'personId' && dangling) ? null : u[c] ?? null))
              usersReinserted++
            } catch (e) {
              console.error(`restore: failed to re-insert user ${String(u.id)} from snapshot:`, e)
            }
          }
        }
      }
      if (keysCarried || usersCarried || usersReinserted) {
        console.warn(
          `restore: re-applied post-backup auth lifecycle (${keysCarried} api-key revocations, ` +
            `${usersCarried} user role/ban rows, ${usersReinserted} re-inserted users) from the pre-restore snapshot`,
        )
      }
    } finally {
      snap.close()
      live.close()
    }
  } catch (e) {
    // The restore itself already succeeded; failing the request here would
    // leave the admin without a rollback path. Loud log instead — the admin
    // should re-check revoked keys / banned users named in the snapshot.
    console.error('post-restore auth lifecycle carry-forward failed:', e)
  }
}

/**
 * Restore a backup over the live DB. First takes a 'pre-restore' snapshot so
 * a bad restore can itself be undone. Overwrites the DB file via better-sqlite3
 * online backup (source = backup file, destination = live DB). Then runs
 * `prisma migrate deploy` to apply any migrations the backup predates.
 *
 * NOTE: existing better-sqlite3 connections (the Prisma adapter's) will see
 * the new content on subsequent reads — the backup API writes the same file
 * they're bound to.
 */
export async function restoreBackup(filename: string): Promise<{ preRestore: BackupInfo }> {
  const src = backupPath(filename)
  if (!existsSync(src)) throw new Error(`backup not found: ${filename}`)
  // Safety snapshot of the current state before we overwrite it.
  const preRestore = await createBackup('pre-restore')
  // Overwrite the live DB: open the backup as source, back it up INTO the live
  // path. better-sqlite3 .backup() can copy an existing DB's pages to another
  // DB file (replacing its contents).
  const dest = dbPath()
  const db = new Database(src)
  try {
    await db.backup(dest)
  } finally {
    db.close()
  }
  // Apply any migrations the restored DB is missing (e.g. AuditLog on an old
  // backup). This keeps the schema consistent with the running code.
  migrateAfterRestore()
  // Re-apply revocations/bans/demotions taken after the backup was made (the
  // snapshot tables exist only after migrations, so this must follow migrate).
  reapplyAuthLifecycle(join(BACKUP_DIR, preRestore.filename))
  // A restored backup may have been taken in DELETE journal mode (pre-WAL);
  // re-assert WAL so the next write doesn't block readers.
  ensureWalMode()
  return { preRestore }
}

/**
 * Restore from an uploaded file path (already saved to disk). Validates it's a
 * real SQLite DB by opening it and reading the migrations table. Then runs the
 * same overwrite flow as restoreBackup.
 */
export async function restoreFromFile(uploadPath: string): Promise<{ preRestore: BackupInfo }> {
  // Validate it's a SQLite DB with our schema (has _prisma_migrations).
  let ok = false
  try {
    const test = new Database(uploadPath, { readonly: true })
    test.prepare('SELECT 1 FROM _prisma_migrations LIMIT 1').get()
    test.close()
    ok = true
  } catch {
    ok = false
  }
  if (!ok) throw new Error('上传的文件不是有效的数据库备份（缺少 _prisma_migrations 表）')

  const dest = dbPath()
  const preRestore = await createBackup('pre-restore')
  const db = new Database(uploadPath)
  try {
    await db.backup(dest)
  } finally {
    db.close()
  }
  // Apply any migrations the uploaded DB is missing.
  migrateAfterRestore()
  // Re-apply revocations/bans/demotions taken after the uploaded backup was
  // made (post-migrate, same reasoning as restoreBackup).
  reapplyAuthLifecycle(join(BACKUP_DIR, preRestore.filename))
  // Re-assert WAL in case the uploaded backup predates WAL enablement.
  ensureWalMode()
  return { preRestore }
}

/** Read the configured backup retention (Setting `backup.keep`, default 7). */
export async function readKeepCount(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: 'backup.keep' } })
  const n = row ? parseInt(row.value, 10) : 7
  return Number.isInteger(n) && n > 0 ? n : 7
}

export { BACKUP_DIR }
