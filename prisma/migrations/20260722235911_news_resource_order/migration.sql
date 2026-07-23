-- RedefineTables
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
    "order" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    CONSTRAINT "NewsItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NewsItem" ("author", "categoryId", "content", "date", "id", "imageUrl", "link", "pinned", "publishAt", "status", "summary", "tags", "title") SELECT "author", "categoryId", "content", "date", "id", "imageUrl", "link", "pinned", "publishAt", "status", "summary", "tags", "title" FROM "NewsItem";
DROP TABLE "NewsItem";
ALTER TABLE "new_NewsItem" RENAME TO "NewsItem";
CREATE TABLE "new_Resource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "url" TEXT,
    "icon" TEXT,
    "status" TEXT NOT NULL,
    "specs" TEXT,
    "accessLevel" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    CONSTRAINT "Resource_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Resource" ("accessLevel", "categoryId", "description", "icon", "id", "name", "specs", "status", "url") SELECT "accessLevel", "categoryId", "description", "icon", "id", "name", "specs", "status", "url" FROM "Resource";
DROP TABLE "Resource";
ALTER TABLE "new_Resource" RENAME TO "Resource";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
