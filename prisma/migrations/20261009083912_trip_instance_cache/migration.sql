-- CreateTable
CREATE TABLE "TripInstanceCache" (
    "instanceId" TEXT NOT NULL PRIMARY KEY,
    "originatorUserid" TEXT,
    "tripStart" INTEGER,
    "tripEnd" INTEGER,
    "reason" TEXT,
    "parsed" BOOLEAN NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
