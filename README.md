# IDRL Portal · 智能数据研究实验室门户

> 实验室信息聚合门户——跟踪人员在位情况、资源链接与新闻公告，并提供可视化工位平面图管理。

IDRL Portal 是一个为科研实验室设计的内部信息看板。它把人员考勤、工位分布、常用资源、新闻公告整合到一个中文界面里，管理员还可视化地编辑楼层 / 区域 / 工位布局。

## ✨ 功能

- **仪表盘** — 人员状态统计、工位使用概览、最新新闻与快捷资源入口
- **人员与工位** — 可交互的 SVG 工位平面图（支持楼层切换、缩放），点击工位查看对应人员详情
- **工位布局管理** — 管理员可视化编辑楼层、区域（grid / free 两种模式）与工位几何；右侧实时预览
- **资源链接** — 实验室常用工具 / 文档的聚合入口
- **新闻公告** — 论文发表、实验室通知、活动、荣誉成就，支持置顶
- **认证** — 客户端登录（`admin/admin` 为管理员），预留 SSO（Authentik / 钉钉）接入位

## 🛠 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16（App Router）+ React 19 |
| 语言 | TypeScript（strict） |
| 样式 | Tailwind CSS v4（oklch 设计令牌） |
| UI 组件 | shadcn/ui（new-york）+ Radix + lucide-react |
| 表单 | react-hook-form + zod |
| 图表 | recharts |
| 数据库 | SQLite（better-sqlite3）+ Prisma 7 |
| 数据获取 | SWR |
| 包管理 | pnpm |

## 🚀 快速开始

### 环境要求

- Node.js ≥ 20
- pnpm ≥ 10

### 安装与运行

```bash
pnpm install      # 安装依赖（含 postinstall: prisma generate）
pnpm exec prisma migrate deploy   # 应用数据库 schema（首次必做，否则页面卡在加载中）
pnpm db:seed      # 写入示例数据：8 人员 / 6 新闻 / 6 资源 / 2 楼层 / 6 区域 / 60 工位

pnpm dev          # 启动开发服务器，默认 http://localhost:3000
```

> **首次运行提示**：`pnpm install` 只运行 `prisma generate`，不会建表或写种子数据。必须手动执行上面的 `migrate deploy` 与 `db:seed`，否则所有 `/api/*` 接口会因表不存在而返回 500。

### 自定义端口

```bash
pnpm exec next dev -p 3500   # 或 PORT=3500 pnpm dev
```

### 登录

- 管理员：`admin` / `admin`
- 普通成员：任意凭据即可登录（`role: member`）

## 📜 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动开发服务器（Turbopack） |
| `pnpm build` | 生产构建（忽略 TS 构建错误） |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | ESLint 检查 |
| `pnpm db:generate` | 生成 Prisma Client |
| `pnpm db:migrate` | 创建并应用新 migration（开发） |
| `pnpm db:seed` | 写入示例数据（幂等） |

## 🏗 架构

### 路由

```
/                     → 重定向到 /login
/(auth)/login         → 登录页（AuthProvider 包裹）
/dashboard            → 主仪表盘
/dashboard/personnel  → 人员与工位平面图（只读 + 管理员配置入口）
/dashboard/resources  → 资源链接
/dashboard/news       → 新闻公告
/dashboard/admin      → 管理后台（人员 / 资源 / 新闻 / 工位布局编辑）
/dashboard/admin/floor-layout → 工位布局可视化编辑器
```

所有 dashboard 页面共享 `app/dashboard/layout.tsx`，提供 `AuthProvider` 与侧边导航；未登录用户被重定向到 `/login`。

### 数据模型

```
Floor  1—* Zone  1—* Workstation *—1 Person
```

- **Floor** — 楼层（如 9 层、10 层）
- **Zone** — 区域，`grid`（行列网格）或 `free`（自由布局）两种模式
- **Workstation** — 工位，有行列坐标与可选的占用人员
- **Person** — 人员，含角色、状态、研究方向

Prisma schema 见 `prisma/schema.prisma`；SQLite 数据库文件为 `prisma/db.sqlite`（已在 `.gitignore`，本地生成）。

### 关键模式

- **API**：`app/api/*` Route Handlers（`/api/personnel`、`/api/news`、`/api/resources`、`/api/admin-data`、`/api/floor-layout`），支持分页与筛选。前端用 SWR hooks（`lib/api.ts`）消费。
- **认证**：客户端 React Context（`lib/auth-context.tsx`），`sessionStorage` 持久化。Mock 登录接受任意凭据。
- **工位平面图**：`components/dashboard/floor-plan.tsx` 渲染交互式 SVG，按楼层 / 区域 / 工位几何计算布局，状态图例固定在右上角缩放控件下方。
- **布局编辑器**：`/dashboard/admin/floor-layout` 左编辑 + 右实时预览双栏，"当前选中楼层"作为页面层单一数据源驱动两侧。

### 目录约定

```
app/                Next.js App Router（页面 + API 路由）
components/ui/      shadcn/ui 基础组件
components/dashboard/  仪表盘领域组件
components/admin/   管理后台组件
lib/                工具、类型、mock 数据、auth、API hooks
lib/db/             Prisma client、seed、序列化
hooks/              自定义 React hooks
prisma/             schema + migrations + 本地 sqlite 文件
```

导入使用 `@/*` 路径别名（指向项目根）。

## 🧪 测试

本项目目前未配置测试框架。验证以开发服务器手动浏览器测试为主。

## 📄 许可证

私有项目，未声明开源许可证。
