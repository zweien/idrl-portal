import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import Database from 'better-sqlite3'

declare global {
  var prisma: PrismaClient | undefined
}

// DATABASE_URL must match prisma.config.ts. Default keeps the historical dev
// location so the app runs without a .env file in development.
const databaseUrl = process.env.DATABASE_URL ?? 'file:prisma/db.sqlite'

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') global.prisma = prisma

/**
 * Resolve the live DB file path from the same default this module uses, so
 * callers (backup/restore) operate on the same file Prisma is bound to.
 */
export function dbFilePath(): string {
  return databaseUrl.startsWith('file:') ? databaseUrl.slice('file:'.length) : databaseUrl
}

/**
 * Re-assert WAL journal mode on the live DB file. WAL is a persistent DB-file
 * property (set once by migration 20260806002721_enable_wal_mode and then
 * sticky), so under normal operation this is a no-op. The one case it matters:
 * restoring a backup taken before WAL was enabled replaces the DB file with a
 * DELETE-mode copy. Calling this after such a restore flips it back to WAL so
 * readers don't block on the next write. Safe to call while the app serves.
 */
export function ensureWalMode(): 'wal' | 'delete' | string {
  const db = new Database(dbFilePath())
  try {
    // PRAGMA journal_mode=WAL returns the resulting mode (lowercase).
    const row = db.pragma('journal_mode=WAL', { simple: true })
    return String(row)
  } finally {
    db.close()
  }
}
