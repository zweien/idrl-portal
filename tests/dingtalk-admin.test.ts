import { describe, it, expect } from 'vitest'
import { mapStatusForDay, parseTripWindow, type DayAttendance, type TripStatus } from '@/lib/dingtalk-admin'

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

describe('mapStatusForDay (per-day priority: trip > leave > present > absent)', () => {
  const DAY = '2026-07-21'
  const tripStatus = (days: string[], reason?: string): TripStatus => ({ days: new Set(days), reason })
  const trip = new Map<string, TripStatus>([['u_trip', tripStatus([DAY], '京外出差')]])
  const leave = new Map<string, Set<string>>([['u_leave', new Set([DAY])]])
  // att: Map<uid, Map<day, DayAttendance>>
  const attDay = (timeResult: string): Map<string, Map<string, DayAttendance>> => {
    const inner = new Map<string, DayAttendance>([[DAY, { onDuty: { timeResult, checkTime: '08:01' } }]])
    return new Map([['u_present', inner]])
  }

  it('trip wins over everything', () => {
    const m = attDay('Normal')
    const l = new Map([['u_trip', new Set([DAY])]])
    expect(mapStatusForDay('u_trip', DAY, trip, l, m).status).toBe('trip')
  })

  it('trip uses .days set (not the bare value)', () => {
    // Confirm the new TripStatus shape works via the dedicated accessor.
    const t = new Map([['u_x', tripStatus([DAY])]])
    expect(mapStatusForDay('u_x', DAY, t, new Map(), new Map()).status).toBe('trip')
  })

  it('leave wins over present', () => {
    const m = attDay('Normal')
    expect(mapStatusForDay('u_leave', DAY, trip, leave, m).status).toBe('leave')
  })

  it('any real OnDuty punch (incl. Late/Early) → present', () => {
    for (const tr of ['Normal', 'Late', 'Early', 'SeriousLate']) {
      expect(mapStatusForDay('u_present', DAY, trip, leave, attDay(tr)).status).toBe('present')
    }
  })

  it('NotSigned / Absenteeism / no record → absent', () => {
    expect(mapStatusForDay('u_present', DAY, trip, leave, attDay('NotSigned')).status).toBe('absent')
    expect(mapStatusForDay('u_present', DAY, trip, leave, attDay('Absenteeism')).status).toBe('absent')
    expect(mapStatusForDay('u_unknown', DAY, trip, leave, new Map()).status).toBe('absent')
  })

  it('surfaces onDuty + offDuty punches on present', () => {
    const inner = new Map<string, DayAttendance>([
      [DAY, {
        onDuty: { timeResult: 'Normal', checkTime: '09:05' },
        offDuty: { timeResult: 'Normal', checkTime: '18:32' },
      }],
    ])
    const m = new Map([['u_present', inner]])
    const r = mapStatusForDay('u_present', DAY, trip, leave, m)
    expect(r.status).toBe('present')
    expect(r.onDuty?.checkTime).toBe('09:05')
    expect(r.offDuty?.checkTime).toBe('18:32')
  })

  it('preserves punches even when leave wins (partial-day leave)', () => {
    // Someone punched in the morning, then took a half-day leave. The leave
    // status wins for the day, but the punches must NOT be discarded (Codex
    // P2): they're real attendance data for the punch history / work minutes.
    const inner = new Map<string, DayAttendance>([
      [DAY, {
        onDuty: { timeResult: 'Normal', checkTime: '09:00' },
        offDuty: { timeResult: 'Normal', checkTime: '12:30' },
      }],
    ])
    const m = new Map([['u_leave', inner]])
    const r = mapStatusForDay('u_leave', DAY, trip, leave, m)
    expect(r.status).toBe('leave')
    expect(r.onDuty?.checkTime).toBe('09:00')
    expect(r.offDuty?.checkTime).toBe('12:30')
  })

  it('preserves punches even when trip wins (partial-day trip)', () => {
    const inner = new Map<string, DayAttendance>([
      [DAY, { onDuty: { timeResult: 'Normal', checkTime: '08:50' } }],
    ])
    const m = new Map([['u_trip', inner]])
    const r = mapStatusForDay('u_trip', DAY, trip, leave, m)
    expect(r.status).toBe('trip')
    expect(r.onDuty?.checkTime).toBe('08:50')
  })
})
