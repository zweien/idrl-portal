-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Person" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT NOT NULL DEFAULT '',
    "email" TEXT,
    "phone" TEXT,
    "dingUserId" TEXT,
    "status" TEXT NOT NULL,
    "lastSeen" TEXT,
    "researchAreas" TEXT,
    "avatar" TEXT,
    "offboardedAt" DATETIME
);
INSERT INTO "new_Person" ("avatar", "dingUserId", "email", "id", "lastSeen", "name", "offboardedAt", "phone", "researchAreas", "role", "status") SELECT "avatar", "dingUserId", "email", "id", "lastSeen", "name", "offboardedAt", "phone", "researchAreas", "role", "status" FROM "Person";
DROP TABLE "Person";
ALTER TABLE "new_Person" RENAME TO "Person";
CREATE INDEX "Person_dingUserId_idx" ON "Person"("dingUserId");
CREATE INDEX "Person_status_idx" ON "Person"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
