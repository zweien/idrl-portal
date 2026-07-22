# IDRL Portal · 智能数据研究实验室门户

[![CI](https://github.com/zweien/idrl-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/zweien/idrl-portal/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-160%20passed-brightgreen)](https://github.com/zweien/idrl-portal/blob/master/tests)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/license-private-lightgrey)](#-许可证)

> 实验室信息聚合门户——跟踪人员在位情况、资源链接与新闻公告，并提供可视化工位平面图管理；深度集成钉钉考勤与组织架构。

IDRL Portal 是一个为科研实验室设计的内部信息看板。它把人员考勤（钉钉同步）、工位分布、常用资源、新闻公告整合到一个中文界面里；管理员可视化管理楼层 / 区域 / 工位布局、用户权限、API 密钥、数据备份与后台调度。所有功能同时暴露为 HTTP API，可供机器 agent 接入管理（见 [API 参考](#-api-参考)）。

## ✨ 功能

### 面向成员
- **仪表盘** — 人员状态统计、工位使用概览、最新新闻（按分类聚合）、快捷资源入口
- **人员与工位** — 可交互的 SVG 工位平面图（楼层切换、缩放），点击工位查看人员详情（含打卡时间、出差/请假状态）
- **考勤** — 个人考勤记录查询、今日最早打卡 / 本月工时排行榜、考勤 CSV 导出（明细 + 汇总）
- **资源聚合** — 实验室常用工具 / 文档入口，按分类筛选，Markdown 富文本描述
- **最新动态** — 论文发表、通知、活动、荣誉成就，支持置顶、分类筛选与搜索
- **更新日志** — 侧边栏入口查看版本历史（`CHANGELOG.md` 驱动）

### 面向管理员
- **信息管理** — 新闻 / 资源 / 人员的增删改；新闻支持**草稿 / 立即发布 / 定时发布**；统一**分类体系**（Category 表，新闻 + 资源共用）
- **工位布局编辑** — 可视化编辑楼层、区域（grid / free，**顺序可调**）与工位几何；右侧实时预览；**一人一工位**约束（DB 唯一索引 + 写入校验）；支持 xlsx 批量导入工位分配
- **用户管理** — 设置登录账号角色（管理员 / 成员）、关联人员档案、**封禁**（登录 + API 双层拦截，已登录 session 即时失效）、自保护防锁死
- **API 密钥** — 颁发带 **scope** 的机器密钥（同步 / 发布 / 读取），sha256 哈希存储；每 key 可配置速率限额
- **调度设置** — node-cron 后台调度（成员同步 / 考勤同步 / 定时发布 / 自动备份），Admin UI 改周期无需重启；SyncLog 执行审计
- **备份与恢复** — 自动 / 手动 SQLite 快照（保留份数可配）、一键恢复（恢复前自动快照兜底）、上传 .sqlite 恢复、业务数据 JSON 导出
- **审计日志** — 所有管理写操作留痕（操作者 / 动作 / 目标 / 摘要），保留天数可配

### 钉钉集成
- **成员同步** — 拉取部门成员，建立 Person 档案（职位 / 邮箱 / 手机），自动关联钉钉登录账号
- **考勤同步** — 拉取当日打卡 / 请假 / 出差，按优先级映射状态（**出差 > 请假 > 在位 > 未到**），记录打卡时间与出差事由；历史日自动归档（finalize 水位线）
- **状态展示** — 红 / 琥珀 / 绿 / 蓝高对比配色，人员卡片色条 + 详情徽章

### 认证
- **Authentik SSO（内网）** — OIDC
- **钉钉扫码 OAuth（互联网）** — 新版 OAuth2
- **dev 本地登录（仅开发）** — `admin` 为管理员
- 服务端 iron-session 签名 cookie + middleware 路由保护；`User`（登录身份）与 `Person`（人员档案）分离

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16（App Router）+ React 19 |
| 语言 | TypeScript（strict，prod build 强制类型检查） |
| 样式 | Tailwind CSS v4（oklch 设计令牌） |
| UI 组件 | shadcn/ui（new-york）+ Radix + lucide-react |
| 表单 | react-hook-form + zod |
| 图表 | recharts |
| 数据库 | SQLite（better-sqlite3）+ Prisma 7 |
| 数据获取 | SWR |
| 后台调度 | node-cron（instrumentation.ts 启动注册） |
| 部署 | GitHub Actions → VPS（pm2 + nginx + certbot） |
| 包管理 | pnpm 11 |

## 🚀 快速开始

### 环境要求

- Node.js ≥ 20
- pnpm ≥ 10

### 安装与运行

```bash
pnpm install                       # 安装依赖（含 postinstall: prisma generate）
pnpm exec prisma migrate deploy    # 应用数据库 schema（首次必做）
pnpm db:seed                       # 写入示例数据（幂等）

pnpm dev                           # 启动开发服务器，默认 http://localhost:3000
```

> **首次运行提示**：`pnpm install` 只运行 `prisma generate`，不会建表或写种子数据。必须手动执行 `migrate deploy` 与 `db:seed`，否则 `/api/*` 会因表不存在而 500。

### 自定义端口

```bash
pnpm exec next dev -p 3500
```

### 环境变量

所有凭据通过 `.env` 配置（`.env` 已 gitignore）：

| 变量 | 说明 |
|---|---|
| `DATABASE_URL` | SQLite 路径，默认 `file:prisma/db.sqlite` |
| `SESSION_SECRET` | iron-session 签名密钥，≥32 字符，生产必填 |
| `AUTHENTIK_ISSUER` / `AUTHENTIK_CLIENT_ID` / `AUTHENTIK_CLIENT_SECRET` | Authentik OIDC |
| `DINGTALK_CLIENT_ID` / `DINGTALK_CLIENT_SECRET` | 钉钉扫码登录 + 服务端 API |
| `DINGTALK_DEPT_ID` | 钉钉成员同步的部门根 id |
| `DINGTALK_TRIP_PROCESS_CODE` | 京外出差审批流程码 |

## 📡 API 参考

本节面向**机器 agent** 与第三方集成。所有端点基于同源 `/api/*`，JSON 请求/响应（文件上传/下载除外）。

### 认证

平台有**双轨认证**，按端点支持的 guard 不同而接受不同凭据：

#### 1. Session cookie（人类用户）

OAuth 登录后签发 `idrl_session`（iron-session 加密，HttpOnly，7 天）。浏览器 / 能持有 cookie 的客户端使用。每次请求回查 User 行——封禁与角色变更**即时生效**。

#### 2. API key（机器 agent 推荐）

```
Authorization: Bearer idrl_<48 hex>
```

- 在 Admin UI「API 密钥」或 `POST /api/api-keys` 颁发；明文**仅在创建时返回一次**，DB 只存 sha256
- 每个 key 携带一组 **scope**，只能调用声明了对应 scope 的端点：

| Scope | 可用端点 |
|---|---|
| `sync:members` | `POST /api/dingtalk/sync-members` |
| `sync:attendance` | `POST /api/dingtalk/sync-attendance` |
| `news:read` | `GET /api/news` |
| `news:publish` | `POST / PATCH / DELETE /api/news(/:id)` |
| `resource:read` | `GET /api/resources` |
| `resource:publish` | `POST / PATCH / DELETE /api/resources(/:id)` |

- 未列出的端点（人员、用户、布局、备份、设置、日志等管理面）**只接受 admin session**，不识别 API key
- 无效 / 已吊销 / scope 不符的 key 会**静默回落**到 session 判定（不会报「key 无效」），所以 key 用错时看到的是 401/403

#### Guard 语义速查

| 端点标注 | 含义 |
|---|---|
| 🔑 `scope:xxx` | Bearer key（带该 scope）**或** admin session |
| 👤 `user` / `user+scope:xxx` | 任意登录 session；后者也接受带 scope 的 key（以 member 身份进入，admin 可见性过滤仍生效） |
| 🛡 `admin` | 仅 admin session（不支持 key） |
| 🌐 公开 | 无认证 |

### 限流

- 仅对 API key 调用生效（session 不限流）：每 key **60 次/分钟**（固定窗口，`rateLimitPerMin` 可逐 key 调整）
- 超限：**429 `{ "error": "rate limit exceeded" }`** + `Retry-After: <秒>`；agent 应按 `Retry-After` 退避

### 响应约定

| 场景 | 形态 |
|---|---|
| 列表 / 分页 | `{ "success": true, "data": { "items": [...], "total": n, "page": 1, "pageSize": 20, "totalPages": n } }` |
| 简单列表 | `{ "success": true, "data": [...] }` |
| 单对象写入（POST/PATCH） | 直接返回对象**裸 JSON**（无 `success` 包裹） |
| 删除 / 简单确认 | `{ "ok": true }` 或 `{ "success": true }` |
| 错误（所有端点统一） | `{ "error": "<message>" }` |

| 状态码 | 含义 |
|---|---|
| 400 | 校验失败（`invalid json`、字段缺失、cron 非法、一人一工位冲突等） |
| 401 | 未登录（`unauthorized`）或账号被封禁（`disabled`） |
| 403 | 已登录但权限不足（`forbidden` / `no linked person`） |
| 404 | 资源不存在 |
| 429 | API key 超限（带 `Retry-After`） |
| 500 | 服务端错误（`error` 为异常消息） |

### Agent 快速上手

```bash
BASE=https://portal.idrl.top   # 或 http://localhost:3000
KEY=idrl_xxxxxxxx              # Admin UI 颁发，勾选所需 scope

# 1) 触发钉钉成员同步
curl -X POST "$BASE/api/dingtalk/sync-members" -H "Authorization: Bearer $KEY"
# → {"total":91,"created":0,"updated":91,"linked":7}

# 2) 触发考勤同步
curl -X POST "$BASE/api/dingtalk/sync-attendance" -H "Authorization: Bearer $KEY"
# → {"total":91,"stats":{"present":30,"leave":1,"trip":2,"absent":58},"finalizedDays":1}

# 3) 发布一条动态（可定时：status=draft + publishAt=未来 ISO 时间，由调度自动发布）
curl -X POST "$BASE/api/news" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title":"论文被 SIGIR 接收","content":"……","date":"2026-07-22","status":"published","categoryId":"<分类id>"}'

# 4) 读取动态（分页 + 筛选）
curl "$BASE/api/news?page=1&pageSize=20&pinned=true&search=论文" -H "Authorization: Bearer $KEY"

# 5) 读取资源
curl "$BASE/api/resources?status=available" -H "Authorization: Bearer $KEY"

# 6) 创建 / 更新 / 删除资源（resource:publish）
curl -X POST "$BASE/api/resources" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"name":"值班管理系统","description":"实验室值班排班与调班管理","url":"https://scheduling.idrl.top","status":"available","accessLevel":"member"}'
curl -X PATCH  "$BASE/api/resources/<id>" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{"status":"maintenance"}'
curl -X DELETE "$BASE/api/resources/<id>" -H "Authorization: Bearer $KEY"
```

> 管理面操作（人员 / 布局 / 备份 / 设置 / 用户）需要 **admin session cookie**。开发环境可用 `POST /api/auth/dev-login`（`{"username":"admin"}`）换取 cookie；生产环境目前只有 OAuth 交互登录。

### 端点总览

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/api/auth/providers` | 🌐 | 查询启用了哪些登录方式 |
| GET | `/api/auth/login/authentik` · `/dingtalk` | 🌐 | 302 到 OAuth 授权页 |
| GET | `/api/auth/callback/authentik` · `/dingtalk` | 🌐 | OAuth 回调（换 session） |
| POST | `/api/auth/dev-login` | 🌐（仅非生产） | 本地登录换 session |
| POST | `/api/auth/logout` | 🌐 | 销毁 session |
| GET | `/api/auth/me` | 🌐 | 当前登录身份（未登录 `{user:null}`） |
| GET | `/api/news` | 👤 `news:read` | 动态列表（分页/筛选） |
| POST | `/api/news` | 🔑 `news:publish` | 创建动态（支持定时发布） |
| PATCH · DELETE | `/api/news/:id` | 🔑 `news:publish` | 修改 / 删除动态 |
| GET | `/api/resources` | 👤 `resource:read` | 资源列表（分页/筛选） |
| POST | `/api/resources` | 🔑 `resource:publish` | 创建资源 |
| PATCH · DELETE | `/api/resources/:id` | 🔑 `resource:publish` | 修改 / 删除资源 |
| GET | `/api/categories?kind=` | 👤 | 分类列表（news / resource 共用） |
| POST | `/api/categories` | 🛡 | 创建分类 |
| PATCH · DELETE | `/api/categories/:id` | 🛡 | 修改 / 删除分类（删除后引用置空） |
| GET | `/api/personnel` | 👤 | 人员列表（分页/状态/搜索） |
| POST | `/api/personnel` | 🛡 | 创建人员档案 |
| PATCH · DELETE | `/api/personnel/:id` | 🛡 | 修改 / 删除人员 |
| GET | `/api/users` | 🛡 | 登录账号列表 |
| PATCH | `/api/users/:id` | 🛡 | 改角色 / 关联人员 / 封禁 |
| GET · POST | `/api/api-keys` | 🛡 | 列出 / 颁发 API 密钥 |
| PATCH · DELETE | `/api/api-keys/:id` | 🛡 | 改密钥（含重置限流计数）/ 吊销 |
| GET | `/api/floor-layout` | 👤 | 楼层→区域→工位全量结构 |
| PUT | `/api/floor-layout` | 🛡 | **全量替换**布局（一人一工位校验） |
| POST | `/api/floor-layout/import-assignments` | 🛡 | xlsx 批量导入工位分配 |
| GET | `/api/attendance/records` | 👤 | 考勤记录（非 admin 仅本人） |
| GET | `/api/attendance/leaderboard` | 👤 | 今日最早打卡 / 本月工时榜 |
| POST | `/api/attendance/backfill?date=` | 🛡 | 补拉指定日考勤 |
| GET | `/api/attendance/export/detail` · `/summary` | 👤 | 考勤 CSV 导出（明细 / 汇总） |
| POST | `/api/dingtalk/sync-members` | 🔑 `sync:members` | 触发成员同步 |
| POST | `/api/dingtalk/sync-attendance` | 🔑 `sync:attendance` | 触发考勤同步 |
| GET · PATCH | `/api/settings` | 🛡 | 读 / 改配置（cron 周期等） |
| GET | `/api/sync-logs` | 🛡 | 调度执行日志 |
| GET | `/api/audit-logs` | 🛡 | 管理操作审计（真分页） |
| GET · POST · DELETE | `/api/backup` | 🛡 | 备份列表 / 手动备份 / 删除 |
| POST | `/api/backup/restore` | 🛡 | 恢复（自动先快照） |
| GET | `/api/backup/download?filename=` | 🛡 | 下载 .sqlite |
| POST | `/api/backup/upload` | 🛡 | 上传 .sqlite 并恢复 |
| GET | `/api/export` | 🛡 | 业务数据 JSON 导出（7 表） |
| GET · PUT | `/api/admin-data` | 👤 / 🛡 | 管理端聚合读 / 全量重建三表（⚠️ 级联删考勤，见下文） |

---

### 认证与会话 `/api/auth/*`

| 端点 | 说明 |
|---|---|
| `GET /api/auth/providers` | → `{ "authentik": bool, "dingtalk": bool }`（只暴露布尔，不含秘密） |
| `GET /api/auth/login/authentik` / `.../dingtalk` | 302 到授权页，种 `*_oauth_state` cookie（5 分钟）。未配置 env → 503 |
| `GET /api/auth/callback/authentik?code&state` | 成功 302 → `/dashboard`（签 session）；失败 302 → `/login?error=authentik_failed`；被封禁 → `/login?error=disabled` |
| `GET /api/auth/callback/dingtalk?authCode&state` | 同上（兼容旧参数 `code`）；error 为 `dingtalk_failed` |
| `POST /api/auth/dev-login` | **生产 404**。Body `{ "username": "admin" }` → 200 `{ "ok": true, "role": "admin"\|"member" }` + session cookie。被封禁 → 403 |
| `POST /api/auth/logout` | → `{ "ok": true }` |
| `GET /api/auth/me` | → `{ "user": null }` 或 `{ "user": { "userId", "provider", "role" } }`（读 cookie，不查 DB） |

### 动态 `/api/news`

**GET /api/news** — 👤 `user+scope:news:read`

Query（均可选）：`page=1`、`pageSize=20`、`category=<categoryId>`、`pinned=true`、`search=<匹配标题/内容>`、`includeDrafts=1`（仅 admin session 生效，否则强制只看 `published`）。

> ⚠️ `search` 只在**标题和内容**中匹配（DB 层 `contains`）；标签不参与检索——仅按标签搜索会返回空结果。

→ 分页包裹，`items: NewsItem[]`，置顶优先 + 日期倒序。

```ts
NewsItem = {
  id: string; title: string; content: string; summary?: string; author?: string
  date: string; tags?: string[]; imageUrl?: string; link?: string
  pinned?: boolean; status: 'draft' | 'published'; publishAt?: string; categoryId?: string
}
```

**POST /api/news** — 🔑 `news:publish`

Body：必填 `title, content, date`；可选 `summary, author, tags[], imageUrl, link, pinned, status, publishAt, categoryId`。
→ 201 返回 NewsItem 裸 JSON（id 服务端生成）。**定时发布**：`status:"draft"` + `publishAt:"<未来ISO>"`，由 `publish-news` 调度到点自动转为 published。

**PATCH / DELETE /api/news/:id** — 🔑 `news:publish`

PATCH Body 为 `Partial<NewsItem>`（浅合并）→ 200 NewsItem；DELETE → `{ "ok": true }`；不存在 → 404。

### 资源 `/api/resources`

**GET /api/resources** — 👤 `user+scope:resource:read`

Query：`page, pageSize, category=<categoryId>, status=available|maintenance|restricted, search`。非 admin 身份（含 API key）看不到 `accessLevel:"admin"` 的资源。

```ts
Resource = {
  id: string; name: string; description: string; url?: string; icon?: string
  status: 'available' | 'maintenance' | 'restricted'
  specs?: Record<string, string>
  accessLevel: 'public' | 'member' | 'admin'; categoryId?: string
}
```

**POST /api/resources** — 🔑 `resource:publish`：必填 `name, description, status, accessLevel`；可选 `url, icon, specs, categoryId` → 201 Resource 裸 JSON。
**PATCH / DELETE /api/resources/:id** — 🔑 `resource:publish`：语义同 news。

### 分类 `/api/categories`

- **GET** `?kind=news|resource`（省略返回全部）— 👤 → `{ success, data: Category[] }`，按 `order, name` 排序。`Category = { id, name, kind: 'news'|'resource', order }`
- **POST** — 🛡：`{ name, kind, order? }` → 201 Category
- **PATCH /:id** — 🛡：仅 `name`、`order` 可改
- **DELETE /:id** — 🛡：删除后 news/resource 的 `categoryId` 自动置空（`onDelete: SetNull`）

### 人员 `/api/personnel`

**GET** — 👤。Query：`page=1, pageSize=20, status=present|leave|trip|absent, search=<姓名/邮箱/研究方向>` → 分页包裹。

```ts
Person = {
  id: string; name: string; avatar?: string; role: string  // 钉钉职位原文，可空串
  email?: string; phone?: string; dingUserId?: string
  status: 'present' | 'leave' | 'trip' | 'absent'
  lastSeen?: string; researchAreas?: string[]
}
```

**POST** — 🛡：必填 `name, status`；`role` 必须是 string（允许空串）→ 201 Person 裸 JSON。
**PATCH / DELETE /:id** — 🛡：`Partial<Person>` 合并 / 删除 → Person 或 `{ ok: true }`；不存在 → 404。

### 用户（登录账号）`/api/users` — 全部 🛡

- **GET** → `{ success, data: [{ id, provider, externalId, role, personId?, personName, disabledAt, createdAt, updatedAt }] }`
- **PATCH /:id** Body（均可选）：`role: 'admin'|'member'`、`personId: string|null`（null 解绑）、`disabled: boolean`（true 封禁 / false 解封）。**不能修改自己的角色或封禁状态**（400）。→ `{ ok: true }`

### API 密钥 `/api/api-keys` — 全部 🛡

- **GET** → `{ success, data: [{ id, name, prefix, scopes[], lastUsedAt, createdAt, rateLimitPerMin }] }`（不含已吊销；永不返回明文）
- **POST** Body：`{ name, scopes: ApiScope[], rateLimitPerMin?: number|null }`（正整数，null = 默认 60）→ **201 `{ id, name, scopes, rateLimitPerMin, key }`；`key` 明文仅此一次，务必当场保存**
- **PATCH /:id** Body：`{ name?, scopes?, rateLimitPerMin?, resetCounter?: boolean }`（`resetCounter` 清零限流计数，新限额立即生效）→ `{ ok: true }`
- **DELETE /:id** → 软吊销（`{ ok: true }`）

### 工位布局 `/api/floor-layout`

**GET** — 👤 → `{ floors: Floor[] }`（裸 JSON，楼层/区域按 `order` 升序）：

```ts
Floor = { id, name, order, zones: Zone[] }
Zone = {
  id, name, floorId, color, order, mode: 'grid' | 'free',
  rows, cols, maxRows, maxCols, workstations: Workstation[]
}
Workstation = {
  id, name, zoneId, floorId, row, col,
  personId?: string | null,               // 省略=保留原分配；null=显式清空（仅 PUT）
  status: 'occupied' | 'empty' | 'maintenance',
  nameCustomized?: boolean
}
```

**PUT** — 🛡，**全量替换**：payload 即权威结构，DB 中不在 payload 的楼层/区域/工位全部删除，其余按 id upsert（单事务）。

- Body：`{ floors: Floor[] }`（结构同 GET）
- 保护：层级 id 重复 → 400；同一人分配到多个工位 → **400 `{ error, conflicts: [{ personId, workstationIds }] }`**
- ⚠️ **`personId` 三态语义**（机器客户端务必注意，勿把缺省字段归一化成 `null`）：
  - **省略**（字段不出现 / `undefined`）→ 保护机制：DB 中同几何位置已有人的，保留原分配
  - **`null`** → 显式清空该工位的占用
  - **字符串** → 分配给该人员
- → `{ ok: true }`

**POST /api/floor-layout/import-assignments** — 🛡，`multipart/form-data` 字段 `file`（xlsx，两列：`工位名, 姓名`，首行表头自动跳过）→ `{ assigned, skipped, warnings[] }`。按名称精确匹配；一人一工位冲突自动跳过并给 warning。

### 考勤 `/api/attendance/*`

**GET /api/attendance/records** — 👤（非 admin 强制只查本人）

Query：`personId`（admin 必传；非 admin 忽略）、`from` / `to=YYYY-MM-DD`、`page=1`、`pageSize=30（≤200）` → 分页包裹，`items` 按日期倒序：

```ts
AttendanceRecordItem = {
  id: string; date: string;                    // YYYY-MM-DD
  checkIn?: string | null; checkOut?: string | null;  // "HH:mm"
  status: 'present' | 'leave' | 'trip' | 'absent'
  workMinutes: number | null                   // 缺卡 / 跨夜异常为 null
}
```

**GET /api/attendance/leaderboard** — 👤。Query：`type=today|monthly`、`limit=10（≤100）`。两种 type 都返回 `{ success: true, data: {...} }` 包裹：
- `today` → `data: { type, date, items: [{ personId, name, checkIn }] }`（按最早打卡升序）
- `monthly` → `data: { type, from, to, items: [{ personId, name, workMinutes }] }`（本月工时降序）

**POST /api/attendance/backfill?date=YYYY-MM-DD** — 🛡：补拉指定日钉钉考勤（幂等 upsert，不推进归档水位线）→ `{ success, data: { date, upserted } }`。

**GET /api/attendance/export/detail · /summary** — 👤（非 admin 仅本人数据），**CSV 文件下载**（UTF-8 BOM，公式注入防护）：

Query：`from`、`to`（均必填，`from <= to`）、`personId`（可选）

- detail：每人每天一行 — `姓名,日期,上班,下班,工时(小时),状态`
- summary：每人一行 — `姓名,日期范围,出勤天数,出差天数,请假天数,缺卡天数,总工时(小时),平均工时(小时)`

### 钉钉同步 `/api/dingtalk/*`

**POST /api/dingtalk/sync-members** — 🔑 `sync:members`

拉取 `DINGTALK_DEPT_ID` 部门成员，按 unionid upsert Person，并关联未绑定的钉钉 User → `{ total, created, updated, linked }`（裸 JSON）。写 SyncLog（source = `api` / `manual`）。

**POST /api/dingtalk/sync-attendance** — 🔑 `sync:attendance`

今天实时刷新 + 历史日归档（推进 finalize 水位线）→ `{ total, stats: { present, leave, trip, absent }, finalizedDays, message? }`。

### 配置与日志 `/api/settings` `/api/sync-logs` `/api/audit-logs` — 全部 🛡

**GET /api/settings** → `{ success, data: { "<key>": "<value>" } }`（扁平 map）

**PATCH /api/settings** Body：任意 `{ key: string }`。先全量校验再原子写入；`cron.*` key（除 `cron.enabled*`）必须是合法 **5 字段 cron 表达式**（按**北京时间**解释）。已知 key：

| Key | 说明 | 默认 |
|---|---|---|
| `cron.members` / `cron.attendance` / `cron.publish` / `cron.backup` | 四个调度任务的周期 | 见 `lib/cron-presets.ts` |
| `cron.enabled.<job>` | `"true" / "false"` 开关 | `"true"` |
| `backup.keep` | 自动备份保留份数 | `"7"` |
| `auditlog.keepDays` | 审计日志保留天数 | `"90"` |
| `attendance.tripWorkHours` | 出差日计工时 | `"8"` |

**GET /api/sync-logs** Query：`job=sync-members|sync-attendance|publish-news|backup`、`limit=50（≤200）` → `{ success, data: [{ id, job, source: cron|api|manual, status, message, stats, createdAt }] }`

**GET /api/audit-logs** Query：`page=1, pageSize=50（≤200）, actorId, action（如 news.create）, targetType, targetId` → 真分页包裹，item 含 `actorName`、`actorType: user|apikey`、`summary`、`status`。

### 备份与导出 `/api/backup/*` `/api/export` — 全部 🛡

| 端点 | 说明 |
|---|---|
| `GET /api/backup` | → `{ success, data: { backups: [{ filename, sizeKb, createdAt, trigger: auto\|manual\|pre-restore }], keep } }` |
| `POST /api/backup` | 手动快照（better-sqlite3 在线备份，完成后按 `backup.keep` 裁剪）→ `{ success, data: BackupInfo }` |
| `DELETE /api/backup?filename=` | 删除单个（文件名严格校验防路径穿越）→ `{ success: true }` |
| `POST /api/backup/restore` | Body `{ filename }`。**恢复前自动创建 pre-restore 快照**，恢复后自动 `migrate deploy` → `{ success, data: { restored, preRestoreSnapshot } }` |
| `GET /api/backup/download?filename=` | 下载 .sqlite（`application/octet-stream`） |
| `POST /api/backup/upload` | `multipart/form-data` 字段 `file`（.sqlite）。先校验是合法备份（含 `_prisma_migrations` 表）→ 先快照再覆盖 → 同 restore 返回 |
| `GET /api/export` | 业务数据 JSON 下载（`idrl-export-<date>.json`）：`{ exportedAt, schema: "idrl-portal-business-v1", tables: { floor, zone, workstation, person, newsItem, resource, category } }`。**不含** User / ApiKey / Setting / SyncLog / AuditLog / AttendanceRecord |

### 管理聚合 `/api/admin-data`

- **GET** — 👤：一次返回 `{ personnel, news, resources }` 三张表全量（裸 JSON）。非 admin 只见 published 动态与非 admin 资源
- **PUT** — 🛡：`{ personnel: Person[], news: NewsItem[], resources: Resource[] }` 三键必填，单事务内先 `deleteMany` 再 `createMany` 重建三张表 → `{ ok: true }`

> ⚠️ **危险操作，级联影响超出三张表**：
> - 删 Person 会**级联删除其全部 AttendanceRecord**（考勤历史丢失），并把相关 `Workstation.personId` 置空（工位分配清空）
> - 若有 **User 关联到某个 Person**（`onDelete: Restrict`），整个请求直接 **500 失败**
> - 未包含在 payload 中的行全部删除
>
> 除非明确在做整库业务数据重建，否则请改用各资源的细粒度端点（`PATCH /api/personnel/:id`、`PUT /api/floor-layout` 等）。

## 📜 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动开发服务器（Turbopack） |
| `pnpm build` | 生产构建（强制类型检查） |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | ESLint 检查 |
| `pnpm test` | Vitest 测试 |
| `pnpm release <x.y.z>` | 发布新版本（见 [部署与发布](#-部署与发布)） |
| `pnpm db:generate` | 生成 Prisma Client |
| `pnpm db:migrate` | 创建并应用新 migration（开发） |
| `pnpm db:seed` | 写入示例数据（幂等） |

## 🏗 架构

### 路由

```
/                       → 重定向到 /login
/(auth)/login           → 登录页（Authentik / 钉钉 / dev 本地）
/dashboard              → 主仪表盘
/dashboard/personnel    → 人员与工位平面图
/dashboard/attendance   → 考勤（记录 / 排行 / 导出）
/dashboard/resources    → 资源聚合
/dashboard/news         → 最新动态
/dashboard/changelog    → 更新日志（CHANGELOG.md 驱动）
/dashboard/admin        → 管理后台（人员 / 用户 / 资源 / 新闻 / 分类 / 调度 / API 密钥 / 工位布局 / 备份）
```

### 数据模型

```
Floor  1—* Zone  1—* Workstation *—1 Person     （一人一工位唯一约束）
User *—1 Person                                   （登录账号 ↔ 人员档案）
Category 1—* NewsItem / Resource                  （统一分类，kind 区分）
Person 1—* AttendanceRecord                       （考勤，[personId, date] 唯一）
ApiKey / Setting / SyncLog / AuditLog             （密钥 / 配置 / 调度审计 / 操作审计）
```

Prisma schema 见 `prisma/schema.prisma`；SQLite 文件 `prisma/db.sqlite`（gitignore）；备份快照存 `prisma/backups/`（gitignore）。

### 关键模式

- **API**：`app/api/*` Route Handlers，SWR hooks 消费（`lib/api.ts`）。敏感写操作走 `requireAdmin`；机器调用走带 scope 的 API 密钥（`requireScope` / `requireUserOrScope`），见 [API 参考](#-api-参考)。
- **认证**：iron-session 签名 cookie + middleware 路由保护。`requireUser`/`requireAdmin` 每次重查 User 行，**即时**反映封禁与角色变更（不等 7 天 cookie 过期）。
- **反向代理**：所有面向外部的重定向经 `lib/request-origin.ts` 的 `getRequestOrigin()`（读 `X-Forwarded-Proto/Host`，nginx 显式覆盖防 host 头注入），不得直接用 `req.url` 拼跳转。
- **限流**：API 密钥按 key 限额（DB 行级原子计数，多实例共享），超限返回 429 + `Retry-After`。
- **调度**：`instrumentation.ts` 启动注册 node-cron；任务每分钟心跳，重读 `Setting` 表的 cron 表达式（北京时间解释），改动无需重启。
- **钉钉同步**：核心逻辑在 `lib/dingtalk-sync.ts`（route 与 scheduler 共用），access_token 缓存；`Person.role` 直接存钉钉职位原文。
- **审计**：`lib/audit.ts` 的 `logAction()` 记录全部管理写操作（fire-and-forget，不阻塞业务）；backup 任务顺带按 `auditlog.keepDays` 清理。

### 目录约定

```
app/                Next.js App Router（页面 + API 路由）
components/ui/      shadcn/ui 基础组件
components/dashboard/  仪表盘领域组件
components/admin/   管理后台组件
lib/                工具、类型、auth、API hooks、调度、限流、备份、审计
lib/db/             Prisma client、seed、序列化
prisma/             schema + migrations + 本地 sqlite + 备份目录
scripts/            release.mjs（发布脚本）
tests/              Vitest 测试
docs/deployment/    VPS 部署与发布流程文档
```

导入使用 `@/*` 路径别名。

## 🚢 部署与发布

生产部署在 VPS（pm2 + nginx + certbot，域名 `portal.idrl.top`），由 GitHub Actions 自动完成：**发布 GitHub Release → 触发 deploy workflow → VPS 拉取 tag、构建、迁移、pm2 热重载**。

发布已固化为一条命令（Conventional Commits 自动分组生成 CHANGELOG）：

```bash
pnpm release 0.1.4        # 交互式（$EDITOR 润色 changelog + 确认）
pnpm release 0.1.4 --yes  # 免交互
```

脚本自动完成：质量门禁（tsc + test）→ 版本号 bump → CHANGELOG 草稿 → 打 tag → 推送 → 创建 GitHub Release → 触发部署。

详细文档：

- [`docs/deployment/vps.md`](docs/deployment/vps.md) — VPS 初始化、secrets、nginx、证书、回滚
- [`docs/deployment/releases.md`](docs/deployment/releases.md) — 版本约定（semver + Keep a Changelog）与发布流程
- [`CHANGELOG.md`](CHANGELOG.md) — 版本历史（站内有对应页面 `/dashboard/changelog`）

## 🧪 测试

使用 Vitest（`pnpm test`），当前 22 个测试文件 / 160 个测试，覆盖：session round-trip / 篡改拒绝 / `SESSION_SECRET` fail-fast、`requireUser`/`requireAdmin`/`requireScope`（含 429/封禁/live-role）、middleware 路由保护（含反向代理 origin）、User upsert 唯一性、Workstation 一人一工位唯一约束、Category 唯一约束、API key 限流原子计数与限额校验、调度 cron 匹配（北京时间）、钉钉考勤优先级映射、定时发布时间戳归一、备份/恢复/裁剪、审计日志、考勤导出 CSV、changelog 解析。CI（`.github/workflows/ci.yml`）在 push / PR 时跑 tsc + test + build。

## 📄 许可证

私有项目，未声明开源许可证。
