import { describe, it, expect } from 'vitest'
import {
  parseHM,
  computeWorkMinutes,
  formatWorkHours,
  formatHM,
  shiftDate,
  monthStart,
  dateRangeDays,
} from '@/lib/attendance'

describe('parseHM', () => {
  it('parses H:mm and HH:mm', () => {
    expect(parseHM('08:01')).toBe(481)
    expect(parseHM('9:30')).toBe(570)
    expect(parseHM('23:59')).toBe(1439)
  })
  it('rejects garbage and missing', () => {
    expect(parseHM('')).toBeNull()
    expect(parseHM(null)).toBeNull()
    expect(parseHM(undefined)).toBeNull()
    expect(parseHM('8am')).toBeNull()
    expect(parseHM('24:00')).toBeNull()
    expect(parseHM('12:60')).toBeNull()
  })
})

describe('computeWorkMinutes', () => {
  it('positive span = diff in minutes', () => {
    expect(computeWorkMinutes('09:00', '18:00')).toBe(9 * 60)
    expect(computeWorkMinutes('09:05', '18:32')).toBe(9 * 60 + 27)
  })
  it('null when either punch missing', () => {
    expect(computeWorkMinutes('09:00', null)).toBeNull()
    expect(computeWorkMinutes(null, '18:00')).toBeNull()
    expect(computeWorkMinutes(undefined, undefined)).toBeNull()
  })
  it('null when checkOut <= checkIn (overnight / anomaly, no auto +24h)', () => {
    expect(computeWorkMinutes('22:00', '02:00')).toBeNull()
    expect(computeWorkMinutes('09:00', '09:00')).toBeNull()
  })
})

describe('formatWorkHours / formatHM', () => {
  it('renders as Hh Mm, dropping zero minutes', () => {
    expect(formatWorkHours(540)).toBe('9h')
    expect(formatWorkHours(567)).toBe('9h 27m')
    expect(formatWorkHours(65)).toBe('1h 5m')
  })
  it('null → dash', () => {
    expect(formatWorkHours(null)).toBe('—')
  })
  it('formatHM pads minutes', () => {
    expect(formatHM(540)).toBe('9:00')
    expect(formatHM(567)).toBe('9:27')
  })
})

describe('date helpers', () => {
  it('shiftDate moves by N days, crossing month boundaries', () => {
    expect(shiftDate('2026-07-21', -1)).toBe('2026-07-20')
    expect(shiftDate('2026-07-01', -1)).toBe('2026-06-30')
    expect(shiftDate('2026-07-31', 1)).toBe('2026-08-01')
  })
  it('monthStart returns yyyy-MM-01', () => {
    expect(monthStart('2026-07-21')).toBe('2026-07-01')
    expect(monthStart('2026-12-15')).toBe('2026-12-01')
  })
  it('dateRangeDays is inclusive and ordered', () => {
    expect(dateRangeDays('2026-07-19', '2026-07-21')).toEqual(['2026-07-19', '2026-07-20', '2026-07-21'])
  })
  it('dateRangeDays empty when end < start', () => {
    expect(dateRangeDays('2026-07-21', '2026-07-19')).toEqual([])
  })
  it('dateRangeDays single day when equal', () => {
    expect(dateRangeDays('2026-07-21', '2026-07-21')).toEqual(['2026-07-21'])
  })
})
