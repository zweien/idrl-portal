# 操作日志（AuditLog）设计

> 安全审计 / 追责：记录"谁、何时、做了什么、影响了谁/什么"，覆盖全部 admin 写操作。

## 1. 目的与范围

- **目的**：安全审计 / 追责（选 A）。出了问题能查到操作者与操作内容。不记字段 diff、不做 undo。
- **记录范围**：全部 admin 写操作（选 A）—— ~26 个写路由全覆盖，用统一 `logAction()` helper 在每个路由显式调用。
- **不在范围**：读操作不记；字段级 diff 不记；undo/回滚不做。

## 2. 数据模型

新建 **AuditLog** 表（与 SyncLog 独立，SyncLog 保持不动）：

```prisma
model AuditLog {
  id          String   @id @default(cuid())
  actorId     String   // User.id 或 ApiKey.id
  actorType   String   // "user" | "apikey"
  action      String   // 动作枚举，如 "user.role.change"
  targetType  String   // 对象类型，如 "user" / "news" / "backup"
  targetId    String?  // 对象 id；批量操作留空
  summary     String   // 人类可读摘要
  status      String   @default("success") // "success" | "error"
  createdAt   DateTime @default(now())

  @@index([actorId])
  @@index([targetType, targetId])
  @@index([createdAt])
}
```

- 不加外键关联 User/ApiKey（操作者可能被删/吊销后日志要保留）。
- 三个索引：按操作者查、按对象查、按时间查（分页/清理）。
- TS 镜像加到 `lib/types.ts`；`SyncLog` 保持不动。

## 3. lib/audit.ts — 统一 helper

```ts
export type ActorType = 'user' | 'apikey'
export type AuditStatus = 'success' | 'error'

interface LogActionParams {
  actorId: string
  actorType: ActorType
  action: string        // 如 "user.role.change"
  targetType: string    // 如 "user"
  targetId?: string | null
  summary: string       // 如 "将 bob 从 member 提升为 admin"
  status?: AuditStatus  // 默认 "success"
}

export async function logAction(params: LogActionParams): Promise<void>
```

- `actorFromAuth(auth)` helper：从路由已有的 `SessionData` 提取 actor。`auth.userId` 以 `apikey:` 开头 → `{ actorType: 'apikey', actorId: 去前缀 }`，否则 `{ actorType: 'user', actorId: auth.userId }`。
- 路由调一行：`await logAction({ ...actorFromAuth(auth), action, targetType, targetId, summary })`。
- fire-and-forget：`logAction` 内部不 throw（审计失败不阻断业务），失败只 `console.error`。
- action 命名规范：`<targetType>.<verb>`。

## 4. 路由接入

每个 admin 写路由在**成功路径末尾**加一行 `logAction`。失败路径可选记 `status: 'error'`（高危操作如封禁被拒才记，常规校验失败不记）。

完整 action 清单：

| 域 | action | targetType | targetId | summary 示例 |
|---|---|---|---|---|
| **users** | `user.update` | user | id | "修改用户 bob（role: member→admin）" |
| **api-keys** | `apikey.create` | apikey | id | "创建密钥 reader（scopes: news:read）" |
| | `apikey.update` | apikey | id | "修改密钥 reader（限额: 60→10）" |
| | `apikey.revoke` | apikey | id | "吊销密钥 reader" |
| **news** | `news.create` | news | id | "发布动态 NeurIPS 论文接收" |
| | `news.update` | news | id | "编辑动态 NeurIPS 论文接收" |
| | `news.delete` | news | id | "删除动态 NeurIPS 论文接收" |
| **resources** | `resource.create/update/delete` | resource | id | 类似 news |
| **personnel** | `person.create/update/delete` | person | id | 类似 |
| **categories** | `category.create/update/delete` | category | id | 类似 |
| **settings** | `settings.update` | settings | null | "修改考勤同步 cron 为 30 8 * * *" |
| **floor-layout** | `floor-layout.update` | floor-layout | null | "更新工位布局（2 楼层）" |
| | `floor-layout.import` | floor-layout | null | "xlsx 导入：分配 5 人，跳过 2 人" |
| **backup** | `backup.create` | backup | null | "手动备份（168 KB）" |
| | `backup.delete` | backup | filename | "删除备份 backup-xxx.sqlite" |
| | `backup.restore` | backup | filename | "从 backup-xxx.sqlite 恢复" |
| | `backup.upload` | backup | null | "上传文件恢复" |
| **admin-data** | `admin-data.replace` | admin-data | null | "全量替换（人员 X / 新闻 Y / 资源 Z）" |

