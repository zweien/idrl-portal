# IDRL Portal API — 完整契约参考

Base URL：生产 `https://portal.idrl.top`；本地 dev `http://localhost:3500`（或 3000）。
认证：`Authorization: Bearer idrl_<key>`。错误一律 `{ "error": "<message>" }`。

## 可用端点（API key）

### POST /api/dingtalk/sync-members — scope `sync:members`

无参数/Body。拉取钉钉部门成员，按 unionid upsert Person 档案，并关联未绑定的钉钉登录账号。

→ 200 裸 JSON：`{ "total": n, "created": n, "updated": n, "linked": n }`

- 500 `{error}`（钉钉侧失败等）；写 SyncLog（job=`sync-members`）
- 新 Person 初始 `status:"absent"`；钉钉职位非空才覆盖 `role`

### POST /api/dingtalk/sync-attendance — scope `sync:attendance`

无参数/Body。今天实时刷新（更新 Person.status/lastSeen + upsert 今日 AttendanceRecord）+ 历史日归档（推进 finalize 水位线）。

→ 200 裸 JSON：`{ "total": n, "stats": {"present":n,"leave":n,"trip":n,"absent":n}, "finalizedDays": n, "message"?: string }`

- 无成员时返回 `total:0` + message 提示先跑成员同步（仍 200）
- 状态优先级：出差 trip > 请假 leave > 在位 present > 未到 absent

### GET /api/news — scope `news:read` 或 `admin`（或任意登录 session）

Query（均可选）：

| 参数 | 说明 |
|---|---|
| `page` / `pageSize` | 默认 1 / 20 |
| `category` | 精确匹配 categoryId |
| `pinned` | 仅 `true` 生效 |
| `search` | 只匹配**标题和内容**（标签不检索） |
| `includeDrafts` | admin session 或带 `admin` scope 的 key + `=1` 生效；`news:read` key 永远看不到草稿 |

→ 200：`{ "success": true, "data": { "items": NewsItem[], "total", "page", "pageSize", "totalPages" } }`，置顶优先（置顶组内 order 升序）+ 日期倒序。

```ts
NewsItem = {
  id: string; title: string; content: string; summary?: string; author?: string
  date: string; tags?: string[]; imageUrl?: string; link?: string
  pinned?: boolean; order?: number // 手动顺序，仅置顶组内生效
  status: 'draft' | 'published'
  publishAt?: string; categoryId?: string
}
```

### POST /api/news — scope `news:publish`

Body：必填 `title, content, date`；可选 `summary, author, tags[], imageUrl, link, pinned, status, publishAt, categoryId`。

→ 201 NewsItem 裸 JSON（id 服务端生成）。**定时发布**：`status:"draft"` + `publishAt:"<未来UTC ISO>"`，`publish-news` 调度到点自动转 published。

错误：400 `invalid json` / `title, content, date required`。

### PATCH / DELETE /api/news/:id — scope `news:publish`

- PATCH：`Partial<NewsItem>` 浅合并 → 200 NewsItem；404 `not found`。置顶（`pinned:false→true`）未传 `order` 时自动排到置顶组末尾
- DELETE → 200 `{ "ok": true }`；404

### POST /api/news/reorder — scope `news:publish`

Body `{ "ids": string[] }`：置顶组的完整有序 id 列表（全部存在、均置顶、无重复）→ 按位置重写 `order` 为 0..n-1 → 200 `{ "ok": true }`。
排序语义：置顶优先，置顶组内 `order` 升序（日期倒序兜底）；非置顶永远按日期倒序。`order` 字段随 NewsItem 返回。

### POST /api/uploads — scope `news:publish`

上传动态内嵌图片。multipart `file` 字段，仅 jpg/jpeg/png/gif/webp（按**魔数**校验），≤5MB。

→ 201 `{ "url": "/api/uploads/<ts>-<rand>.<ext>", "filename", "mime" }`。
把 `url` 以 `![](url)` 插入动态正文即可显示；图片通过 `GET /api/uploads/:path`（**公开**，无需 key）读取。

