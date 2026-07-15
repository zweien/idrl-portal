import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

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