- 摘要里尽量带上对象名/关键变更（如 role 变化、文件名、数量），让审计时不用再查库就能看懂。
- 批量操作（floor-layout、admin-data）targetId 留空，摘要里写规模。

## 5. API

新建 `app/api/audit-logs/route.ts`（requireAdmin）：

`GET /api/audit-logs` — 分页 + 筛选：

| 参数 | 说明 |
|---|---|
| `page` / `pageSize` | 分页（默认 1 / 50） |
| `actorId` | 按操作者筛选 |
| `action` | 按动作筛选（如 `user.role.change`） |
| `targetType` | 按对象类型筛选（如 `backup`） |
| `targetId` | 按对象 id 筛选 |

返回分页结构（与 news/resources 一致）+ 每条日志的 actor 名字（join User 拿用户名，join ApiKey 拿 key 名/prefix）。

## 6. Admin UI

新建 `components/admin/audit-log-panel.tsx` + admin 页新 tab「操作日志」。

表格列：

| 时间 | 操作者 | 动作 | 对象 | 摘要 |
|---|---|---|---|---|

- **操作者**：名字 + 类型 Badge（用户/apikey）。
- **动作**：Badge 着色（高危如 delete/restore/role 用红/橙，常规用灰）。
- 顶部筛选条：操作者搜索 / 动作类型下拉 / 对象类型下拉。
- 分页（上一页/下一页）。
- 与 SyncLog（调度面板里的"最近执行记录"）分开，不合并。

## 7. 保留清理

- **Setting `auditlog.keepDays`**（默认 90 天）。
- 复用 backup 调度任务的清理入口：backup job 执行时，除了 `pruneBackups(keep)`，顺带调 `pruneAuditLogs(keepDays)` 删除超期日志。
- `lib/audit.ts` 导出 `pruneAuditLogs(keepDays: number)`：`prisma.auditLog.deleteMany({ where: { createdAt: { lt: new Date(now - keepDays*86400000) } } })`。
- Admin UI：backup-panel 加"日志保留天数"输入（存 Setting、backup 任务执行时读）。

## 8. 测试

`tests/audit.test.ts`（临时 SQLite，建 AuditLog 表）：

- `actorFromAuth`：人类 session → `{ actorType: 'user', actorId }`；apikey session → `{ actorType: 'apikey', actorId 去前缀 }`。
- `logAction` 写入一行，字段完整。
- `logAction` 不 throw（审计失败不阻断业务）—— mock prisma 抛错时静默。
- `pruneAuditLogs(30)`：删 30 天前的，保留近的。
- 按 targetType/actorId 查询能命中。

## 9. 改动文件清单

| 文件 | 改动 |
|---|---|
| `prisma/schema.prisma` | + AuditLog model + 索引 |
| `prisma/migrations/<ts>_audit_log/migration.sql` | 建表 |
| `lib/types.ts` | + AuditLog / ActorType / AuditStatus 类型 |
| `lib/audit.ts` | 新建：logAction + actorFromAuth + pruneAuditLogs |
| `app/api/audit-logs/route.ts` | 新建：GET 分页 + 筛选 |
| `app/api/users/[id]/route.ts` | + logAction |
| `app/api/api-keys/route.ts` + `[id]/route.ts` | + logAction（create/update/revoke） |
| `app/api/news/route.ts` + `[id]/route.ts` | + logAction |
| `app/api/resources/route.ts` + `[id]/route.ts` | + logAction |
| `app/api/personnel/route.ts` + `[id]/route.ts` | + logAction |
| `app/api/categories/route.ts` + `[id]/route.ts` | + logAction |
| `app/api/settings/route.ts` | + logAction |
| `app/api/floor-layout/route.ts` + `import-assignments/route.ts` | + logAction |
| `app/api/backup/route.ts` + `restore/` + `upload/` | + logAction |
| `app/api/admin-data/route.ts` | + logAction（PUT） |
| `lib/scheduler.ts` | backup job 加 pruneAuditLogs |
| `components/admin/audit-log-panel.tsx` | 新建：操作日志表格 + 筛选 |
| `components/admin/backup-panel.tsx` | + 日志保留天数输入 |
| `app/dashboard/admin/page.tsx` | +「操作日志」tab |
| `tests/audit.test.ts` | 新建 |

## 10. 不在范围

- 读操作不记。
- 字段级 diff 不记。
- undo / 回滚不做。
- SyncLog 不迁移、不改。
- 操作日志不加密（依赖 DB 文件权限，与备份一致）。
