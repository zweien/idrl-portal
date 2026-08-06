-- Secondary indexes for hot read/sync columns.
--
-- Before this, every listing filtered/sorted on unindexed columns (full table
-- scans), and syncMembers did findFirst({ where: { dingUserId } }) once per
-- member — an O(N²) scan on every sync. These are the columns actually used
-- in WHERE/ORDER BY by the list endpoints and the sync loop.
--
-- SQLite indexes are B-tree; CREATE INDEX IF NOT EXISTS makes the migration
-- safe to re-run (e.g. after a restore that predates it). Idempotent adds are
-- cheap no-ops when the index already exists.

-- NewsItem: public listings filter status='published'; category pages filter
-- categoryId; the pinned badge is checked on every list/sort.
CREATE INDEX IF NOT EXISTS "NewsItem_status_idx" ON "NewsItem"("status");
CREATE INDEX IF NOT EXISTS "NewsItem_categoryId_idx" ON "NewsItem"("categoryId");
CREATE INDEX IF NOT EXISTS "NewsItem_pinned_idx" ON "NewsItem"("pinned");

-- Resource: category pages filter categoryId; access-level enforcement filters
-- accessLevel; status filters active/inactive.
CREATE INDEX IF NOT EXISTS "Resource_categoryId_idx" ON "Resource"("categoryId");
CREATE INDEX IF NOT EXISTS "Resource_accessLevel_idx" ON "Resource"("accessLevel");
CREATE INDEX IF NOT EXISTS "Resource_status_idx" ON "Resource"("status");

-- Person: syncMembers lookup by dingUserId (was the worst N+1); status filters
-- the personnel board.
CREATE INDEX IF NOT EXISTS "Person_dingUserId_idx" ON "Person"("dingUserId");
CREATE INDEX IF NOT EXISTS "Person_status_idx" ON "Person"("status");
