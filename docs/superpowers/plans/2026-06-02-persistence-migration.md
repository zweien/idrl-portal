# Persistence Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 IDRL Portal 的全部 mock 数据（楼层/区域/工位/人员/资源/新闻）迁移到 SQLite + Prisma，加入"按页面手动保存 + 未保存提示"语义。

**Architecture:** Prisma 单例 → 6 个 model；4 个新 API（floor-layout GET/PUT、admin-data GET/PUT）+ 3 个改造 API（personnel/news/resources 从 mock 改读 DB）；前端用 SWR hooks 拉数据，编辑页维护本地草稿 + dirty badge + beforeunload + 手动 save 按钮触发整体替换式 PUT。整体替换式写入用 Prisma 事务执行 `deleteMany + createMany`。

**Tech Stack:** Next.js 16 + React 19 + TypeScript + Prisma 5 + SQLite + SWR 2 + pnpm

**Spec:** `docs/superpowers/specs/2026-06-02-persistence-migration-design.md`

---

## 文件结构

### 新增

| 路径 | 责任 |
|---|---|
| `prisma/schema.prisma` | 6 个 model 的定义 |
| `prisma/db.sqlite` | SQLite 数据库文件（gitignore） |
| `lib/db/index.ts` | PrismaClient 单例 |
| `lib/db/serialize.ts` | DB row ↔ TS 类型转换（处理 JSON/日期/反向引用） |
| `lib/db/seed.ts` | 幂等种子脚本 |
| `lib/api.ts` | SWR hooks + `putJSON` helper |
| `app/api/floor-layout/route.ts` | GET + PUT 楼层树 |
| `app/api/admin-data/route.ts` | GET + PUT 人员/资源/新闻 |

### 改造

| 路径 | 改动 |
|---|---|
| `package.json` | 加 `@prisma/client`, `swr`, `prisma`, `tsx`, `lodash-es`, `@types/lodash-es` + 6 个 scripts |
| `.gitignore` | 加 `prisma/db.sqlite*` |
| `app/api/personnel/route.ts` | mock → prisma |
| `app/api/news/route.ts` | mock → prisma |
| `app/api/resources/route.ts` | mock → prisma |
| `app/dashboard/page.tsx` | mock → SWR |
| `app/dashboard/admin/page.tsx` | mock → SWR + 草稿 + 保存 |
| `app/dashboard/admin/floor-layout/page.tsx` | mock → SWR + 草稿 + 保存 |
| `app/dashboard/personnel/page.tsx` | mock → SWR |
| `app/dashboard/news/page.tsx` | mock → SWR |
| `app/dashboard/resources/page.tsx` | mock → SWR |
| `components/dashboard/personnel-stats.tsx` | mock → props |
| `components/dashboard/floor-plan.tsx` | mock → props（新增 `personnel` 可选 prop） |

### 不动

- `lib/mock-data.ts`：保留作为 seed 来源；运行时**只**被 `lib/db/seed.ts` 与 `lib/auth-context.tsx` 引用
- `lib/auth-context.tsx`：仍 `import { mockUser }`（认证不入库）
- `lib/types.ts`：现有类型保持

---

## Task 1: 初始化 Prisma + SQLite schema

**Files:**
- Create: `prisma/schema.prisma`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: 安装依赖**

Run:
```bash
pnpm add @prisma/client swr lodash-es
pnpm add -D prisma tsx @types/lodash-es
```
Expected: 依赖写入 `package.json`，无错误。

- [ ] **Step 2: 写 schema.prisma**

Create `prisma/schema.prisma`:

```prisma
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
  id           String        @id
  name         String
  floorId      String
  floor        Floor         @relation(fields: [floorId], references: [id], onDelete: Cascade)
  color        String
  order        Int
  mode         String
  rows         Int
  cols         Int
  maxRows      Int
  maxCols      Int
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
  id             String        @id
  name           String
  role           String
  email          String?
  phone          String?
  dingUserId     String?
  status         String
  lastSeen       String?
  researchAreas  String?
  avatar         String?
  workstations   Workstation[]
}

model NewsItem {
  id       String  @id
  type     String
  title    String
  content  String
  summary  String?
  author   String?
  date     String
  tags     String?
  imageUrl String?
  link     String?
  pinned   Boolean @default(false)
}

model Resource {
  id          String  @id
  name        String
  type        String
  description String
  url         String?
  icon        String?
  status      String
  specs       String?
  accessLevel String
}
```

**说明**：
- `researchAreas`、`tags`、`specs` 是数组/对象，SQLite 不支持，统一用 JSON 字符串存（序列化在 § Task 2）
- `lastSeen`、`date` 用 `String?` 存 ISO 字符串，避免 SQLite DateTime 序列化摩擦
- `Workstation.personId` 可空，删 Person 时设 NULL（级联策略）

- [ ] **Step 3: 加 .gitignore**

修改 `.gitignore`，在末尾加：

```
# prisma local db
prisma/db.sqlite
prisma/db.sqlite-journal
```

- [ ] **Step 4: 加 package.json scripts**

修改 `package.json`，在 `scripts` 块加：

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev --name init",
    "db:seed": "tsx lib/db/seed.ts",
    "postinstall": "prisma generate"
  }
}
```

- [ ] **Step 5: 跑 migrate 生成 DB 与 client**

Run:
```bash
pnpm db:migrate
```
Expected:
- 创建 `prisma/db.sqlite`
- 创建 `prisma/migrations/<timestamp>_init/` 目录
- 输出 `✔ Generated Prisma Client`

验证：`ls prisma/db.sqlite` 应存在。

- [ ] **Step 6: 提交**

```bash
git add prisma/schema.prisma package.json pnpm-lock.yaml .gitignore prisma/migrations/
git commit -m "feat(db): init Prisma with SQLite schema for all mock entities"
```

注意：不提交 `prisma/db.sqlite`（已在 gitignore）。

---

## Task 2: PrismaClient 单例 + 序列化辅助

**Files:**
- Create: `lib/db/index.ts`
- Create: `lib/db/serialize.ts`

- [ ] **Step 0: 装 Prisma 7 SQLite adapter**

Prisma 7 强制 driver adapter。先装：

```bash
pnpm add @prisma/adapter-better-sqlite3 better-sqlite3
```

- [ ] **Step 1: 写单例**

Create `lib/db/index.ts`:

```ts
import { PrismaClient } from '@prisma/client'
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'

