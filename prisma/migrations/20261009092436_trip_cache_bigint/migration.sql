/*
  Warnings:

  - You are about to alter the column `tripEnd` on the `TripInstanceCache` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.
  - You are about to alter the column `tripStart` on the `TripInstanceCache` table. The data in that column could be lost. The data in that column will be cast from `Int` to `BigInt`.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TripInstanceCache" (
    "instanceId" TEXT NOT NULL PRIMARY KEY,
    "originatorUserid" TEXT,
    "tripStart" BIGINT,
    "tripEnd" BIGINT,
    "reason" TEXT,
    "parsed" BOOLEAN NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_TripInstanceCache" ("fetchedAt", "instanceId", "originatorUserid", "parsed", "reason", "tripEnd", "tripStart") SELECT "fetchedAt", "instanceId", "originatorUserid", "parsed", "reason", "tripEnd", "tripStart" FROM "TripInstanceCache";
DROP TABLE "TripInstanceCache";
ALTER TABLE "new_TripInstanceCache" RENAME TO "TripInstanceCache";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
