---
name: idrl-portal-api
description: Manage the IDRL Portal (智能数据研究实验室门户) via its HTTP API — trigger DingTalk member/attendance syncs, publish/schedule/review news (incl. drafts), query attendance and personnel, and manage lab resources. Use when the user mentions IDRL portal, 实验室门户, portal.idrl.top, 同步钉钉成员/考勤, 发布/编辑/审核动态或新闻, 草稿, 考勤查询, 人员列表, 管理门户, or provides an API key starting with idrl_.
---

# IDRL Portal API

通过 HTTP API 管理 IDRL 实验室门户的信息。Base URL 默认 `https://portal.idrl.top`。

## 认证（机器调用唯一方式）

```
Authorization: Bearer idrl_<48 hex>     # API key，Admin UI「API 密钥」颁发
```

- Key 携带 scope，只能调对应端点；**无效/吊销/scope 不符的 key 会静默回落 session 判定**——表现为 401/403，先怀疑 key 或 scope
- 建议从环境变量读：`IDRL_API_KEY`、`IDRL_BASE_URL`（缺省 `https://portal.idrl.top`）

| Scope | 可用端点 |
|---|---|
| `sync:members` | `POST /api/dingtalk/sync-members` |
| `sync:attendance` | `POST /api/dingtalk/sync-attendance` |
| `news:read` | `GET /api/news`（仅已发布） |
| `news:publish` | `POST / PATCH / DELETE /api/news(/:id)`、`POST /api/news/reorder`、`POST /api/uploads` |
| `resource:read` | `GET /api/resources` |
| `resource:publish` | `POST / PATCH / DELETE /api/resources(/:id)`、`POST /api/resources/reorder` |
| `admin` | 管理门户：草稿可见（`GET /api/news?includeDrafts=1`）、考勤查询（leaderboard/records/export）、人员列表、工位查询/改派（`/api/workstations`）、分类读取、同步/审计日志 |

> `admin` scope 让 key 以**管理员身份**访问读取/审核类端点（写操作仍走各自 scope）。布局/备份/设置/用户等管理端点仍只接受 admin session（见 REFERENCE.md）。

## 快速开始

```bash
BASE="${IDRL_BASE_URL:-https://portal.idrl.top}"
KEY="$IDRL_API_KEY"

# 触发钉钉成员同步
curl -s -X POST "$BASE/api/dingtalk/sync-members" -H "Authorization: Bearer $KEY"
# → {"total":91,"created":0,"updated":91,"linked":7}

# 触发考勤同步（今日实时刷新 + 历史日归档）
curl -s -X POST "$BASE/api/dingtalk/sync-attendance" -H "Authorization: Bearer $KEY"
# → {"total":91,"stats":{"present":30,"leave":1,"trip":2,"absent":58},"finalizedDays":1}
```

## 工作流

### 发布动态（news:publish）

```bash
# 立即发布
curl -s -X POST "$BASE/api/news" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"论文被 SIGIR 接收","content":"……","date":"2026-07-22","status":"published"}'

# 定时发布：draft + 未来 publishAt，调度到点自动转 published
-d '... "status":"draft","publishAt":"2026-07-25T09:00:00.000Z" ...'

# 修改 / 删除
curl -s -X PATCH  "$BASE/api/news/<id>" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"pinned":true}'
curl -s -X DELETE "$BASE/api/news/<id>" -H "Authorization: Bearer $KEY"

# 调整置顶动态的显示顺序（仅置顶组可排序；非置顶始终日期倒序）
curl -s -X POST "$BASE/api/news/reorder" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"ids":["n-3","n-1","n-2"]}'
```

必填 `title, content, date`；可选 `summary, author, tags[], imageUrl, link, pinned, status, publishAt, categoryId`。成功返回对象**裸 JSON**（201/200），无 `success` 包裹。

正文内嵌图：`POST /api/uploads`（`-F "file=@photo.png"`）→ 返回 `{url}`，以 `![](url)` 插入 content。

### 审核草稿（admin）

```bash
# 1. 列出草稿（含定时待发布）
curl -s "$BASE/api/news?includeDrafts=1&pageSize=50" -H "Authorization: Bearer $KEY"

# 2. 查看某条完整内容（草稿或已发布均可）
curl -s "$BASE/api/news?includeDrafts=1&search=<标题关键词>" -H "Authorization: Bearer $KEY"

# 3. 审核动作：
#    通过 → 发布
curl -s -X PATCH "$BASE/api/news/<id>" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"status":"published"}'
#    驳回 → 删除
curl -s -X DELETE "$BASE/api/news/<id>" -H "Authorization: Bearer $KEY"
#    修改后再发 → PATCH 任意字段（title/content/…），最后同样置 status:"published"
```

> `news:publish` scope 可执行写动作；`admin` scope 才看得到草稿（`includeDrafts=1` 对非 admin key 无效，永远只返回已发布）。

### 考勤与人员（admin / sync:attendance）

