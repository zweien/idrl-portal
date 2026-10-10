import { describe, it, expect } from 'vitest'
import { planAssignment, type WsRef, type WsPerson } from '@/lib/workstation-assign'

// Pure planning for the workstation-assignment API: one-person-one-workstation
// with move semantics, conflict 409s, and force displacement.

const ws = (id: string, personId: string | null, name = id): WsRef => ({ id, name, personId })
const person = (id: string, name = id, workstationId?: string): WsPerson => ({ id, name, workstationId })

describe('planAssignment (workstation assignment planning)', () => {
  it('assigns a free workstation to a person', () => {
    const p = planAssignment(ws('w1', null), person('p1', '张三'), 'p1')
    expect(p.ok).toBe(true)
    if (p.ok) {
      expect(p.clear).toEqual([])
      expect(p.assign).toEqual({ workstationId: 'w1', personId: 'p1' })
      expect(p.summary).toContain('张三')
    }
  })

  it('frees the person’s old workstation when moving (never two seats)', () => {
    const p = planAssignment(ws('w2', null), person('p1', '张三', 'w1'), 'p1')
    expect(p.ok).toBe(true)
    if (p.ok) {
      expect(p.clear).toEqual(['w1'])
      expect(p.assign.workstationId).toBe('w2')
    }
  })

  it('clears an occupied workstation on personId=null', () => {
    const p = planAssignment(ws('w1', 'p1'), person('p1', '张三'), null)
    expect(p.ok).toBe(true)
    if (p.ok) expect(p.clear).toEqual(['w1'])
  })

  it('personId=null on an already-free workstation is a no-op', () => {
    const p = planAssignment(ws('w1', null), undefined, null)
    expect(p.ok).toBe(true)
    if (p.ok) expect(p.clear).toEqual([])
  })

  it('same-seat assignment is a no-op', () => {
    const p = planAssignment(ws('w1', 'p1'), person('p1', '张三', 'w1'), 'p1')
    expect(p.ok).toBe(true)
    if (p.ok) expect(p.clear).toEqual([])
  })

  it('rejects an occupied target with 409-shaped conflict carrying the occupant', () => {
    const p = planAssignment(ws('w2', 'p2'), person('p1', '张三', 'w1'), 'p1')
    expect(p.ok).toBe(false)
    if (!p.ok) {
      expect(p.reason).toBe('conflict')
      expect(p.conflictPersonId).toBe('p2')
    }
  })

  it('force displaces the occupant and frees both seats correctly', () => {
    // 张三 currently on w1 moves to w2, displacing p2.
    const p = planAssignment(ws('w2', 'p2'), person('p1', '张三', 'w1'), 'p1', { force: true })
    expect(p.ok).toBe(true)
    if (p.ok) {
      // w2 (displaced) and w1 (mover's old seat) both cleared; only w2 gets p1.
      expect(p.clear.sort()).toEqual(['w1', 'w2'])
      expect(p.assign).toEqual({ workstationId: 'w2', personId: 'p1' })
      expect(p.displacedPersonIds).toEqual(['p2'])
    }
  })

  it('reports missing workstation and person distinctly', () => {
    expect(planAssignment(undefined, person('p1'), 'p1').ok).toBe(false)
    const r1 = planAssignment(undefined, person('p1'), 'p1')
    const r2 = planAssignment(ws('w1', null), undefined, 'ghost')
    if (!r1.ok) expect(r1.reason).toBe('workstation-not-found')
    if (!r2.ok) expect(r2.reason).toBe('person-not-found')
  })
})
