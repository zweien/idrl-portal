# 考勤历史与工时统计 — 设计

## 目标
本地记录每日打卡（上班 + 下班），支撑：
- 每日打卡最早 Top 10（早到榜）
- 每月工时排行（月度榜）
- 个人/全员打卡明细（逐日核对）

## 现状（grill 前的盘点）
- `fetchAttendance()` 只拉**今天**、且**只留 OnDuty**（OffDuty 在 dingtalk-admin.ts:282 被过滤）。
- 每次同步 `Person.update` 覆盖 `status` + `lastSeen`，**无历史表**。
- `lib/types.ts:72` 有废弃 `AttendanceRecord` 接口，零引用。

## 已确认决策（grill-me）
1. **采集**：OnDuty + OffDuty 都留；靠次日同步把昨天下班卡补全 → 每次同步拉**今 + 昨**。
2. **存储模型**：新建 `AttendanceRecord` 表，`@@unique([personId, date])` upsert 幂等。
3. **去重策略（双轨 + finalize）**：
   - Setting `attendance.lastFinalizedDate` 作水位线。
   - 每次 cron：若 `昨天 > lastFinalizedDate` → finalize（拉取窗口 `[前天, 今天]` 3 天防丢，覆盖 leave/trip 重算每天状态），写 AttendanceRecord，推进水位线。
   - 否则只拉今天，更新 `Person` 实时态。
   - 失败不推进水位线 → 下次自动重试。
4. **工时**：`checkOut − checkIn`（不扣午休）。`checkOut < checkIn` → null；缺卡 → null。null 不计入月度排行。
5. **统计范围（B 方案）**：榜单 + 个人明细。不做趋势图/分组/分段。
6. **权限**：榜单全员可见；个人明细默认只能查自己，admin 可查任意人。
7. **API**：拆 3 个语义端点（leaderboard × 2 view、records）+ admin backfill。
8. **保留**：永久，不做 prune（数据量小，100 人 × 365 天 ≈ 36k 行/年）。
9. **回填**：上线不回填。`lastFinalizedDate` 初始 = 上线当天 − 1。
10. **空状态**：今日榜单未首次同步时显示提示文案。
11. **应急**：admin backfill 端点（从钉钉重拉指定日），不做日常手动打卡/PATCH。
12. **页面**：独立页 `/dashboard/attendance`，侧边栏新增「考勤统计」。

## 数据模型
```prisma
model AttendanceRecord {
  id        String  @id @default(cuid())
  personId  String
  person    Person  @relation(fields: [personId], references: [id], onDelete: Cascade)
  date      String  // "2026-07-21" Asia/Shanghai
  checkIn   String? // "09:05"
  checkOut  String? // "18:32"
  status    String  // present | leave | trip | absent
  @@unique([personId, date])
  @@index([date])
  @@index([personId])
}
```
Person 加反向 relation `attendanceRecords AttendanceRecord[]`。

## 同步流程（lib/dingtalk-sync.ts + lib/dingtalk-admin.ts）
每次 `syncAttendance()`：
```
1. today = Shanghai 今天, yesterday = today-1
2. last = Setting.attendance.lastFinalizedDate ?? (yesterday)  // 首次运行
3. toFinalize = (last, yesterday] 区间内所有天
4. fetchWindow = [min(toFinalize 的最早, today-1), today]  // 最多 [前天, 今天]
5. 一次 attendance/list 覆盖 fetchWindow（保留 OnDuty + OffDuty，按 (uid, date, checkType) 分桶）
   一次 getleavestatus 覆盖 fetchWindow
   fetchTripStatus 返回 Map<uid, Map<dateStr, reason>>（按日查）
6. 对 toFinalize 中每个 (person, day): mapStatusForDay → upsert AttendanceRecord
7. 对 today: mapStatusForDay → 更新 Person.status/lastSeen/avatar（实时态）
8. Setting.attendance.lastFinalizedDate = yesterday
```

dingtalk-admin.ts 改动：
- `fetchAttendance(token, userids, fromStr, toStr)` — 日期范围参数化，返回 `Map<uid, Map<dateStr, { onDuty?, offDuty? }>>`
- `fetchLeaveStatus(token, userids, startMs, endMs)` — 区间参数化，返回 `Map<uid, Set<dateStr>>`
- `fetchTripStatus` — 返回值改为 `Map<uid, Map<dateStr, reason>>`，缓存条目保留 tripStart/tripEnd，按日判断 active
- `mapStatusForDay(uid, day, tripByDay, leaveByDay, attByDay)` — 新增按日版本

## API
```
GET  /api/attendance/leaderboard?type=today&limit=10       // 今日最早 Top N
GET  /api/attendance/leaderboard?type=monthly&limit=20     // 本月工时排行
GET  /api/attendance/records?personId=&from=&to=&page=     // 非 admin 强制 personId=自己
POST /api/attendance/backfill?date=YYYY-MM-DD              // admin 应急补拉
```

- `leaderboard`：`requireUser()`（登录即可见）。
  - `today`：`date = 今天` 且 checkIn 非空，按 checkIn 升序，limit N。
  - `monthly`：当月 1 号 ~ 今天，仅 status=present，sum(工时) 降序。
- `records`：`requireUser()`，非 admin 强制 `personId = session 关联的 personId`。分页每页 30，date 降序。
- `backfill`：`requireAdmin()`，单日强制重拉并 upsert（不推进水位线）。

## 页面（app/dashboard/attendance/）
3 个 tab：
- **榜单**：今日最早 Top 10 + 当月工时 Top 20。空状态提示「今日数据将在首次同步后更新」。
- **我的考勤**：自己的明细表（date / checkIn / checkOut / 工时 / 状态）。
- **全员明细**（admin 可见）：人员下拉 + 该人明细表。

## 工时计算（lib/attendance.ts，新建）
```ts
// 返回分钟数；null = 缺卡或跨天异常
export function computeWorkMinutes(checkIn?: string, checkOut?: string): number | null
```

## 改动文件清单
| 文件 | 改动 |
|---|---|
| `prisma/schema.prisma` | + AttendanceRecord 模型，Person 加 relation |
| `prisma/migrations/<ts>_attendance_record/` | 新 migration |
| `lib/dingtalk-admin.ts` | fetchAttendance/fetchLeaveStatus/fetchTripStatus 日期参数化 + mapStatusForDay |
| `lib/dingtalk-sync.ts` | syncAttendance 改 finalize 双轨流程 |
| `lib/attendance.ts` | 新建：工时计算 + Shanghai 日期工具 |
| `lib/types.ts` | AttendanceRecord 接口加 workMinutes（API 返回字段） |
| `lib/db/serialize.ts` | toAttendanceRecord 序列化（如需） |
| `app/api/attendance/leaderboard/route.ts` | 新建 |
| `app/api/attendance/records/route.ts` | 新建 |
| `app/api/attendance/backfill/route.ts` | 新建 |
| `app/dashboard/attendance/page.tsx` | 新建 |
| `components/attendance/leaderboard-panel.tsx` | 新建 |
| `components/attendance/my-attendance-panel.tsx` | 新建 |
| `components/attendance/all-attendance-panel.tsx` | 新建（admin） |
| `components/dashboard/nav.tsx` | +「考勤统计」入口 |
| `tests/attendance.test.ts` | 新建：工时计算、finalize 流程 |

## 不在范围
- 手动打卡 / PATCH 改记录（钉钉单一数据源 + backfill 兜底）
- 扣午休 / 分段工时 / 趋势图 / 部门分组 / CSV 导出
- 历史回填（上线日不拉过去数据）
- prune（永久保留）