```bash
curl -X POST "$BASE/api/uploads" -H "Authorization: Bearer $KEY" \
  -F "file=@/path/to/photo.png"
# → {"url":"/api/uploads/1690000000000-a1b2c3d4.png", ...}
```

注意：图片存于 VPS 项目根 `uploads/`（gitignore），无 DB 记录；删除动态不自动删图。

### GET /api/resources — scope `resource:read`（或任意登录 session）

Query：`page, pageSize, category=<categoryId>, status=available|maintenance|restricted, search`（名称/描述）。API key 以 member 身份进入——**看不到 `accessLevel:"admin"` 的资源**。

→ 200 分页包裹，`items: Resource[]`：

```ts
Resource = {
  id: string; name: string; description: string; url?: string; icon?: string
  status: 'available' | 'maintenance' | 'restricted'
  specs?: Record<string, string>
  accessLevel: 'public' | 'member' | 'admin'; categoryId?: string
}
```

### POST /api/resources — scope `resource:publish`

Body：必填 `name, description, status, accessLevel`；可选 `url, icon, specs, categoryId`。

→ 201 Resource 裸 JSON（id 服务端生成）。错误：400 `invalid json` / 必填缺失消息。

### PATCH / DELETE /api/resources/:id — scope `resource:publish`

- PATCH：`Partial<Resource>` 浅合并 → 200 Resource；404 `not found`。改 `categoryId` 未传 `order` 时自动排到新分类末尾
- DELETE → 200 `{ "ok": true }`；404

### POST /api/resources/reorder — scope `resource:publish`

Body `{ "ids": string[] }`：同一分类的完整有序 id 列表（未分类资源自成一组；全部存在、无重复）→ 按位置重写 `order` 为 0..n-1 → 200 `{ "ok": true }`。
排序语义：按分类分组（未分类最后），分类内 `order` 升序（创建先后兜底）。`order` 字段随 Resource 返回。

## Admin-scope 端点（scope `admin`）

带 `admin` scope 的 key 以**管理员身份**访问以下读取/审核类端点（session 侧不变：普通登录用户行为照旧）。

### GET /api/personnel — `admin`

分页人员列表。Query：`page, pageSize, status=present|leave|trip|absent, search`。

- `search` 只匹配**姓名/邮箱/研究方向**（researchAreas），不匹配职位（role）和手机
- `pageSize` 静默钳制到 **100**（`MAX_PAGE_SIZE`）；总人数超 100 时必须按 `totalPages` 翻页取全
- item 字段：`id, name, role, phone, dingUserId, status, avatar, loginDisabled, offboarded`（email/researchAreas 有值才出现）
- `role` 是自由文本（钉钉「职位」字段同步而来，如 `学生（统招）`/`学生（联培）`/`学生（实习）`/`科研人员`/`工程师`，可为空）——**按职位筛选无服务端参数**，翻页拉全量后本地过滤（前缀匹配「学生」覆盖三类学生）

### GET /api/categories — `admin`

`?kind=news|resource` → `{success:true, data:{items: Category[]}}`，按 `order` 升序。

### GET /api/attendance/leaderboard — `admin`

`?type=today|monthly&limit=N`（默认 today/10，上限 100）。
- `today`：今日最早打卡，`items: [{personId, name, checkIn:"HH:mm"}]`
- `monthly`：本月累计工时，`items: [{personId, name, workMinutes}]`

### GET /api/attendance/records — `admin`

`?personId=&from=YYYY-MM-DD&to=YYYY-MM-DD&page=&pageSize=` → 分页 `AttendanceRecordItem[]`（checkIn/checkOut/status/workMinutes）。admin 可查任何人；key 带 `admin` 等同 admin。

### GET /api/attendance/export/detail | /summary — `admin`

`?from=&to=` → CSV（`text/csv`，附件头）。detail=逐人逐日，summary=按人汇总（含出差工时 `readTripWorkHours`）。admin scope key 可导出全量。

### GET /api/sync-logs — `admin`

`?job=sync-members|sync-attendance|publish-news&limit=50` → 最近后台任务日志（新→旧），`items: [{id, job, status, message?, createdAt, durationMs?}]`。

