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
import { prisma } from '@/lib/db'

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
  return { preRestore }
}

/**
 * Restore from an uploaded file path (already saved to disk). Validates it's
 * a real SQLite DB by opening it and reading the migrations table. Then runs
 * the same overwrite flow as restoreBackup.
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
  return { preRestore }
}

/** Read the configured backup retention (Setting `backup.keep`, default 7). */
export async function readKeepCount(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: 'backup.keep' } })
  const n = row ? parseInt(row.value, 10) : 7
  return Number.isInteger(n) && n > 0 ? n : 7
}

export { BACKUP_DIR }
