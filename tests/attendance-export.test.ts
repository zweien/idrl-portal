import { describe, it, expect } from 'vitest'
import {
  exportWorkHours,
  buildDetailCsv,
  buildSummaryCsv,
  type ExportRow,
  type SummaryRow,
} from '@/lib/attendance'

describe('exportWorkHours (status-driven rules)', () => {
  it('present with full punches → span in hours', () => {
    const r = exportWorkHours('present', '09:00', '18:30')
    expect(r.hours).toBeCloseTo(9.5)
    expect(r.missingPunch).toBe(false)
  })
  it('present missing a punch → 0 hours + flagged 缺卡', () => {
    const r = exportWorkHours('present', '09:00', null)
    expect(r.hours).toBe(0)
    expect(r.missingPunch).toBe(true)
  })
  it('trip → configured fixed hours regardless of punches', () => {
    // Even if someone punched on a trip day, the fixed value wins (per spec:
    // trip fixed value is a convention, decoupled from punch length).
    const r = exportWorkHours('trip', '08:00', '10:00', 8)
    expect(r.hours).toBe(8)
    expect(r.missingPunch).toBe(false)
  })
  it('trip → uses custom configured value', () => {
    expect(exportWorkHours('trip', null, null, 4).hours).toBe(4)
    expect(exportWorkHours('trip', null, null, 0).hours).toBe(0)
  })
  it('leave with full punches → span in hours (half-day leave, still worked)', () => {
    const r = exportWorkHours('leave', '09:00', '12:30')
    expect(r.hours).toBeCloseTo(3.5)
    expect(r.missingPunch).toBe(false)
  })
  it('leave without punches → 0 hours (full leave, not counted)', () => {
    const r = exportWorkHours('leave', null, null)
    expect(r.hours).toBe(0)
    expect(r.missingPunch).toBe(false)
  })
  it('absent → 0 hours', () => {
    expect(exportWorkHours('absent', null, null).hours).toBe(0)
  })
})

describe('buildDetailCsv', () => {
  it('emits header + one row per record with status labels', () => {
    const rows: ExportRow[] = [
      { name: '付中泰', date: '2026-07-20', checkIn: '08:00', checkOut: '18:00', status: 'present' },
      { name: '王某某', date: '2026-07-20', checkIn: null, checkOut: null, status: 'trip' },
      { name: '李某某', date: '2026-07-20', checkIn: '09:00', checkOut: '12:30', status: 'leave' },
      { name: '赵某某', date: '2026-07-20', checkIn: '08:30', checkOut: null, status: 'present' },
    ]
    const csv = buildDetailCsv(rows, 8)
    const lines = csv.split('\n')
    expect(lines[0]).toContain('姓名,日期,上班,下班,工时(小时),状态')
    expect(lines[1]).toBe('付中泰,2026-07-20,08:00,18:00,10.00,在位')
    expect(lines[2]).toBe('王某某,2026-07-20,—,—,8.00,出差')
    expect(lines[3]).toBe('李某某,2026-07-20,09:00,12:30,3.50,请假')
    expect(lines[4]).toBe('赵某某,2026-07-20,08:30,—,0.00,在位(缺卡)')
  })
  it('starts with UTF-8 BOM', () => {
    const csv = buildDetailCsv([], 8)
    expect(csv.charCodeAt(0)).toBe(0xfeff)
  })
  it('escapes fields containing commas', () => {
    const rows: ExportRow[] = [
      { name: 'Last, First', date: '2026-07-20', checkIn: '08:00', checkOut: '18:00', status: 'present' },
    ]
    const csv = buildDetailCsv(rows, 8)
    expect(csv).toContain('"Last, First"')
  })
})

describe('buildSummaryCsv', () => {
  it('emits one row per person with all day-count columns', () => {
    const rows: SummaryRow[] = [
      {
        name: '付中泰',
        presentDays: 15,
        tripDays: 2,
        leaveDays: 1,
        missingPunchDays: 0,
        totalHours: 145.5,
        countedDays: 17,
      },
    ]
    const csv = buildSummaryCsv(rows, '2026-07-01', '2026-07-21')
    const lines = csv.split('\n')
    expect(lines[0]).toContain('姓名,日期范围,出勤天数,出差天数,请假天数,缺卡天数,总工时(小时),平均工时(小时)')
    expect(lines[1]).toContain('付中泰,2026-07-01~2026-07-21,15,2,1,0,145.50')
  })
  it('average = total ÷ counted days', () => {
    const rows: SummaryRow[] = [
      { name: 'A', presentDays: 10, tripDays: 2, leaveDays: 0, missingPunchDays: 0, totalHours: 96, countedDays: 12 },
    ]
    const csv = buildSummaryCsv(rows, '2026-07-01', '2026-07-31')
    // 96 / 12 = 8.00
    expect(csv).toContain('96.00,8.00')
  })
  it('zero counted days → average 0.00 (no division by zero)', () => {
    const rows: SummaryRow[] = [
      { name: 'A', presentDays: 0, tripDays: 0, leaveDays: 3, missingPunchDays: 0, totalHours: 0, countedDays: 0 },
    ]
    const csv = buildSummaryCsv(rows, '2026-07-01', '2026-07-31')
    expect(csv).toContain('0.00,0.00')
  })
  it('starts with UTF-8 BOM', () => {
    expect(buildSummaryCsv([], '2026-07-01', '2026-07-31').charCodeAt(0)).toBe(0xfeff)
  })
})
