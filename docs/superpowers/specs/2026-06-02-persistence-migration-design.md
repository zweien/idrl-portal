# 持久化迁移（Persistence Migration）设计

- **日期**：2026-06-02
- **范围**：把目前以 `lib/mock-data.ts` 为唯一来源的内存态数据（楼层/区域/工位/人员/资源/新闻）迁移到 SQLite + Prisma，引入手动保存语义与"未保存改动"提示。
- **不在范围内**：用户认证持久化（继续用 `sessionStorage`）、文件/附件上传、跨设备冲突合并、操作历史/审计日志。

---

## 背景与动机

当前所有数据均来自 `lib/mock-data.ts`：

- 13 个文件直接 `import` mock 数据，其中包括 3 个 API 路由（`/api/personnel`、`/api/news`、`/api/resources`）和所有 dashboard 页面
- 两个编辑入口（`/dashboard/admin` 与 `/dashboard/admin/floor-layout`）的修改只落在组件 `useState`，**刷新即丢失**
- 顶部"保存配置"按钮目前是纯 UI 占位，无 `onClick` 绑定

加上最近完成的"自由布局区域"特性后，用户在 floor-layout 上花的功夫（拖刷生成几十个工位、手工重命名）期望能跨会话保留——所以这次迁移的首要驱动是**让自由布局的成果能落库**。

---

## 设计决策（已确认）

| # | 决策点 | 选择 |
|---|---|---|
| 1 | 存储方案 | SQLite + Prisma（本地文件 DB，单实例零外部依赖） |
| 2 | 持久化范围 | 所有 mock 数据（floor/zone/workstation + person/news/resource） |
| 3 | 保存触发 | 手动按《保存》按钮提交 |
| 4 | 首次启动数据 | Seed 现有 mock 进 DB，体验与现状一致 |
| 5 | 保存粒度 | 按页面分别保存：admin 页一组、floor-layout 页一组 |
| 6 | 未保存离开提示 | `beforeunload` 拦截刷新/关闭 + 可见红色 badge 提示 |
| 7 | Person ↔ Workstation 关联 | 保留现状：Workstation.personId 可选外键 |
| 8 | API 写入语义 | 整体替换式 PUT（事务里 `deleteMany` + `createMany`） |
| 9 | 客户端数据层 | SWR hooks 封装 GET + mutate |
| 10 | `lib/mock-data.ts` 命运 | 文件保留作为 seed 来源，运行时不再被 import |

---

## § 1 · 技术栈与基础设施

### 新增依赖

```jsonc
// package.json
{
  "dependencies": {
    "@prisma/client": "^5.x",
    "swr": "^2.x"
  },
  "devDependencies": {
    "prisma": "^5.x"
  },
  "scripts": {
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev --name init",
    "db:seed": "tsx lib/db/seed.ts",
    "postinstall": "prisma generate",
    "predev": "prisma generate"
  }
}
```

`tsx` 用于直接执行 TS 种子脚本（也可用 `ts-node`，看团队习惯；推荐 `tsx` 因为零配置）。

### 文件布局

```
prisma/
  schema.prisma
  migrations/             # prisma migrate 生成
lib/
  db/
    index.ts              # PrismaClient 单例
    seed.ts               # 从 mock-data.ts 灌库（仅当表为空）
  api.ts                  # SWR hooks + fetch 辅助
  mock-data.ts            # 保留，但运行时不再 import
```

### DB 文件位置与 .gitignore

- SQLite 文件：`prisma/db.sqlite`（由 Prisma 默认路径）
- `db.sqlite` 与 `db.sqlite-journal` 都加入 `.gitignore`

### PrismaClient 单例（`lib/db/index.ts`）

避免 Next.js 热重载时产生多个连接实例：

```ts
import { PrismaClient } from '@prisma/client'

declare global {
  var prisma: PrismaClient | undefined
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') global.prisma = prisma
```

---

