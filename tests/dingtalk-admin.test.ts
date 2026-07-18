import { describe, it, expect } from 'vitest'
import { mapStatus, type AttendanceDetail } from '@/lib/dingtalk-admin'

describe('mapStatus (attendance priority: trip > leave > present > absent)', () => {
  const trip = new Map<string, string>([['u_trip', '京外出差']])
  const leave = new Set<string>(['u_leave'])
  const att = (timeResult: string): Map<string, AttendanceDetail> =>
    new Map([['u_present', { timeResult, checkTime: '08:01' }]])

  it('trip wins over everything', () => {
    // u_trip is in tripMap; also give it a punch + leave to confirm priority.
    const m = new Map([['u_trip', { timeResult: 'Normal', checkTime: '08:01' }]])
    const l = new Set(['u_trip'])
    expect(mapStatus('u_trip', trip, l, m)).toBe('trip')
  })

  it('leave wins over present', () => {
    const m = new Map([['u_leave', { timeResult: 'Normal', checkTime: '08:01' }]])
    expect(mapStatus('u_leave', trip, leave, m)).toBe('leave')
  })

  it('any real OnDuty punch (incl. Late/Early) → present', () => {
    for (const tr of ['Normal', 'Late', 'Early', 'SeriousLate']) {
      expect(mapStatus('u_present', trip, leave, att(tr))).toBe('present')
    }
  })

  it('NotSigned / Absenteeism / no record → absent', () => {
    expect(mapStatus('u_present', trip, leave, att('NotSigned'))).toBe('absent')
    expect(mapStatus('u_present', trip, leave, att('Absenteeism'))).toBe('absent')
    expect(mapStatus('u_unknown', trip, leave, new Map())).toBe('absent')
  })
})