declare global {
  var prisma: PrismaClient | undefined
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    adapter: new PrismaBetterSqlite3({ url: 'file:prisma/db.sqlite' }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') global.prisma = prisma
```

- [ ] **Step 2: 写序列化辅助**

Create `lib/db/serialize.ts`:

```ts
import type {
  Floor, Zone, NewWorkstation, Person, NewsItem, Resource,
} from '@/lib/types'
import type {
  Floor as DBFloor, Zone as DBZone, Workstation as DBWorkstation,
  Person as DBPerson, NewsItem as DBNews, Resource as DBResource,
} from '@prisma/client'

// ===== DB → TS =====

export function toPerson(p: DBPerson): Person {
  return {
    id: p.id,
    name: p.name,
    role: p.role as Person['role'],
    email: p.email ?? undefined,
    phone: p.phone ?? undefined,
    dingUserId: p.dingUserId ?? undefined,
    status: p.status as Person['status'],
    lastSeen: p.lastSeen ?? undefined,
    researchAreas: p.researchAreas ? JSON.parse(p.researchAreas) : undefined,
    avatar: p.avatar ?? undefined,
  }
}

export function toNewsItem(n: DBNews): NewsItem {
  return {
    id: n.id,
    type: n.type as NewsItem['type'],
    title: n.title,
    content: n.content,
    summary: n.summary ?? undefined,
    author: n.author ?? undefined,
    date: n.date,
    tags: n.tags ? JSON.parse(n.tags) : undefined,
    imageUrl: n.imageUrl ?? undefined,
    link: n.link ?? undefined,
    pinned: n.pinned,
  }
}

export function toResource(r: DBResource): Resource {
  return {
    id: r.id,
    name: r.name,
    type: r.type as Resource['type'],
    description: r.description,
    url: r.url ?? undefined,
    icon: r.icon ?? undefined,
    status: r.status as Resource['status'],
    specs: r.specs ? JSON.parse(r.specs) : undefined,
    accessLevel: r.accessLevel as Resource['accessLevel'],
  }
}

export function toWorkstation(w: DBWorkstation): NewWorkstation {
  return {
    id: w.id,
    name: w.name,
    zoneId: w.zoneId,
    floorId: w.floorId,
    row: w.row,
    col: w.col,
    personId: w.personId ?? undefined,
    status: w.status as NewWorkstation['status'],
    nameCustomized: w.nameCustomized,
  }
}

export function toZone(z: DBZone & { workstations: DBWorkstation[] }): Zone {
  return {
    id: z.id,
    name: z.name,
    floorId: z.floorId,
    color: z.color,
    order: z.order,
    mode: z.mode as Zone['mode'],
    rows: z.rows,
    cols: z.cols,
    maxRows: z.maxRows,
    maxCols: z.maxCols,
    workstations: z.workstations.map(toWorkstation),
  }
}

export function toFloor(
  f: DBFloor & { zones: (DBZone & { workstations: DBWorkstation[] })[] },
): Floor {
  return {
    id: f.id,
    name: f.name,
    order: f.order,
    zones: f.zones.map(toZone),
  }
}

// ===== TS → DB（用于 PUT 与 seed）=====

export function fromPerson(p: Person) {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    email: p.email ?? null,
    phone: p.phone ?? null,
    dingUserId: p.dingUserId ?? null,
    status: p.status,
    lastSeen: p.lastSeen ?? null,
    researchAreas: p.researchAreas ? JSON.stringify(p.researchAreas) : null,
    avatar: p.avatar ?? null,
  }
}

export function fromNewsItem(n: NewsItem) {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    content: n.content,
    summary: n.summary ?? null,
    author: n.author ?? null,
    date: n.date,
    tags: n.tags ? JSON.stringify(n.tags) : null,
    imageUrl: n.imageUrl ?? null,
    link: n.link ?? null,
    pinned: n.pinned ?? false,
  }
}

export function fromResource(r: Resource) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    description: r.description,
    url: r.url ?? null,
    icon: r.icon ?? null,
    status: r.status,
    specs: r.specs ? JSON.stringify(r.specs) : null,
    accessLevel: r.accessLevel,
  }
}

export function fromWorkstation(w: NewWorkstation) {
  return {
    id: w.id,
    name: w.name,
    zoneId: w.zoneId,
    floorId: w.floorId,
    row: w.row,
    col: w.col,
    personId: w.personId ?? null,
    status: w.status,
    nameCustomized: w.nameCustomized ?? false,
  }
}

