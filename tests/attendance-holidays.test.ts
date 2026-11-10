import { describe, it, expect } from 'vitest'
import { isOffDay, holidayName, hasHolidayData, coveredYears } from '@/lib/attendance-holidays'

// 休息日判定：国务院口径日历（holiday-cn vendored JSON）+ 周末规则回退。
// 测试日期全部来自 data/holidays/2026.json 的真实条目。

describe('isOffDay (法定假日 / 周末 / 调休补班)', () => {
  it('法定假日 = 休，且能给出名称', () => {
    expect(isOffDay('2026-01-01')).toBe(true)
    expect(holidayName('2026-01-01')).toBe('元旦')
    expect(isOffDay('2026-10-01')).toBe(true)
    expect(holidayName('2026-10-01')).toBe('国庆节')
  })

  it('调休补班日 = 工作日（即使落在周日）', () => {
    // 2026-01-04 与 2026-09-20 都是日历明示的补班日（09-20 是周日）——
    // 周末规则必须让位于日历条目。
    expect(isOffDay('2026-01-04')).toBe(false)
    expect(isOffDay('2026-09-20')).toBe(false)
    expect(holidayName('2026-09-20')).toBe('国庆节')
  })

  it('普通周末（无日历条目）= 休', () => {
    // 2026-11-08 是周六，2026-11-09 是周日，都不在日历里。
    expect(isOffDay('2026-11-08')).toBe(true)
    expect(isOffDay('2026-11-09')).toBe(true)
    expect(holidayName('2026-11-08')).toBeNull()
  })

  it('普通工作日（无日历条目）= 不休', () => {
    expect(isOffDay('2026-11-10')).toBe(false) // 周二
  })

  it('数据缺失年份退化为仅周末规则', () => {
    // 2027 安排在编写时尚未发布（每年 11 月公告）——周末照判，工作日照常，
    // 法定假日此时无法识别（同步摘要会警告）。2027-01-03/04 是周六/周日。
    expect(hasHolidayData(2027)).toBe(false)
    expect(isOffDay('2027-01-03')).toBe(true) // 周六
    expect(isOffDay('2027-01-04')).toBe(true) // 周日
    expect(isOffDay('2027-01-05')).toBe(false) // 周一
  })

  it('无效日期字符串一律视为工作日（防御）', () => {
    expect(isOffDay('')).toBe(false)
    expect(isOffDay('not-a-date')).toBe(false)
    expect(isOffDay('2026-13-99')).toBe(false)
  })

  it('coveredYears 覆盖已收录年份', () => {
    expect(coveredYears()).toEqual(expect.arrayContaining([2024, 2025, 2026]))
    expect(hasHolidayData(2026)).toBe(true)
  })
})
