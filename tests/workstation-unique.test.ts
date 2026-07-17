import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

/**
 * One-person-one-workstation: the @@unique([personId]) constraint must reject a
 * second workstation claiming the same non-null person, while multiple NULL
 * personIds (unassigned workstations) coexist. Uses a throwaway on-disk
 * SQLite DB so the test is hermetic.
 */

let prisma: PrismaClient
let tmpDir: string

beforeAll(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'idrl-ws-uniq-'))
  const db = new Database(join(tmpDir, 'test.db'))
  db.exec(`
    CREATE TABLE "Floor" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "order" INTEGER NOT NULL
    );
    CREATE TABLE "Zone" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "floorId" TEXT NOT NULL,
      "color" TEXT NOT NULL,
      "order" INTEGER NOT NULL,
      "mode" TEXT NOT NULL,
      "rows" INTEGER NOT NULL,
      "cols" INTEGER NOT NULL,
      "maxRows" INTEGER NOT NULL,
      "maxCols" INTEGER NOT NULL,
      CONSTRAINT "Zone_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    );
    CREATE TABLE "Person" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "email" TEXT,
      "phone" TEXT,
      "dingUserId" TEXT,
      "status" TEXT NOT NULL,
      "lastSeen" TEXT,
      "researchAreas" TEXT,
      "avatar" TEXT
    );
    CREATE TABLE "Workstation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "zoneId" TEXT NOT NULL,
      "floorId" TEXT NOT NULL,
      "row" INTEGER NOT NULL,
      "col" INTEGER NOT NULL,
      "personId" TEXT,
      "status" TEXT NOT NULL,
      "nameCustomized" BOOLEAN NOT NULL DEFAULT false,
      CONSTRAINT "Workstation_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Workstation_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Workstation_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    );
    CREATE UNIQUE INDEX "workstation_person_uniq" ON "Workstation"("personId");
  `)
  prisma = new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: `file:${join(tmpDir, 'test.db')}` }),
  })
  // Seed: a floor, zone, two workstations, one person.
  await prisma.floor.create({ data: { id: 'f1', name: 'F1', order: 0 } })
  await prisma.zone.create({
    data: { id: 'z1', name: 'Z1', floorId: 'f1', color: '#000', order: 0, mode: 'grid', rows: 1, cols: 2, maxRows: 1, maxCols: 2 },
  })
  await prisma.workstation.create({ data: { id: 'w1', name: 'A1', zoneId: 'z1', floorId: 'f1', row: 0, col: 0, status: 'occupied' } })
  await prisma.workstation.create({ data: { id: 'w2', name: 'A2', zoneId: 'z1', floorId: 'f1', row: 0, col: 1, status: 'empty' } })
  await prisma.person.create({ data: { id: 'p1', name: 'Alice', role: 'phd', status: 'present' } })
})

afterAll(async () => {
  await prisma?.$disconnect()
  rmSync(tmpDir, { recursive: true, force: true })
})

describe('Workstation.personId @@unique', () => {
  it('allows assigning a person to one workstation', async () => {
    await prisma.workstation.update({ where: { id: 'w1' }, data: { personId: 'p1' } })
    const ws = await prisma.workstation.findUnique({ where: { id: 'w1' } })
    expect(ws?.personId).toBe('p1')
  })

  it('rejects assigning the same person to a second workstation', async () => {
    await expect(
      prisma.workstation.update({ where: { id: 'w2' }, data: { personId: 'p1' } }),
    ).rejects.toThrow()
  })

  it('allows multiple unassigned (NULL personId) workstations', async () => {
    // w2 stays NULL; create a third NULL workstation — both must coexist.
    await prisma.workstation.create({
      data: { id: 'w3', name: 'A3', zoneId: 'z1', floorId: 'f1', row: 1, col: 0, status: 'empty' },
    })
    const nullWs = await prisma.workstation.findMany({ where: { personId: null } })
    expect(nullWs.length).toBeGreaterThanOrEqual(2)
  })

  it('allows reassigning a person after clearing the original slot', async () => {
    await prisma.workstation.update({ where: { id: 'w1' }, data: { personId: null } })
    await prisma.workstation.update({ where: { id: 'w2' }, data: { personId: 'p1' } })
    const w2 = await prisma.workstation.findUnique({ where: { id: 'w2' } })
    expect(w2?.personId).toBe('p1')
  })
})