```bash
# 同步今日+历史考勤（sync:attendance）
curl -s -X POST "$BASE/api/dingtalk/sync-attendance" -H "Authorization: Bearer $KEY"

# 今日最早打卡榜单 / 本月工时排行（admin）
curl -s "$BASE/api/attendance/leaderboard?type=today&limit=10"   -H "Authorization: Bearer $KEY"
curl -s "$BASE/api/attendance/leaderboard?type=monthly&limit=10" -H "Authorization: Bearer $KEY"

# 某人考勤明细（admin；personId 来自人员列表）
curl -s "$BASE/api/attendance/records?personId=<id>&from=2026-07-01&to=2026-07-31" -H "Authorization: Bearer $KEY"

# CSV 导出（admin）
curl -s "$BASE/api/attendance/export/detail?from=2026-07-01&to=2026-07-31"   -H "Authorization: Bearer $KEY"
curl -s "$BASE/api/attendance/export/summary?from=2026-07-01&to=2026-07-31"  -H "Authorization: Bearer $KEY"

# 人员列表（admin；可按 status 过滤，status=present|leave|trip|absent；pageSize 上限 100，超过按 totalPages 翻页）
curl -s "$BASE/api/personnel?page=1&pageSize=100&status=present" -H "Authorization: Bearer $KEY"

# 按职位（role）筛选人员状态：没有服务端 role 参数，search 也不匹配 role ——
# 只能翻页拉全量（pageSize=100 × page=1..totalPages）后本地过滤。
# role 是自由文本（钉钉「职位」同步而来），常见值：学生（统招）/学生（联培）/学生（实习）/
# 科研人员/工程师/staff/助理，可为空；前缀匹配「学生」可覆盖三类学生。
# 注意取值会随成员同步整体漂移（钉钉侧职位改动，联培曾一次 21→50），统计前先看当前分布。
curl -s "$BASE/api/personnel?page=$p&pageSize=100" -H "Authorization: Bearer $KEY"   # 循环取页 → 过滤 role

# 有工位人员的考勤（端到端，已实战验证）：工位 → 人员 → 考勤
curl -s "$BASE/api/workstations?occupied=1" -H "Authorization: Bearer $KEY"
# → 返回裸对象 {workstations:[{name=座位号, personId, personName, floorName, zoneName, …}]}
#   与 personnel 按 personId 取交集得目标人群：今日 status 用 personnel 的 status 字段，
#   打卡时段用 export/detail CSV——表头是中文（姓名/日期/上班/下班/工时/状态）且无 ID 列，
#   需按姓名关联（现库无重名；重名出现后改走逐人 records）

# 同步/审计日志（admin）
curl -s "$BASE/api/sync-logs?limit=20"  -H "Authorization: Bearer $KEY"
curl -s "$BASE/api/audit-logs?pageSize=20" -H "Authorization: Bearer $KEY"
```

### 管理资源（resource:publish）

```bash
# 创建
curl -s -X POST "$BASE/api/resources" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"值班管理系统","description":"实验室值班排班与调班管理","url":"https://scheduling.idrl.top","status":"available","accessLevel":"member"}'

# 修改 / 删除
curl -s -X PATCH  "$BASE/api/resources/<id>" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"status":"maintenance"}'
curl -s -X DELETE "$BASE/api/resources/<id>" -H "Authorization: Bearer $KEY"

# 调整分类内显示顺序（ids 必须同属一个分类；未分类自成一组）
curl -s -X POST "$BASE/api/resources/reorder" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -d '{"ids":["r-3","r-1","r-2"]}'
```

必填 `name, description, status, accessLevel`；可选 `url, icon, specs, categoryId`。返回形态与动态相同（裸 JSON / `{ok:true}`）。

### 读取（news:read / resource:read）

```bash
curl -s "$BASE/api/news?page=1&pageSize=20&pinned=true&search=论文" -H "Authorization: Bearer $KEY"
curl -s "$BASE/api/resources?status=available&category=<categoryId>" -H "Authorization: Bearer $KEY"
```

分页结构 `{success:true, data:{items, total, page, pageSize, totalPages}}`。
注意：`search` 只匹配**标题和内容**，标签不参与检索；非 admin 身份（含 news:read key）看不到草稿和 `accessLevel:"admin"` 的资源。

## 约定

- **限流**：每 key 60 次/分钟；429 `{error:"rate limit exceeded"}` + `Retry-After: <秒>`——按 header 退避重试
- **错误**：统一 `{error:"<message>"}`；401 未认证/被封禁、403 权限不足、404 不存在、400 校验失败（消息里有原因）
- **成功形态**：列表 `{success:true,data:...}`；单对象写入返回裸 JSON；删除 `{ok:true}`
- 写操作自动留审计日志（actorType=apikey，按 key 名溯源）

## 更多

完整端点契约（参数/类型/响应结构/特殊行为、session-only 端点清单）：见 [REFERENCE.md](REFERENCE.md)。