### GET /api/audit-logs — `admin`

`?page, pageSize, actorId, action, targetType, targetId` → 分页管理操作审计（写操作自动留痕，actor 为 User 名或 ApiKey 名）。

### GET /api/workstations — `admin`

`?personId=dt-…`（查某人的工位，0/1 行）｜`?floorId=`（按层）｜`?free=1`（仅空位）→
`{workstations: [{id, name, floorId, floorName, zoneId, zoneName, row, col, status, personId, personName}]}`。

### PUT /api/workstations/assignment — `admin`

Body `{workstationId, personId, force?}`：

- `personId: null` → 清空该工位
- `personId: "dt-…"` → 分配；该人**原工位自动释放**（人移动，不占两座）
- 目标已被他人占用 → `409 {error, reason:"conflict", conflict:{personId}}`；`force:true` 顶替原占用者（其座位清空）
- 未知工位/人员 → `404 {reason:"workstation-not-found"|"person-not-found"}`

成功 → `{ok:true, summary, workstation:{id,name,personId,personName}}`。操作写入审计日志（`workstation.assign`）。

## 响应与错误约定

| 场景 | 形态 |
|---|---|
| 分页列表 | `{success:true, data:{items,total,page,pageSize,totalPages}}` |
| 单对象写入（POST/PATCH） | 对象**裸 JSON** |
| 删除 | `{ "ok": true }` |
| 错误 | `{ "error": "<message>" }` |

| 状态码 | 含义 | 处理 |
|---|---|---|
| 400 | 校验失败 | 读 error 消息修参数 |
| 401 | `unauthorized` 未认证 / `disabled` 被封 | 检查 key 是否带对、是否吊销（key 无效会静默回落 session → 也表现为 401） |
| 403 | `forbidden` 权限不足 | 检查 key 的 scope 是否覆盖该端点 |
| 404 | 资源不存在 | 核对 id |
| 429 | 限流 | 按 `Retry-After` 秒数退避后重试 |
| 500 | 服务端错误 | error 为异常消息；同步类端点可查 SyncLog |

## Session-only 端点（API key 不可用）

以下端点只接受 admin session cookie（浏览器 OAuth 登录；开发环境可 `POST /api/auth/dev-login` `{"username":"admin"}` 换 cookie，生产 404）。`admin` scope key 也**不可用**——这些仍是纯 UI 管理端点：

- 人员写：`POST /api/personnel`、`PATCH/DELETE /api/personnel/:id`
- 用户：`GET /api/users`、`PATCH /api/users/:id`
- 分类写：`POST/PATCH/DELETE /api/categories(/:id)`（分类**读取**已支持 `admin` key）
- 工位布局：`GET/PUT /api/floor-layout`、`POST /api/floor-layout/import-assignments`
- 工位管理（admin）：查某人工位 `GET /api/workstations?personId=…`；改派 `PUT /api/workstations/assignment`（body `{workstationId, personId|null, force?}`——换工位自动释放原座，占用冲突 409 可 `force` 顶替）
- 配置：`GET/PATCH /api/settings`
- 备份：`GET/POST/DELETE /api/backup`、`POST /api/backup/restore`、`GET /api/backup/download`、`POST /api/backup/upload`
- 导出：`GET /api/export`（业务 7 表 JSON）

## 限流细节

- 仅 API key 调用受限：每 key 固定 60 秒窗口，默认 60 次/分钟（颁发 key 时可配 `rateLimitPerMin`）
- 超限：429 + `Retry-After: <到窗口重置的秒数>`；被限流的请求不计入使用量
- 推荐退避：`sleep $Retry-After` 后原样重试一次；连续 429 则检查调用频率

## 排查清单

1. 401 → key 没带上？`Bearer ` 前缀（注意空格）？key 已被吊销？
2. 403 → key 的 scope 不含该端点？（端点其实是 session-only？）
3. 读不到某条数据 → key 是 member 身份：草稿、`accessLevel:admin` 资源不可见
4. 同步结果异常 → `GET /api/sync-logs?job=sync-attendance` 查执行日志（需 admin session）
