import { describe, it, expect } from 'vitest'
import { mapStatus, parseTripWindow, type AttendanceDetail } from '@/lib/dingtalk-admin'

describe('parseTripWindow (trip form → date range + reason)', () => {
  it('parses 京内 format (开始/结束时间 JSON array field)', () => {
    const form = [
      { name: '开始时间,结束时间', value: JSON.stringify(['2026-07-18 09:00', '2026-07-18 18:00']) },
      { name: '外出事由', value: '走访合作单位' },
    ]
    const w = parseTripWindow(form)
    expect(w.tripStart).not.toBeNull()
    expect(w.tripEnd).not.toBeNull()
    expect(w.tripEnd! - w.tripStart!).toBe(9 * 60 * 60 * 1000) // 9h
    expect(w.reason).toBe('走访合作单位')
  })

  it('parses 京外 format (itinerary table with startTime/endTime cells)', () => {
    const itinerary = [{
      props: { bizAlias: 'itinerary' },
      value: JSON.stringify([{
        rowValue: [
          { bizAlias: 'startTime', value: '2026-07-18 08:00' },
          { bizAlias: 'endTime', value: '2026-07-20 20:00' },
          { bizAlias: 'destination', value: '上海' },
        ],
      }]),
    }, {
      props: { bizAlias: 'reason' },
      value: '参加国际会议',
    }]
    const form = [{ name: '商旅出差', value: JSON.stringify(itinerary) }]
    const w = parseTripWindow(form)
    expect(w.tripStart).not.toBeNull()
    expect(w.tripEnd).not.toBeNull()
    expect(w.reason).toBe('参加国际会议')
  })

  it('returns null window when no parseable dates', () => {
    const form = [{ name: '备注', value: '一些无关文本' }]
    const w = parseTripWindow(form)
    expect(w.tripStart).toBeNull()
    expect(w.tripEnd).toBeNull()
  })
})

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
