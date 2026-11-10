/**
 * 中国法定节假日日历（国务院口径）。
 *
 * 数据：holiday-cn (https://github.com/NateScarlet/holiday-cn) 按年 JSON，
 * vendored 在 data/holidays/<year>.json —— 该项目 CI 每日自动抓取国务院
 * 公告并发布 Release，数据格式 {name, date, isOffDay}（true=放假，
 * false=调休补班）。国务院通常在前一年 11 月发布次年安排：公告后把新年份
 * JSON 提交进仓库随一次发版更新即可（运维约定见 ADR 0001）。
 *
 * 判定规则（与 CONTEXT.md「休息日」一致）：
 *  - 日历条目存在 → 以 isOffDay 为准（法定假日=休，调休补班=工作日）
 *  - 无条目 → 周六/周日=休，工作日=不上班日（周一至周五）
 *  - 数据缺失的年份 → 全年退化为仅周末规则（法定假日当工作日）；
 *    hasHolidayData() 供同步摘要产生更新警告
 */

import d2024 from '@/data/holidays/2024.json'
import d2025 from '@/data/holidays/2025.json'
import d2026 from '@/data/holidays/2026.json'

interface HolidayDay {
  name: string
  date: string
  isOffDay: boolean
}

type YearFile = { year: number; days: HolidayDay[] }

const FILES: YearFile[] = [d2024, d2025, d2026] as unknown as YearFile[]

// "yyyy-MM-dd" → 条目（含补班日——补班日也是日历事实，holidayName 需要它）。
const byDate = new Map<string, HolidayDay>()
const years = new Set<number>()
for (const f of FILES) {
  years.add(Number(f.year))
  for (const d of f.days) byDate.set(d.date, d)
}

/** 该年份是否有日历数据（决定是否要出现"数据缺失"警告）。 */
export function hasHolidayData(year: number): boolean {
  return years.has(year)
}

/** 全部已收录年份（管理页/文档展示用）。 */
export function coveredYears(): number[] {
  return [...years].sort((a, b) => a - b)
}

/** 该日期的节日/调休名称（如「国庆节」）；无日历条目时 null。 */
export function holidayName(date: string): string | null {
  return byDate.get(date)?.name ?? null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** "yyyy-MM-dd" 的星期几（0=周日…6=周六），按 Asia/Shanghai 墙钟。 */
function shanghaiDayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00+08:00`).getUTCDay()
}

/**
 * 该日期是否休息日（不需要出勤）。无效日期字符串一律视为工作日
 * （调用方传入的 date 都来自库内 "yyyy-MM-dd"，此分支只是防御）。
 */
export function isOffDay(date: string): boolean {
  if (!DATE_RE.test(date)) return false
  const entry = byDate.get(date)
  if (entry) return entry.isOffDay
  const dow = shanghaiDayOfWeek(date)
  return dow === 0 || dow === 6
}
