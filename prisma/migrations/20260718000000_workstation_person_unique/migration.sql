-- One-person-one-workstation: make Workstation.personId globally unique.
-- SQLite treats multiple NULLs as distinct, so unassigned workstations coexist.

-- Step 1: dedup existing data. For each personId held by more than one
-- workstation, keep one (lowest rowid — insertion order) and clear the rest.
-- (Detected during planning: 2 persons were each on 2 workstations.)
UPDATE "Workstation" SET "personId" = NULL
WHERE "rowid" NOT IN (
  SELECT MIN("rowid") FROM "Workstation"
  WHERE "personId" IS NOT NULL
  GROUP BY "personId"
)
AND "personId" IS NOT NULL;

-- Step 2: enforce uniqueness going forward.
CREATE UNIQUE INDEX "workstation_person_uniq" ON "Workstation"("personId");
