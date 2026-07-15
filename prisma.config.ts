import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// DATABASE_URL drives both the Prisma CLI (migrate/generate) and the runtime
// client (lib/db). Prisma CLI is a separate process (not Next.js), so we load
// .env explicitly here via dotenv/config. Default keeps the historical dev
// location so existing clones keep working without a .env.
const databaseUrl = process.env.DATABASE_URL ?? 'file:prisma/db.sqlite'

export default defineConfig({
  datasource: {
    url: databaseUrl,
  },
})