## § 2 · 数据模型（Prisma schema）

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./db.sqlite"
}

model Floor {
  id           String         @id
  name         String
  order        Int
  zones        Zone[]
  workstations Workstation[]
}

model Zone {
  id        String        @id
  name      String
  floorId   String
  floor     Floor         @relation(fields: [floorId], references: [id], onDelete: Cascade)
  color     String
  order     Int
  mode      String         // 'grid' | 'free'
  rows      Int
  cols      Int
  maxRows   Int
  maxCols   Int
  workstations Workstation[]
}

model Workstation {
  id             String   @id
  name           String
  zoneId         String
  zone           Zone     @relation(fields: [zoneId], references: [id], onDelete: Cascade)
  floorId        String
  floor          Floor    @relation(fields: [floorId], references: [id], onDelete: Cascade)
  row            Int
  col            Int
  personId       String?
  person         Person?  @relation(fields: [personId], references: [id], onDelete: SetNull)
  status         String
  nameCustomized Boolean  @default(false)
}

model Person {
  id           String        @id
  name         String
  employeeId   String?
  position     String?
  status       String         // attendance status
  avatar       String?
  workstations Workstation[]
}

model NewsItem {
  id          String   @id
  title       String
  content     String?
  category    String
  publishedAt DateTime
  source      String?
  url         String?
  important   Boolean  @default(false)
}

model Resource {
  id          String   @id
  name        String
  url         String
  category    String
  description String?
}
```

### 级联策略

| 操作 | 影响 |
|---|---|
| 删 Floor | 自动删其下 Zone 与 Workstation |
| 删 Zone | 自动删其下 Workstation |
| 删 Person | 该 Person 占用的 Workstation 的 `personId` 置 NULL（工位本身保留） |
| 删 Workstation | 无下游 |

### 类型映射（Prisma ↔ TypeScript）

`lib/types.ts` 中的现有类型保持不变（`Floor / Zone / NewWorkstation / Person / NewsItem / Resource`）。Prisma 查询返回的对象通过 `lib/api.ts` 中的序列化函数映射成现有类型——避免在组件层看到 Prisma 特殊字段（如 `DateTime` → ISO string）。

---

## § 3 · API 路由

### 新增（4 个）

#### `GET /api/floor-layout`

返回完整的楼层树（含 zones 与 workstations）：

```ts
// 响应
{
  floors: [
    {
      id, name, order,
      zones: [
        {
          id, name, floorId, color, order,
          mode, rows, cols, maxRows, maxCols,
          workstations: [
            { id, name, zoneId, floorId, row, col, personId, status, nameCustomized }
          ]
        }
      ]
    }
  ]
}
```

#### `PUT /api/floor-layout`

整体替换式写入。请求体与 GET 响应结构一致（去掉嵌套只保留数组）。

实现要点：
- 用 `prisma.$transaction` 包裹
- 顺序：`deleteMany({}) workstations → deleteMany({}) zones → deleteMany({}) floors → createMany floors → createMany zones → createMany workstations`
- 删 floor 会级联删 zone 和 workstation，但显式 deleteMany 让顺序更清晰
- 请求体最大 ~200KB（mock 数据约 50KB，含工位完整定义），SQLite 本地写 < 100ms
- 成功返回 `{ ok: true }`，失败返回 4xx/5xx + `{ error: string }`

#### `GET /api/admin-data`

```ts
{ personnel: Person[], news: NewsItem[], resources: Resource[] }
```

#### `PUT /api/admin-data`

整体替换 person + news + resource 三表，事务执行：

```
deleteMany person → deleteMany newsItem → deleteMany resource → createMany each
```

注意：删 Person 会触发 Workstation.personId 置 NULL（级联策略），这是预期行为——如果 admin 在保存人员前先删了某 Person，对应工位会变成未占用。

### 改造现有（3 个）

#### `GET /api/personnel`、`/api/news`、`/api/resources`

从 `lib/mock-data.ts` 改读 `prisma.person.findMany()` 等。保留现有 query 参数（`page`、`pageSize`、`search`、`category` 等）。

**特殊处理**：`/api/personnel` 当前把 Workstation 信息也合进 Person 返回（看现有实现）。改造后用 `include: { workstations: true }`。

### 错误处理

所有路由统一错误格式：

```ts
return Response.json({ error: '...' }, { status: 4xx | 5xx })
```

PUT 在事务失败时自动回滚——SQLite + Prisma 事务支持良好。

### 不做细粒度 CRUD 的理由

- "按页面手动保存"语义意味着一次保存跨多条记录
- 整体替换式 PUT 让事务边界清晰，避免增量 API 暴露中间态
- 细粒度 API 会强制前端做乐观更新 + 回滚，复杂度更高
- 单实例 SQLite 无并发冲突，整体替换安全

---

## § 4 · 客户端数据层（`lib/api.ts`）

### SWR hooks

```ts
import useSWR from 'swr'

