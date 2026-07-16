import { describe, it, expect } from 'vitest'
import { resolvePersonId } from '@/lib/floor-layout'

const db = {
  id: 'ws-1', personId: 'p-1', row: 0, col: 1, zoneId: 'zone-9a', floorId: 'floor-9',
}

describe('resolvePersonId (floor-layout personId protection)', () => {
  it('honors an explicit personId in the payload (assign)', () => {
    expect(resolvePersonId({ ...db, personId: 'p-9' }, db)).toBe('p-9')
  })

  it('honors an explicit null in the payload when geometry changed (intentional unassign via move)', () => {
    // payload moved the workstation AND set null → treat as deliberate
    expect(resolvePersonId({ ...db, personId: null, row: 2 }, db)).toBeNull()
  })

  it('keeps the DB personId when payload omits it and geometry is unchanged (stale snapshot)', () => {
    expect(resolvePersonId({ ...db, personId: undefined }, db)).toBe('p-1')
    expect(resolvePersonId({ ...db, personId: null }, db)).toBe('p-1')
  })

  it('wipes personId when payload omits it but geometry differs', () => {
    expect(resolvePersonId({ ...db, personId: undefined, row: 3 }, db)).toBeNull()
    expect(resolvePersonId({ ...db, personId: undefined, col: 9 }, db)).toBeNull()
    expect(resolvePersonId({ ...db, personId: undefined, zoneId: 'other' }, db)).toBeNull()
  })

  it('returns null when no DB row exists and payload omits personId', () => {
    expect(resolvePersonId({ ...db, personId: undefined }, undefined)).toBeNull()
  })

  it('returns null when DB row has no personId', () => {
    expect(resolvePersonId({ ...db, personId: undefined }, { ...db, personId: null })).toBeNull()
  })
})
