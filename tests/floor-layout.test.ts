import { describe, it, expect } from 'vitest'
import { resolvePersonId, findDuplicateIds, makeIdGen, formatConflictMessage } from '@/lib/floor-layout'

const db = {
  id: 'ws-1', personId: 'p-1', row: 0, col: 1, zoneId: 'zone-9a', floorId: 'floor-9',
}

describe('resolvePersonId (floor-layout personId persistence)', () => {
  it('honors an explicit personId in the payload (assign)', () => {
    expect(resolvePersonId({ ...db, personId: 'p-9' }, db)).toBe('p-9')
  })

  it('honors an explicit null even when geometry is unchanged (unassign via UI)', () => {
    // The assignment UI's "未分配" sends null at unchanged geometry — this is a
    // deliberate unassign and must clear the assignment, not be protected.
    expect(resolvePersonId({ ...db, personId: null }, db)).toBeNull()
  })

  it('honors an explicit null when geometry changed', () => {
    expect(resolvePersonId({ ...db, personId: null, row: 2 }, db)).toBeNull()
  })

  it('keeps the DB personId when payload OMITS it (undefined) and geometry is unchanged (stale snapshot)', () => {
    expect(resolvePersonId({ ...db, personId: undefined }, db)).toBe('p-1')
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

describe('findDuplicateIds (floor-layout payload validation)', () => {
  const ok = [
    { id: 'floor-9', zones: [{ id: 'zone-9a', workstations: [{ id: 'ws-1' }] }] },
    { id: 'floor-10', zones: [{ id: 'zone-10a', workstations: [{ id: 'ws-2' }] }] },
  ]
  it('returns null when all ids are unique', () => {
    expect(findDuplicateIds(ok)).toBeNull()
  })
  it('rejects a duplicate floor id', () => {
    expect(findDuplicateIds([{ ...ok[0] }, { ...ok[0] }])).toMatch(/duplicate floor id/)
  })
  it('rejects a duplicate zone id (across floors)', () => {
    const floors = [
      { id: 'f1', zones: [{ id: 'zdup', workstations: [{ id: 'w1' }] }] },
      { id: 'f2', zones: [{ id: 'zdup', workstations: [{ id: 'w2' }] }] },
    ]
    expect(findDuplicateIds(floors)).toMatch(/duplicate zone id/)
  })
  it('rejects a duplicate workstation id', () => {
    const floors = [
      { id: 'f1', zones: [
        { id: 'z1', workstations: [{ id: 'wdup' }] },
        { id: 'z2', workstations: [{ id: 'wdup' }] },
      ] },
    ]
    expect(findDuplicateIds(floors)).toMatch(/duplicate workstation id/)
  })
})

describe('makeIdGen (editor id generation)', () => {
  // 回归：远程库里已有早期会话保存的 zone-100，新会话首个生成的 zone id
  // 不能再撞上它（旧模块级计数器每次页面加载从 100 重置导致此 bug）。
  it('skips ids already present anywhere in the loaded state (the zone-100 bug)', () => {
    const floors = [
      { id: 'floor-9', zones: [
        { id: 'zone-9a', workstations: [] },
      ] },
      { id: 'floor-10', zones: [
        { id: 'zone-100', workstations: [] },
      ] },
    ]
    const genId = makeIdGen(floors)
    expect(genId('zone')).toBe('zone-101')
    expect(genId('zone')).toBe('zone-102')
  })

  it('returns ids unique within one generator (updateZoneGrid loop)', () => {
    const genId = makeIdGen([{ id: 'f1', zones: [{ id: 'z1', workstations: [{ id: 'ws-z1-100' }] }] }])
    const ids = [genId('ws-z1'), genId('ws-z1'), genId('ws-z1')]
    expect(new Set(ids).size).toBe(3)
  })

  it('treats prefixes independently and skips floor/workspace collisions too', () => {
    const floors = [
      { id: 'floor-100', zones: [
        { id: 'zone-9a', workstations: [{ id: 'ws-zone-9a-100' }] },
      ] },
    ]
    const genId = makeIdGen(floors)
    expect(genId('floor')).toBe('floor-101')
    expect(genId('ws-zone-9a')).toBe('ws-zone-9a-101')
  })

  it('round-trips with findDuplicateIds: generated ids keep the payload clean', () => {
    const floors = [
      { id: 'floor-9', zones: [
        { id: 'zone-9a', workstations: [{ id: 'ws-1' }] },
        { id: 'zone-100', workstations: [] },
      ] },
    ]
    const genId = makeIdGen(floors)
    const withNew = [
      ...floors,
      {
        id: 'floor-10',
        zones: [{ id: genId('zone'), workstations: [{ id: genId('ws-zone-101') }] }],
      },
    ]
    expect(findDuplicateIds(withNew as typeof floors)).toBeNull()
  })

  it('keeps session-deleted ids reserved via the tombstone set (P1)', () => {
    // 会话内删除了 zone-100（当前状态已不含它），但保存前 DB 里还在——
    // 新生成的 zone id 不得复用 zone-100，否则 resolvePersonId 会把旧
    // 工位的人员分配转移到新区域的同几何工位上。
    const floors = [
      { id: 'floor-10', zones: [{ id: 'zone-10a', workstations: [] }] },
    ]
    const genId = makeIdGen(floors, ['zone-100', 'ws-zone-100-100'])
    expect(genId('zone')).toBe('zone-101')
    expect(genId('ws-zone-100')).toBe('ws-zone-100-101')
  })

  it('advances a per-prefix cursor: a 50x50 grid gets a dense id sequence (P2)', () => {
    const floors = [{ id: 'floor-9', zones: [{ id: 'zone-9a', workstations: [] }] }]
    const genId = makeIdGen(floors)
    const ids = Array.from({ length: 2500 }, () => genId('ws-zone-9a'))
    expect(new Set(ids).size).toBe(2500)
    expect(ids[0]).toBe('ws-zone-9a-100')
    expect(ids[2499]).toBe('ws-zone-9a-2599')
  })
})

describe('formatConflictMessage (one-person-one-workstation error naming WHO)', () => {
  const floors = [
    {
      id: 'floor-9', name: '9层', zones: [
        { id: 'zone-9a', name: 'A区', workstations: [
          { id: 'ws-a1', name: 'A-01' },
          { id: 'ws-a2', name: 'A-02' },
        ] },
      ],
    },
    {
      id: 'floor-10', name: '10层', zones: [
        { id: 'zone-10a', name: 'B区', workstations: [
          { id: 'ws-b1', name: 'B-01' },
        ] },
      ],
    },
  ]
  const names = new Map([['p1', '张三']])

  it('names the person and locates every conflicting workstation', () => {
    const msg = formatConflictMessage(
      [{ personId: 'p1', workstationIds: ['ws-a1', 'ws-b1'] }],
      floors,
      names,
    )
    expect(msg).toContain('张三')
    expect(msg).toContain('9层 · A区 · A-01')
    expect(msg).toContain('10层 · B区 · B-01')
    expect(msg).toMatch(/^一人一工位冲突：/)
  })

  it('falls back to the raw personId and workstation id when lookups miss', () => {
    const msg = formatConflictMessage(
      [{ personId: 'p-ghost', workstationIds: ['ws-ghost'] }],
      floors,
      names,
    )
    expect(msg).toContain('p-ghost（ws-ghost）')
  })

  it('joins multiple conflicts and blank names defensively', () => {
    const msg = formatConflictMessage(
      [
        { personId: 'p1', workstationIds: ['ws-a1', 'ws-a2'] },
        { personId: 'p2', workstationIds: ['ws-b1', 'ws-ghost'] },
      ],
      floors,
      names,
    )
    expect(msg).toContain('张三（9层 · A区 · A-01、9层 · A区 · A-02）')
    expect(msg).toContain('p2（10层 · B区 · B-01、ws-ghost）')
    expect(msg).toContain('；')
  })
})

describe('formatConflictMessage blank-name fallback', () => {
  const floors = [{
    id: 'f', name: '9层', zones: [{ id: 'z', name: 'A区', workstations: [{ id: 'w1', name: 'A-01' }] }],
  }]
  it('falls back to the raw personId when the resolved name is whitespace-only', () => {
    const names = new Map([['p1', '   '], ['p2', '']])
    const msg = formatConflictMessage(
      [{ personId: 'p1', workstationIds: ['w1'] }, { personId: 'p2', workstationIds: ['w1'] }],
      floors,
      names,
    )
    expect(msg).toContain('p1（')
    expect(msg).toContain('p2（')
    expect(msg).not.toContain('   （')
  })
})
