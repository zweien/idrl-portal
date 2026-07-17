-- CreateTable: Category (unified news/resource categories)
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable: ApiKey (machine-to-machine tokens, hashed)
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME
);

-- CreateTable: Setting (key/value app config)
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateTable: SyncLog (background job audit)
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "job" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "stats" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_kind_name_key" ON "Category"("kind", "name");
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- Data migration: seed Category from existing NewsItem.type / Resource.type values
-- (paper/notice/event/achievement → news; compute/storage/code/docs/other → resource)
INSERT INTO "Category" ("id", "name", "kind", "order")
SELECT 'cat_news_' || "type", "type", 'news', 0 FROM "NewsItem"
WHERE "type" IS NOT NULL
GROUP BY "type"
ON CONFLICT DO NOTHING;

INSERT INTO "Category" ("id", "name", "kind", "order")
SELECT 'cat_res_' || "type", "type", 'resource', 0 FROM "Resource"
WHERE "type" IS NOT NULL
GROUP BY "type"
ON CONFLICT DO NOTHING;

-- RedefineTables: rebuild NewsItem (drop type, add status/publishAt/categoryId)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_NewsItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "summary" TEXT,
    "author" TEXT,
    "date" TEXT NOT NULL,
    "tags" TEXT,
    "imageUrl" TEXT,
    "link" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'published',
    "publishAt" TEXT,
    "categoryId" TEXT,
    CONSTRAINT "NewsItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NewsItem" ("id", "title", "content", "summary", "author", "date", "tags", "imageUrl", "link", "pinned", "status", "categoryId")
SELECT "id", "title", "content", "summary", "author", "date", "tags", "imageUrl", "link", "pinned", 'published', 'cat_news_' || "type"
FROM "NewsItem";
DROP TABLE "NewsItem";
ALTER TABLE "new_NewsItem" RENAME TO "NewsItem";

-- RedefineTables: rebuild Resource (drop type, add categoryId)
CREATE TABLE "new_Resource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT,
    "icon" TEXT,
    "status" TEXT NOT NULL,
    "specs" TEXT,
    "accessLevel" TEXT NOT NULL,
    "categoryId" TEXT,
    CONSTRAINT "Resource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Resource" ("id", "name", "description", "url", "icon", "status", "specs", "accessLevel", "categoryId")
SELECT "id", "name", "description", "url", "icon", "status", "specs", "accessLevel", 'cat_res_' || "type"
FROM "Resource";
DROP TABLE "Resource";
ALTER TABLE "new_Resource" RENAME TO "Resource";

CREATE INDEX "NewsItem_categoryId_idx" ON "NewsItem"("categoryId");
CREATE INDEX "Resource_categoryId_idx" ON "Resource"("categoryId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