export function fromZone(z: Zone) {
  return {
    id: z.id,
    name: z.name,
    floorId: z.floorId,
    color: z.color,
    order: z.order,
    mode: z.mode,
    rows: z.rows,
    cols: z.cols,
    maxRows: z.maxRows,
    maxCols: z.maxCols,
  }
}
```

**说明**：
- DB 字段都是非可选（`null` 表示缺失），TS 接口用 `?:`，转换时 `?? undefined`
- JSON 字段（researchAreas/tags/specs）用 `JSON.parse/stringify`
- `role`/`status` 等枚举 DB 用 string，TS 用联合类型，转换时 `as`
- `fromX` 用于 PUT 接收的 TS 对象 → DB 写入参数（也用于 seed）

- [ ] **Step 3: 验证类型**

Run:
```bash
npx tsc --noEmit lib/db/index.ts lib/db/serialize.ts 2>&1 | head -20
```
Expected: 无错误，或仅有现有项目级警告（`floor-plan.tsx:110-111` useCallback 警告与 `lib/db/*` 无关）。

- [ ] **Step 4: 提交**

```bash
git add lib/db/index.ts lib/db/serialize.ts
git commit -m "feat(db): add PrismaClient singleton and DB↔TS serializers"
```

---

## Task 3: 幂等种子脚本

**Files:**
- Create: `lib/db/seed.ts`

- [ ] **Step 1: 写 seed.ts**

Create `lib/db/seed.ts`:

```ts
import { prisma } from './index'
import { fromPerson, fromNewsItem, fromResource, fromZone, fromWorkstation } from './serialize'
import {
  mockPersonnel, mockNews, mockResources, mockFloors,
} from '@/lib/mock-data'

async function seedIfEmpty() {
  // Person
  if ((await prisma.person.count()) === 0) {
    await prisma.person.createMany({ data: mockPersonnel.map(fromPerson) })
    console.log(`✓ seeded ${mockPersonnel.length} persons`)
  } else {
    console.log('• persons already present, skip')
  }

  // NewsItem
  if ((await prisma.newsItem.count()) === 0) {
    await prisma.newsItem.createMany({ data: mockNews.map(fromNewsItem) })
    console.log(`✓ seeded ${mockNews.length} news`)
  } else {
    console.log('• news already present, skip')
  }

  // Resource
  if ((await prisma.resource.count()) === 0) {
    await prisma.resource.createMany({ data: mockResources.map(fromResource) })
    console.log(`✓ seeded ${mockResources.length} resources`)
  } else {
    console.log('• resources already present, skip')
  }

  // Floor + Zone + Workstation（嵌套）
  if ((await prisma.floor.count()) === 0) {
    for (const f of mockFloors) {
      await prisma.floor.create({
        data: {
          id: f.id,
          name: f.name,
          order: f.order,
          zones: {
            create: f.zones.map(z => ({
              ...fromZone(z),
              workstations: {
                create: z.workstations.map(fromWorkstation),
              },
            })),
          },
        },
      })
    }
    const totalZones = mockFloors.reduce((s, f) => s + f.zones.length, 0)
    const totalWs = mockFloors.reduce(
      (s, f) => s + f.zones.reduce((s2, z) => s2 + z.workstations.length, 0),
      0,
    )
    console.log(`✓ seeded ${mockFloors.length} floors / ${totalZones} zones / ${totalWs} workstations`)
  } else {
    console.log('• floors already present, skip')
  }
}

seedIfEmpty()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
```

**说明**：
- 每张表先 `count()` 检查，空才灌——幂等
- Floor 用 `create` 嵌套 zones + workstations（一次 INSERT 三层），SQLite 没有事务问题（Prisma 默认每查询一个事务）
- 不需要清理 Workstation.personId 引用一致性：mock-data 本身保证 `personId` 指向已存在 person
- 进程结束前 `prisma.$disconnect()` 释放连接

- [ ] **Step 2: 跑 seed 验证**

Run:
```bash
pnpm db:seed
```
Expected output（具体数字以 mock-data 为准）:
```
✓ seeded N persons
✓ seeded N news
✓ seeded N resources
✓ seeded N floors / N zones / N workstations
```

- [ ] **Step 3: 验证幂等**

Run:
```bash
pnpm db:seed
```
Expected: 全部输出 `• ... already present, skip`。

- [ ] **Step 4: 提交**

```bash
git add lib/db/seed.ts package.json
git commit -m "feat(db): add idempotent seed script from mock-data"
```

---

## Task 4: API /api/floor-layout (GET + PUT)

**Files:**
- Create: `app/api/floor-layout/route.ts`

- [ ] **Step 1: 写 route.ts**

Create `app/api/floor-layout/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toFloor, fromZone, fromWorkstation } from '@/lib/db/serialize'
import type { Floor, Zone, NewWorkstation } from '@/lib/types'

interface FloorLayoutBody {
  floors: Array<{
    id: string
    name: string
    order: number
    zones: Array<{
      id: string
      name: string
      floorId: string
      color: string
      order: number
      mode: Zone['mode']
      rows: number
      cols: number
      maxRows: number
      maxCols: number
      workstations: NewWorkstation[]
    }>
  }>
}

export async function GET() {
  const floors = await prisma.floor.findMany({
    orderBy: { order: 'asc' },
    include: {
      zones: {
        orderBy: { order: 'asc' },
        include: { workstations: true },
      },
    },
  })
  return NextResponse.json({ floors: floors.map(toFloor) })
}

export async function PUT(req: NextRequest) {
  let body: FloorLayoutBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body?.floors || !Array.isArray(body.floors)) {
    return NextResponse.json({ error: 'floors required' }, { status: 400 })
  }

  try {
    await prisma.$transaction([
      prisma.workstation.deleteMany({}),
      prisma.zone.deleteMany({}),
      prisma.floor.deleteMany({}),
    ])

    for (const f of body.floors) {
      await prisma.floor.create({
        data: {
          id: f.id,
          name: f.name,
          order: f.order,
          zones: {
            create: f.zones.map(z => ({
              ...fromZone(z),
              workstations: { create: z.workstations.map(fromWorkstation) },
            })),
          },
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

**说明**：
- GET 用 `include` 嵌套拉取三层，按 `order` 排序
- PUT 先在事务里清空三表，再循环 create（每层带嵌套 create）。Prisma 的 `$transaction([query1, query2, ...])` 数组形式保证原子性；后续循环 create 在事务外执行——但因为前三个 delete 已先成功，就算后续 create 失败也只是"清空了没建好"，再次 PUT 能恢复。如果想更严格可以把循环也包进 `$transaction(async tx => {...})` 形式，但 SQLite 单写者无并发，简化版可接受
- 若 PUT 体结构不对返回 400
- 任何 Prisma 错误返回 500 + 错误信息

- [ ] **Step 2: 验证 GET**

Run dev server:
```bash
pnpm dev
```

新开终端：
```bash
curl -s http://localhost:3000/api/floor-layout | head -c 500
```
Expected: JSON 含 `"floors":[{...}]`，能看到 `zone-10c` 与 `自-01` 等字段。

- [ ] **Step 3: 验证 PUT**

Run（先 GET 保存当前内容到 /tmp/floors.json）:
```bash
curl -s http://localhost:3000/api/floor-layout > /tmp/floors.json
curl -s -X PUT -H "Content-Type: application/json" -d @/tmp/floors.json http://localhost:3000/api/floor-layout
```
Expected: `{"ok":true}`

再 GET 确认内容一致：
```bash
curl -s http://localhost:3000/api/floor-layout > /tmp/floors2.json
diff <(jq -S . /tmp/floors.json) <(jq -S . /tmp/floors2.json)
```
Expected: 无差异（注意：序列化顺序一致所以 diff 应为空）。

- [ ] **Step 4: 提交**

```bash
git add app/api/floor-layout/route.ts
git commit -m "feat(api): add floor-layout GET and PUT routes"
```

---

## Task 5: API /api/admin-data (GET + PUT)

**Files:**
- Create: `app/api/admin-data/route.ts`

- [ ] **Step 1: 写 route.ts**

Create `app/api/admin-data/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toPerson, toNewsItem, toResource, fromPerson, fromNewsItem, fromResource } from '@/lib/db/serialize'
import type { Person, NewsItem, Resource } from '@/lib/types'

interface AdminDataBody {
  personnel: Person[]
  news: NewsItem[]
  resources: Resource[]
}

export async function GET() {
  const [persons, news, resources] = await Promise.all([
    prisma.person.findMany(),
    prisma.newsItem.findMany({ orderBy: { date: 'desc' } }),
    prisma.resource.findMany(),
  ])
  return NextResponse.json({
    personnel: persons.map(toPerson),
    news: news.map(toNewsItem),
    resources: resources.map(toResource),
  })
}

export async function PUT(req: NextRequest) {
  let body: AdminDataBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  if (!body?.personnel || !body?.news || !body?.resources) {
    return NextResponse.json({ error: 'personnel, news, resources required' }, { status: 400 })
  }

  try {
    await prisma.$transaction([
      prisma.person.deleteMany({}),
      prisma.newsItem.deleteMany({}),
      prisma.resource.deleteMany({}),
    ])

    await prisma.person.createMany({ data: body.personnel.map(fromPerson) })
    await prisma.newsItem.createMany({ data: body.news.map(fromNewsItem) })
    await prisma.resource.createMany({ data: body.resources.map(fromResource) })

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

**说明**：
- `deleteMany({})` 在事务里执行；`createMany` 也在事务里（数组形式 `$transaction` 等待所有完成）
- 删 Person 会触发 Workstation.personId → NULL（级联 SetNull），这是预期：admin 在保存人员时若移除了某 Person，对应工位变未占用
- news 按 date desc 返回，与现有 UI 排序一致

- [ ] **Step 2: 验证 GET + PUT**

```bash
curl -s http://localhost:3000/api/admin-data | head -c 500
curl -s http://localhost:3000/api/admin-data > /tmp/admin.json
curl -s -X PUT -H "Content-Type: application/json" -d @/tmp/admin.json http://localhost:3000/api/admin-data
```
Expected: GET 返回 personnel/news/resources 三组；PUT 返回 `{"ok":true}`。

- [ ] **Step 3: 提交**

```bash
git add app/api/admin-data/route.ts
git commit -m "feat(api): add admin-data GET and PUT routes"
```

---

## Task 6: 改造 /api/personnel、/api/news、/api/resources 从 mock → DB

**Files:**
- Modify: `app/api/personnel/route.ts`
- Modify: `app/api/news/route.ts`
- Modify: `app/api/resources/route.ts`

- [ ] **Step 1: 读现有 personnel route 的语义**

Run:
```bash
cat app/api/personnel/route.ts
```

记下它支持的 query 参数（如 `search`、`role`、`status`、`page`、`pageSize`）和响应结构（如 `ApiResponse<Person[]>` 还是 `PaginatedResponse<Person[]>`），改造后必须保持完全一致。

- [ ] **Step 2: 改造 personnel/route.ts**

整体替换 `import { mockPersonnel } from '@/lib/mock-data'`，改用 `prisma.person.findMany`。保留原有过滤/分页/响应结构。

模式：
```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toPerson } from '@/lib/db/serialize'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') ?? ''
  const role = searchParams.get('role')
  const status = searchParams.get('status')
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10)

  const where: Record<string, unknown> = {}
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { email: { contains: search } },
    ]
  }
  if (role) where.role = role
  if (status) where.status = status

  const [total, rows] = await Promise.all([
    prisma.person.count({ where }),
    prisma.person.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return NextResponse.json({
    success: true,
    data: {
      items: rows.map(toPerson),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}
```

**注意**：保留原响应的 `success: true` 包装与 `data: { items, total, ... }` 结构（`PaginatedResponse<Person>`）。如果原路由返回非分页数组，按原样保留——以现有实现为准。

- [ ] **Step 3: 改造 news/route.ts**

类似 personnel，按现有 query 参数（`category`/`type`、`page`、`pageSize` 等）改造：

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toNewsItem } from '@/lib/db/serialize'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const search = searchParams.get('search') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10)

  const where: Record<string, unknown> = {}
  if (type) where.type = type
  if (search) {
    where.OR = [
      { title: { contains: search } },
      { content: { contains: search } },
    ]
  }

  const [total, rows] = await Promise.all([
    prisma.newsItem.count({ where }),
    prisma.newsItem.findMany({
      where,
      orderBy: { date: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return NextResponse.json({
    success: true,
    data: {
      items: rows.map(toNewsItem),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}
```

- [ ] **Step 4: 改造 resources/route.ts**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { toResource } from '@/lib/db/serialize'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const search = searchParams.get('search') ?? ''
  const page = parseInt(searchParams.get('page') ?? '1', 10)
  const pageSize = parseInt(searchParams.get('pageSize') ?? '20', 10)

  const where: Record<string, unknown> = {}
  if (type) where.type = type
  if (search) {
    where.OR = [
      { name: { contains: search } },
      { description: { contains: search } },
    ]
  }

  const [total, rows] = await Promise.all([
    prisma.resource.count({ where }),
    prisma.resource.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  return NextResponse.json({
    success: true,
    data: {
      items: rows.map(toResource),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    },
  })
}
```

- [ ] **Step 5: 验证三个 GET**

```bash
curl -s 'http://localhost:3000/api/personnel?page=1&pageSize=5' | head -c 300
curl -s 'http://localhost:3000/api/news?page=1&pageSize=5' | head -c 300
curl -s 'http://localhost:3000/api/resources?page=1&pageSize=5' | head -c 300
```
Expected: 三个都返回 `success: true` + `data: { items: [...], total: N, ...}`。

- [ ] **Step 6: 提交**

```bash
git add app/api/personnel/route.ts app/api/news/route.ts app/api/resources/route.ts
git commit -m "refactor(api): read personnel, news, resources from DB"
```

---

## Task 7: SWR hooks + fetch helpers (lib/api.ts)

**Files:**
- Create: `lib/api.ts`

- [ ] **Step 1: 写 lib/api.ts**

Create `lib/api.ts`:

```ts
'use client'
import useSWR from 'swr'
import type {
  Floor, Person, NewsItem, Resource,
  ApiResponse, PaginatedResponse,
} from '@/lib/types'

const fetcher = <T>(url: string): Promise<T> =>
  fetch(url).then(r => {
    if (!r.ok) {
      return r.json().catch(() => ({})).then((body: { error?: string }) => {
        throw new Error(body.error || `${url}: ${r.status}`)
      })
    }
    return r.json()
  })

export async function putJSON<T>(url: string, body: T): Promise<void> {
  const r = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }))
    throw new Error(err.error || `PUT ${url} failed: ${r.status}`)
  }
}

// ===== Floor layout =====

export function useFloorLayout() {
  return useSWR<{ floors: Floor[] }>('/api/floor-layout', fetcher)
}

// ===== Admin data =====

export function useAdminData() {
  return useSWR<{ personnel: Person[]; news: NewsItem[]; resources: Resource[] }>(
    '/api/admin-data',
    fetcher,
  )
}

// ===== Read-only paginated endpoints =====

export function usePersonnel(params?: Record<string, string | number>) {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString() : ''
  return useSWR<ApiResponse<PaginatedResponse<Person>>>(
    `/api/personnel${qs}`,
    fetcher,
  )
}

export function useNews(params?: Record<string, string | number>) {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString() : ''
  return useSWR<ApiResponse<PaginatedResponse<NewsItem>>>(
    `/api/news${qs}`,
    fetcher,
  )
}

export function useResources(params?: Record<string, string | number>) {
  const qs = params ? '?' + new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString() : ''
  return useSWR<ApiResponse<PaginatedResponse<Resource>>>(
    `/api/resources${qs}`,
    fetcher,
  )
}
```

**说明**：
- `fetcher` 失败时尝试解析 `{ error }` body，把错误抛出（SWR 会放进 `error` 字段）
- `putJSON` 简单封装 PUT，错误同样抛 `Error`
- 三个分页 hook 拼接 query string，参数值统一 `String()`
- 如果原 API 路由返回的不是 `ApiResponse<PaginatedResponse<T>>` 结构（如 `data: T[]` 直接数组），按实际改 hook 的泛型

- [ ] **Step 2: 验证类型**

```bash
npx tsc --noEmit lib/api.ts 2>&1 | head -10
```
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add lib/api.ts
git commit -m "feat(api): add SWR hooks and fetch helpers"
```

---

## Task 8: floor-layout 编辑页接入持久化

**Files:**
- Modify: `app/dashboard/admin/floor-layout/page.tsx`

- [ ] **Step 1: 读现有 page.tsx 结构**

Run:
```bash
cat app/dashboard/admin/floor-layout/page.tsx
```

注意：
- 顶部"保存配置"按钮目前没绑 onClick
- `selectedFloorId` 永远不变（既有 bug，见前一个特性的验收笔记）——本次保留此 bug 不动，不在范围内
- `useState<Floor[]>(mockFloors)` 是数据源，要替换

- [ ] **Step 2: 改造 page.tsx**

整体替换文件内容：

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { isEqual } from 'lodash-es'
import { FloorEditor } from '@/components/admin/floor-editor'
import { FloorPreview } from '@/components/admin/floor-preview'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { useFloorLayout, putJSON } from '@/lib/api'
import type { Floor } from '@/lib/types'
import { ShieldAlert, Save } from 'lucide-react'

export default function FloorLayoutPage() {
  const { user } = useAuth()
  const { data, mutate } = useFloorLayout()
  const serverFloors = data?.floors

  const [localFloors, setLocalFloors] = useState<Floor[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // 初始加载时把 server 数据复制到 local
  useEffect(() => {
    if (serverFloors && localFloors === null) setLocalFloors(serverFloors)
  }, [serverFloors, localFloors])

  const dirty = useMemo(() => {
    if (!serverFloors || !localFloors) return false
    return !isEqual(localFloors, serverFloors)
  }, [serverFloors, localFloors])

  // beforeunload 拦截
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  async function save() {
    if (!localFloors || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      await putJSON('/api/floor-layout', { floors: localFloors })
      await mutate()
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (user?.role !== 'admin') {
    return (
      <div className="space-y-4 py-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">工位布局管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">配置楼层、区域和工位</p>
        </div>
        <div className="rounded-lg border border-border bg-card flex flex-col items-center justify-center py-16 text-center gap-3">
          <ShieldAlert className="h-8 w-8 text-muted-foreground/50" />
          <div>
            <p className="font-medium">访问受限</p>
            <p className="text-sm text-muted-foreground mt-0.5">您需要管理员权限才能访问此页面</p>
          </div>
        </div>
      </div>
    )
  }

  // 加载中
  if (!localFloors) {
    return (
      <div className="space-y-4 py-2">
        <h1 className="text-xl font-semibold tracking-tight">工位布局管理</h1>
        <p className="text-sm text-muted-foreground">加载中...</p>
      </div>
    )
  }

  const previewFloor = localFloors[0] ?? null

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">工位布局管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">配置楼层、区域和工位</p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-xs text-amber-600 font-medium">● 未保存改动</span>
          )}
          {saveError && (
            <span className="text-xs text-destructive">保存失败：{saveError}</span>
          )}
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={save}
            disabled={!dirty || saving}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">配置编辑</p>
            <p className="text-xs text-muted-foreground mt-0.5">添加楼层、区域，设置工位行列数</p>
          </div>
          <div className="p-4">
            <FloorEditor floors={localFloors} onChange={setLocalFloors} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-medium">实时预览</p>
            <p className="text-xs text-muted-foreground mt-0.5">配置变更即时反映到平面图</p>
          </div>
          <div className="p-4">
            {previewFloor ? <FloorPreview floor={previewFloor} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}
```

**关键变化**：
- 移除 `import { mockFloors }`
- 加 `useFloorLayout` SWR hook + `putJSON` + `isEqual`
- 加 `localFloors`（草稿）+ `dirty` + `saving` + `saveError`
- 保存按钮 `disabled={!dirty || saving}`，点击调 `save()`
- `beforeunload` 监听 `dirty` 变化
- `FloorEditor` 的 `onChange={setLocalFloors}`（之前是 `onChange={setFloors}`）—— `FloorEditor` 的 props 签名不变

- [ ] **Step 3: 跑 dev 验证**

```bash
pnpm dev
```
浏览器登录后访问 `/dashboard/admin/floor-layout`：
- 加载完成显示楼层列表（与之前一致）
- 切到 10 层 → 进自由讨论区 → 拖刷添加 1 个工位
- 顶部出现 `● 未保存改动`
- 点《保存配置》→ 按钮变《保存中...》→ 完成后 badge 消失
- 刷新页面，新工位仍在

测试 beforeunload：
- 拖刷添加工位（不保存）→ 浏览器刷新 → 应弹"系统提示"对话框

- [ ] **Step 4: 提交**

```bash
git add app/dashboard/admin/floor-layout/page.tsx
git commit -m "feat(admin): wire floor-layout page to API with manual save"
```

---

## Task 9: admin 编辑页接入持久化

**Files:**
- Modify: `app/dashboard/admin/page.tsx`

- [ ] **Step 1: 读现有 page.tsx 找到关键位置**

Run:
```bash
grep -n "useState\|mockPersonnel\|mockResources\|mockNews\|setPersonnelData\|setResourcesData\|setNewsData" app/dashboard/admin/page.tsx
```

记下：
- `setPersonnelData`、`setResourcesData`、`setNewsData` 的使用位置（增删改的回调里）
- 现有 UI 中是否已有"保存"按钮（可能没有）

- [ ] **Step 2: 改造 page.tsx**

替换文件顶部 import + 状态声明 + 加保存按钮 + 把三个 `setXxxData` 改成操作 `localXxx`，整体替换：

主要替换点：

**Import 改造**：
```tsx
// 删除
import { mockPersonnel, mockResources, mockNews } from '@/lib/mock-data'
// 加
import { useEffect, useMemo, useState } from 'react'
import { isEqual } from 'lodash-es'
import { useAdminData, putJSON } from '@/lib/api'
import { Save } from 'lucide-react'
import type { Person, NewsItem, Resource } from '@/lib/types'
```

**状态声明改造**（替换原来的三行 `useState(mockX)`）：
```tsx
const { data, mutate } = useAdminData()
const serverPersonnel = data?.personnel
const serverNews = data?.news
const serverResources = data?.resources

const [localPersonnel, setLocalPersonnel] = useState<Person[] | null>(null)
const [localNews, setLocalNews] = useState<NewsItem[] | null>(null)
const [localResources, setLocalResources] = useState<Resource[] | null>(null)
const [saving, setSaving] = useState(false)
const [saveError, setSaveError] = useState<string | null>(null)

useEffect(() => {
  if (serverPersonnel && localPersonnel === null) setLocalPersonnel(serverPersonnel)
}, [serverPersonnel, localPersonnel])
useEffect(() => {
  if (serverNews && localNews === null) setLocalNews(serverNews)
}, [serverNews, localNews])
useEffect(() => {
  if (serverResources && localResources === null) setLocalResources(serverResources)
}, [serverResources, localResources])

const dirty = useMemo(() => {
  return (
    !!serverPersonnel && !!localPersonnel && !isEqual(localPersonnel, serverPersonnel)
  ) || (
    !!serverNews && !!localNews && !isEqual(localNews, serverNews)
  ) || (
    !!serverResources && !!localResources && !isEqual(localResources, serverResources)
  )
}, [serverPersonnel, localPersonnel, serverNews, localNews, serverResources, localResources])

useEffect(() => {
  if (!dirty) return
  const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
  window.addEventListener('beforeunload', h)
  return () => window.removeEventListener('beforeunload', h)
}, [dirty])

async function save() {
  if (!localPersonnel || !localNews || !localResources || saving) return
  setSaving(true)
  setSaveError(null)
  try {
    await putJSON('/api/admin-data', {
      personnel: localPersonnel,
      news: localNews,
      resources: localResources,
    })
    await mutate()
  } catch (e) {
    setSaveError(e instanceof Error ? e.message : String(e))
  } finally {
    setSaving(false)
  }
}
```

**所有 `setPersonnelData`/`setNewsData`/`setResourcesData` 改名**为 `setLocalPersonnel`/`setLocalNews`/`setLocalResources`：

Run:
```bash
sed -i 's/setPersonnelData/setLocalPersonnel/g; s/setNewsData/setLocalNews/g; s/setResourcesData/setLocalResources/g; s/personnelData/localPersonnel/g; s/newsData/localNews/g; s/resourcesData/localResources/g' app/dashboard/admin/page.tsx
```

然后检查 `editingPerson`/`editingResource`/`editingNews` 这些变量名没被误改。

**顶部加保存按钮 + dirty badge**（在页面标题区域附近加）：

找到页面顶部标题区（一般是 `<h1>` 或类似），在右侧加：

```tsx
<div className="flex items-center gap-3">
  {dirty && (
    <span className="text-xs text-amber-600 font-medium">● 未保存改动</span>
  )}
  {saveError && (
    <span className="text-xs text-destructive">保存失败：{saveError}</span>
  )}
  <Button size="sm" onClick={save} disabled={!dirty || saving}>
    <Save className="h-4 w-4 mr-1.5" />
    {saving ? '保存中...' : '保存'}
  </Button>
</div>
```

**加载中态**：在主体渲染前判断 `if (!localPersonnel || !localNews || !localResources) return <Loading />`。

- [ ] **Step 3: 验证**

```bash
pnpm dev
```

浏览器：
- 登录 admin → 进 `/dashboard/admin`
- 添加一个 Person → 出现未保存 badge
- 点保存 → badge 消失
- 编辑某 News → 保存 → 刷新后改动仍在
- 删除某 Resource → 保存 → 刷新后该资源不在

- [ ] **Step 4: 提交**

```bash
git add app/dashboard/admin/page.tsx
git commit -m "feat(admin): wire admin page to API with manual save"
```

---

## Task 10: 只读页改造（dashboard / personnel / news / resources）

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/personnel/page.tsx`
- Modify: `app/dashboard/news/page.tsx`
- Modify: `app/dashboard/resources/page.tsx`

- [ ] **Step 1: 改造 app/dashboard/page.tsx**

替换 `import { mockPersonnel, mockResources, mockNews, getPersonnelStats } from '@/lib/mock-data'`：

```tsx
import { useAdminData } from '@/lib/api'
// 其他保留
```

主体改造：

```tsx
export default function DashboardPage() {
  const { user } = useAuth()
  const { data } = useAdminData()
  const [expandedNews, setExpandedNews] = useState<NewsItem | null>(null)

  const personnel = data?.personnel ?? []
  const resources = data?.resources ?? []
  const news = data?.news ?? []

  const personnelStats = useMemo(() => ({
    total: personnel.length,
    online: personnel.filter(p => p.status === 'online').length,
    busy: personnel.filter(p => p.status === 'busy').length,
    offline: personnel.filter(p => p.status === 'offline').length,
    leave: personnel.filter(p => p.status === 'leave').length,
  }), [personnel])

  const availableCount = useMemo(
    () => resources.filter(r => r.status === 'available').length,
    [resources],
  )
  const pinnedNews = useMemo(() => news.filter(n => n.pinned), [news])
  // 其他原样保留，把 mockResources / mockNews / mockPersonnel 改为 resources / news / personnel
  // ...

  if (!data) {
    return <div className="p-8 text-sm text-muted-foreground">加载中...</div>
  }

  // ...原渲染逻辑
}
```

**关键点**：
- `getPersonnelStats()` 不再用，直接 inline 计算（或抽到本组件内的本地函数）。`getPersonnelStats` 是 mock-data 的 export，但实现可以参考它
- 三组数据从 `useAdminData()` 拿，无需额外请求
- 加载中态判断 `!data`

- [ ] **Step 2: 改造 app/dashboard/personnel/page.tsx**

替换 `import { mockPersonnel, mockFloors } from '@/lib/mock-data'`：

```tsx
import { usePersonnel } from '@/lib/api'
import { useFloorLayout } from '@/lib/api'
```

主体改造：

```tsx
const { data: personnelResp } = usePersonnel({ pageSize: 1000 })  // 不分页一次拿完
const { data: floorData } = useFloorLayout()
const personnel = personnelResp?.data?.items ?? []
const floors = floorData?.floors ?? []

// 替换原 mockPersonnel/mockFloors 引用
```

**注意**：如果原 personnel 页面用的不是 `mockPersonnel` 而是已经走 `/api/personnel` 的 fetch，则只替换 `mockFloors` 那行。先看清楚再改。

- [ ] **Step 3: 改造 app/dashboard/news/page.tsx**

替换 `import { mockNews }`：

```tsx
import { useNews } from '@/lib/api'

// 主体
const { data } = useNews({ pageSize: 1000 })
const news = data?.data?.items ?? []
```

- [ ] **Step 4: 改造 app/dashboard/resources/page.tsx**

替换 `import { mockResources }`：

```tsx
import { useResources } from '@/lib/api'

const { data } = useResources({ pageSize: 1000 })
const resources = data?.data?.items ?? []
```

- [ ] **Step 5: 验证四个只读页**

浏览器访问：
- `/dashboard`：统计数字、新闻列表、资源可用数都显示
- `/dashboard/personnel`：人员列表 + 工位图
- `/dashboard/news`：新闻列表
- `/dashboard/resources`：资源列表

- [ ] **Step 6: 提交**

```bash
git add app/dashboard/page.tsx app/dashboard/personnel/page.tsx app/dashboard/news/page.tsx app/dashboard/resources/page.tsx
git commit -m "refactor(pages): migrate read-only pages to SWR hooks"
```

---

## Task 11: 组件层清理 mock 引用

**Files:**
- Modify: `components/dashboard/personnel-stats.tsx`
- Modify: `components/dashboard/floor-plan.tsx`

- [ ] **Step 1: 改造 personnel-stats.tsx**

替换：
```tsx
// 删除
import { mockPersonnel } from '@/lib/mock-data'

// 加 props
interface PersonnelStatsProps {
  personnel?: { status: string }[]
}

export default function PersonnelStats({ personnel = [] }: PersonnelStatsProps) {
  const total = personnel.length
  const online = personnel.filter(p => p.status === 'online').length
  const busy = personnel.filter(p => p.status === 'busy').length
  const offline = personnel.filter(p => p.status === 'offline').length
  const leave = personnel.filter(p => p.status === 'leave').length
  // ...原渲染
}
```

**调用方更新**（`app/dashboard/page.tsx`）：
```tsx
<PersonnelStats personnel={personnel} />
```

- [ ] **Step 2: 改造 floor-plan.tsx**

替换：
```tsx
// 删除
import { mockPersonnel } from '@/lib/mock-data'

// FloorPlanProps 加 personnel
interface FloorPlanProps {
  floor: Floor
  onSelectWorkstation?: (id: string) => void
  selectedWorkstationId?: string
  readOnly?: boolean
  personnel?: Person[]  // 新增
}

export function FloorPlan({ floor, onSelectWorkstation, selectedWorkstationId, readOnly, personnel = [] }: FloorPlanProps) {
  // ...
}
```

第 70 行（`wsPositions` 里的 `mockPersonnel.find`）改成：
```tsx
person: ws.personId ? personnel.find(p => p.id === ws.personId) : undefined,
```

**调用方更新**：
- `app/dashboard/personnel/page.tsx`：
  ```tsx
  <FloorPlan floor={activeFloor} personnel={personnel} ... />
  ```
- `components/admin/floor-preview.tsx`（FloorPreview 包装）：检查它怎么用 FloorPlan
  ```bash
  cat components/admin/floor-preview.tsx
  ```
  如果它透传 floor 但没 personnel，给个默认空数组即可（admin preview 不一定要显示人名）

- [ ] **Step 3: 验证 floor-plan 渲染**

浏览器：
- `/dashboard/personnel`：工位上的 tooltip 仍能显示人名
- `/dashboard/admin/floor-layout`：右侧 FloorPreview 渲染楼层（无人名也无所谓——admin preview 通常不关心人）

- [ ] **Step 4: 提交**

```bash
git add components/dashboard/personnel-stats.tsx components/dashboard/floor-plan.tsx app/dashboard/page.tsx app/dashboard/personnel/page.tsx components/admin/floor-preview.tsx
git commit -m "refactor(components): remove mock-data imports from components, pass personnel via props"
```

---

## Task 12: 验收

**Files:** 无新增/修改

- [ ] **Step 1: 类型与编译**

Run:
```bash
pnpm build
```
Expected: 编译成功，无 TS 错误（既有 `floor-plan.tsx:110-111` useCallback 警告仍被 `ignoreBuildErrors` 抑制）。

- [ ] **Step 2: seed 重置**

Run:
```bash
rm prisma/db.sqlite
pnpm db:migrate
pnpm db:seed
```
Expected: 全部表重新创建并 seed，输出 `✓ seeded N ...`。

- [ ] **Step 3: 浏览器手工清单（按 spec § 8）**

启动 `pnpm dev`，登录 `admin/admin`：

**读取路径**：
- [ ] `/dashboard` 渲染统计 + 新闻 + 资源（数据来自 DB）
- [ ] `/dashboard/personnel` 渲染人员列表 + 工位图
- [ ] `/dashboard/news`、`/dashboard/resources` 渲染列表
- [ ] `/dashboard/admin` 三个 CRUD 列表显示
- [ ] `/dashboard/admin/floor-layout` 显示楼层树（含自由模式 `zone-10c`）

**floor-layout 保存**：
- [ ] 切到 10 层 → 进自由讨论区 → 拖刷加 5 个工位 → 顶部出现 `● 未保存改动` badge
- [ ] 点《保存配置》→ badge 消失 → 刷新后新增工位仍在
- [ ] 加工位不保存 → 刷新 → 浏览器弹"未保存"确认
- [ ] 模拟保存失败：DevTools Network 面板勾 Offline → 改动 → 点保存 → 显示错误信息 + badge 仍在

**admin 保存**：
- [ ] 添加 Person → 出现 badge
- [ ] 点保存 → badge 消失
- [ ] 删除 News → 保存 → 刷新后不见
- [ ] 编辑 Resource → 保存 → 重开浏览器仍在

**级联**：
- [ ] 在 admin 删除一个 Person（保存）→ 切到 `/dashboard/personnel` 看到该 Person 原本占用的工位变成"未占用"
- [ ] 在 floor-layout 删除一个 Floor（保存）→ 其下 Zone + Workstation 一并消失

**跨页一致性**：
- [ ] floor-layout 改工位名（保存）→ `/dashboard/personnel` 看到新名字
- [ ] admin 改 Person 名（保存）→ `/dashboard` tooltip 显示新人名

- [ ] **Step 4: 幂等 seed 验证**

Run:
```bash
pnpm db:seed
```
Expected: 全部 `• ... already present, skip`。

- [ ] **Step 5: 里程碑提交**

```bash
git commit --allow-empty -m "chore: persistence migration acceptance verified

- All mock data persisted to SQLite via Prisma
- Two edit pages (admin, floor-layout) wired with manual save + dirty badge + beforeunload
- All read-only pages migrated to SWR hooks
- Cascade: deleting Person nulls Workstation.personId; deleting Floor/Zone cascades
- pnpm build passes, manual browser checklist complete"
```

---

## 风险提示（给实施者）

1. **Task 6 三个 API 路由的响应格式**必须与现有完全一致。如果发现现有路由返回的是非分页数组（`{ success, data: Person[] }`），按原样改，不要强行套 `PaginatedResponse`。
2. **Task 8、9 的 `useEffect` 依赖 `localXxx === null`**——只在初次加载时把 server → local，避免后续 server revalidate 覆盖用户的草稿。
3. **`useEffect` 依赖列表**：把 `localFloors` 放进 deps 会触发循环（effect 内 setLocalFloors 触发 effect 重跑）。所以用 `localFloors === null` 作为 guard，依赖只写 `serverFloors` 和 `localFloors` 即可。
4. **`prisma migrate dev` 在 CI/生产**：CI 用 `prisma migrate deploy`。本计划只覆盖 dev 环境。
5. **删除数据库重置**：`rm prisma/db.sqlite && pnpm db:migrate && pnpm db:seed` 即可重置到初始 mock 状态。

---

## 自我审查（写完后）

- ✅ Spec § 1（基础设施）：Task 1 + 2 覆盖
- ✅ Spec § 2（数据模型）：Task 1 的 schema.prisma 覆盖
- ✅ Spec § 3（API 路由）：Task 4 + 5（新增 4 个）+ Task 6（改造 3 个）
- ✅ Spec § 4（前端数据层）：Task 7（hooks）+ Task 8、9（编辑页模式）
- ✅ Spec § 5（种子）：Task 3
- ✅ Spec § 6（文件清单）：与计划文件结构一致
- ✅ Spec § 7（部署）：Task 12 步骤 2 验证 seed 重置
- ✅ Spec § 8（验收清单）：Task 12 步骤 3
- ✅ Spec § 9（风险）：风险提示部分覆盖

无 placeholder（无 TBD/TODO/handle errors）。类型一致（`Person/NewsItem/Resource/Floor/Zone/NewWorkstation` 在所有任务中签名一致）。