const fetcher = <T>(url: string): Promise<T> => fetch(url).then(r => {
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return r.json()
})

export function useFloorLayout() {
  return useSWR<{ floors: Floor[] }>('/api/floor-layout', fetcher)
}

export function useAdminData() {
  return useSWR<{ personnel: Person[]; news: NewsItem[]; resources: Resource[] }>(
    '/api/admin-data', fetcher
  )
}

export function usePersonnel(params?: Record<string, string>) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : ''
  return useSWR<ApiResponse<Person[]>>(`/api/personnel${qs}`, fetcher)
}

// 类似 useNews、useResources
```

### 写入辅助

```ts
export async function putJSON<T>(url: string, body: T): Promise<void> {
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `PUT ${url} failed`)
  }
}
```

### 编辑页通用模式（以 floor-layout 为例）

```tsx
'use client'
import { useEffect, useMemo, useState } from 'react'
import { useFloorLayout, putJSON } from '@/lib/api'
import { isEqual } from 'lodash-es'   // 或自写浅+深度对比

export default function FloorLayoutPage() {
  const { data: server, mutate } = useFloorLayout()
  const [local, setLocal] = useState<Floor[] | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (server && !local) setLocal(server.floors) }, [server])

  const dirty = useMemo(
    () => !!local && !!server && !isEqual(local, server.floors),
    [local, server]
  )

  // beforeunload 拦截
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  async function save() {
    if (!local || saving) return
    setSaving(true)
    try {
      await putJSON('/api/floor-layout', { floors: local })
      await mutate()
    } finally {
      setSaving(false)
    }
  }

  // ...render，把 local + setLocal 传给 FloorEditor
}
```

`/dashboard/admin` 页面同样模式，只是资源是 `{personnel, news, resources}`。

### "未保存" badge

保存按钮旁加一个小 badge：

```tsx
{dirty && <span className="text-xs text-amber-600">● 未保存改动</span>}
```

### 只读页改造模式

```tsx
// 例：app/dashboard/news/page.tsx
export default function NewsPage() {
  const { data } = useNews()
  if (!data) return <Loading />
  // 用 data.items 渲染
}
```

不再 `import { mockNews }`。

### 应用内路由跳转

按设计决策 6，**不**做应用内拦截（Next.js App Router 无稳定 API）。靠 `beforeunload`（处理刷新/关闭）+ 可见 badge（提示用户主动跳转）覆盖所有场景。

---

## § 5 · 种子数据（`lib/db/seed.ts`）

### 触发方式

- **手动**：`pnpm db:seed`
- **不自动**：dev 启动时**不**自动跑 seed，避免覆盖用户改动

### 幂等性

脚本先检查每个表是否为空：

```ts
async function seedIfEmpty() {
  if ((await prisma.floor.count()) === 0) {
    // 从 mock-data.ts 读 floors 树（含 zones、workstations）→ prisma.createMany
  }
  if ((await prisma.person.count()) === 0) { /* ... */ }
  if ((await prisma.newsItem.count()) === 0) { /* ... */ }
  if ((await prisma.resource.count()) === 0) { /* ... */ }
}
```

如果某张表已有数据，跳过该表——支持"重置某张表"的细粒度用法（手动 `delete from Table` 后再 `db:seed`）。

### 数据来源

直接 `import { mockFloors, mockPersonnel, mockNews, mockResources } from '@/lib/mock-data'`，将这些对象转成 Prisma 创建参数。**这是 `mock-data.ts` 唯一被 import 的地方**。

### 日期处理

`mockNews[].publishedAt` 在 mock-data 里是字符串（如 `'2026-05-28'`），seed 时转 `new Date()`。

---

## § 6 · 受影响文件清单

### 新增（~9 个）

| 路径 | 用途 |
|---|---|
| `prisma/schema.prisma` | 数据模型定义 |
| `lib/db/index.ts` | PrismaClient 单例 |
| `lib/db/seed.ts` | 种子脚本 |
| `lib/api.ts` | SWR hooks + fetch helpers |
| `app/api/floor-layout/route.ts` | GET + PUT |
| `app/api/admin-data/route.ts` | GET + PUT |
| `docs/superpowers/plans/...` | 实施计划（下一步生成） |

### 改造（~13 个）

| 路径 | 改动 |
|---|---|
| `package.json` | 加 prisma/swr/tsx 依赖与脚本 |
| `.gitignore` | 加 `prisma/db.sqlite*` |
| `app/api/personnel/route.ts` | mock → prisma |
| `app/api/news/route.ts` | mock → prisma |
| `app/api/resources/route.ts` | mock → prisma |
| `app/dashboard/page.tsx` | mock → SWR hooks |
| `app/dashboard/admin/page.tsx` | mock → SWR + 本地草稿 + 保存按钮 |
| `app/dashboard/admin/floor-layout/page.tsx` | mock → SWR + 本地草稿 + 保存按钮 + dirty badge + beforeunload |
| `app/dashboard/personnel/page.tsx` | mock → SWR |
| `app/dashboard/news/page.tsx` | mock → SWR |
| `app/dashboard/resources/page.tsx` | mock → SWR |
| `components/dashboard/personnel-stats.tsx` | mock → props（保持纯组件） |
| `components/dashboard/floor-plan.tsx` | （检查是否直接 import mock） |

### 不动

- `lib/mock-data.ts`：保留作为 seed 来源
- `lib/types.ts`：类型保持
- `lib/floor-constants.ts`：无关
- `lib/auth-context.tsx`：仅 `import { mockUser }`，用于 `admin/admin` 登录返回 user 对象。**用户认证不在持久化范围**（继续 sessionStorage），此处保持原样
- `components/admin/*`：编辑组件保持 prop-driven，由 page 层喂数据

---

## § 7 · 部署与运维

### 初始化新环境

新克隆代码的开发者：

1. `pnpm install`（触发 `postinstall: prisma generate`）
2. `pnpm db:migrate`（创建 `prisma/db.sqlite` + 表结构）
3. `pnpm db:seed`（首次灌入 mock 数据）
4. `pnpm dev`

可在 README 加一节说明。

### 备份

`prisma/db.sqlite` 是普通文件，备份即拷贝。生产部署可用 `prisma migrate deploy` + 定期 sqlite backup。

### 重置数据

```bash
rm prisma/db.sqlite
pnpm db:migrate
pnpm db:seed
```

### 生产部署

SQLite 单实例适合内网/低并发。如未来需多实例或高并发，可：
- 切换 `datasource.provider` 为 `postgresql`，重跑 migrate
- 其余代码几乎不变（Prisma 优势）

---

## § 8 · 验收清单（手工）

项目无测试框架，按以下用例人工核对。

### 类型与编译

- [ ] `pnpm build` 不报 TypeScript 错误（既有 `floor-plan.tsx` `useCallback` 警告仍被 `ignoreBuildErrors` 抑制）
- [ ] `pnpm db:migrate` 与 `pnpm db:seed` 都能成功执行

### Seed

- [ ] 删除 `prisma/db.sqlite` 后跑 `pnpm db:migrate && pnpm db:seed`，DB 内容与 `mock-data.ts` 一致
- [ ] 在已有数据的 DB 上再跑 `db:seed`，所有表数据不变（幂等性）

### 读取路径

- [ ] `/dashboard` 渲染所有 zone（含自由模式区域 `zone-10c`）与新闻列表，数据来自 DB
- [ ] `/dashboard/personnel` 渲染人员列表与工位占用，数据来自 DB
- [ ] `/dashboard/news`、`/dashboard/resources` 同上
- [ ] `/dashboard/admin` 三个 CRUD 列表显示 DB 中的数据
- [ ] `/dashboard/admin/floor-layout` 楼层/区域/工位树显示 DB 中的数据（含自由模式区域）

### 编辑 + 保存（floor-layout）

- [ ] 切到 10 层 → 进入自由讨论区 → 拖刷添加 5 个工位 → 顶部出现红色 `● 未保存改动` badge
- [ ] 点击《保存配置》→ badge 消失 → 刷新页面后新增工位仍在
- [ ] 添加工位但未保存 → 尝试刷新页面 → 浏览器弹出"未保存"确认
- [ ] 添加工位但未保存 → 点击《保存配置》失败（断网模拟）→ badge 仍在 + 显示错误提示

### 编辑 + 保存（admin）

- [ ] `/dashboard/admin` 添加一个 Person → 出现未保存 badge
- [ ] 点击《保存》→ 数据落库 → badge 消失
- [ ] 删除一个 News Item → 保存 → 刷新后该条目不再出现
- [ ] 编辑一个 Resource → 保存 → 关闭浏览器重开仍在

### 级联

- [ ] 删除某 Person（保存）→ 该 Person 占用的 Workstation 的 `personId` 变 NULL（工位保留为"未占用"）
- [ ] 在 floor-layout 删除某 Floor（保存）→ 其下 Zone、Workstation 一并消失（在 `/dashboard/personnel` 验证）

### 跨页面一致性

- [ ] 在 floor-layout 改工位名（保存）→ 切到 `/dashboard/personnel` 看到新名字
- [ ] 在 admin 改 Person 名（保存）→ 切到 `/dashboard` 看到 tooltip 里的人名更新

---

## § 9 · 风险与缓解

| 风险 | 缓解 |
|---|---|
| 整体替换式 PUT 体积大、写入慢 | mock 数据 ~50KB，SQLite 本地写 < 100ms；如未来数据量增长，可改为 diff-based PUT |
| 未保存离开丢数据 | `beforeunload` + 可见 badge；不做应用内路由拦截（权衡） |
| SQLite 文件并发写 | 单实例部署，无并发问题；多实例需迁移到 Postgres |
| Prisma 与 Next.js 热重载多实例 | `globalThis.prisma` 单例模式 |
| `lib/mock-data.ts` 与 DB 不一致 | seed 是幂等的；后续维护：先改 mock-data.ts（保持 seed 数据源），再跑 seed；运行时不读 mock |
| `auth-context.tsx` import `mockUser` | 仅用于 `admin/admin` 登录返回，认证不在持久化范围；保留原样 |

---

## § 10 · 工作量预估

- 新增代码：~600 行（schema、API 路由、SWR hooks、seed）
- 改造代码：~300 行（页面层 + API 路由 mock→prisma）
- 涉及文件：~22 个（新增 9 + 改造 13）
- 复杂度：比自由布局特性高 2-3 倍（涉及面广，但每处改动机械）
- 建议拆分实施（在 writing-plans 阶段分 8-12 个任务）
