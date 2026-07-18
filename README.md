# IDRL Portal · 智能数据研究实验室门户

[![CI](https://github.com/zweien/idrl-portal/actions/workflows/ci.yml/badge.svg)](https://github.com/zweien/idrl-portal/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-100%20passed-brightgreen)](https://github.com/zweien/idrl-portal/blob/master/tests)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/license-private-lightgrey)](#-许可证)

> 实验室信息聚合门户——跟踪人员在位情况、资源链接与新闻公告，并提供可视化工位平面图管理；深度集成钉钉考勤与组织架构。

IDRL Portal 是一个为科研实验室设计的内部信息看板。它把人员考勤（钉钉同步）、工位分布、常用资源、新闻公告整合到一个中文界面里；管理员可视化管理楼层 / 区域 / 工位布局、用户权限、API 密钥与后台调度。

## ✨ 功能

### 面向成员
- **仪表盘** — 人员状态统计、工位使用概览、最新新闻（按分类聚合）、快捷资源入口
- **人员与工位** — 可交互的 SVG 工位平面图（楼层切换、缩放），点击工位查看人员详情（含打卡时间、出差/请假状态）
- **资源聚合** — 实验室常用工具 / 文档入口，按分类筛选，Markdown 富文本描述
- **最新动态** — 论文发表、通知、活动、荣誉成就，支持置顶、分类筛选与搜索

### 面向管理员
- **信息管理** — 新闻 / 资源 / 人员的增删改；新闻支持**草稿 / 立即发布 / 定时发布**；统一**分类体系**（Category 表，新闻 + 资源共用）
- **工位布局编辑** — 可视化编辑楼层、区域（grid / free）与工位几何；右侧实时预览；**一人一工位**约束（DB 唯一索引 + 写入校验）；支持 xlsx 批量导入工位分配
- **用户管理** — 设置登录账号角色（管理员 / 成员）、关联人员档案、**封禁**（登录 + API 双层拦截，已登录 session 即时失效）、自保护防锁死
- **API 密钥** — 颁发带 **scope** 的机器密钥（同步 / 发布 / 读取），sha256 哈希存储；每 key 可配置速率限额
- **调度设置** — node-cron 后台调度（成员同步 / 考勤同步 / 定时发布），Admin UI 改周期无需重启；SyncLog 执行审计

### 钉钉集成
- **成员同步** — 拉取部门成员，建立 Person 档案（职位 / 邮箱 / 手机），自动关联钉钉登录账号
- **考勤同步** — 拉取当日打卡 / 请假 / 出差，按优先级映射状态（**出差 > 请假 > 在位 > 未到**），记录打卡时间与出差事由
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
| `DINGTALK_CLIENT_ID` / `DINGTALK_CLIENT_SECRET` | 钉钉扫码登录 |
| `DINGTALK_DEPT_ID` | 钉钉成员同步的部门根 id |
| `DINGTALK_TRIP_PROCESS_CODE` | 京外出差审批流程码 |

## 📜 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动开发服务器（Turbopack） |
| `pnpm build` | 生产构建（强制类型检查） |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | ESLint 检查 |
| `pnpm test` | Vitest 测试 |
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
/dashboard/resources    → 资源聚合
/dashboard/news         → 最新动态
/dashboard/admin        → 管理后台（人员 / 用户 / 资源 / 新闻 / 分类 / 调度 / API 密钥 / 工位布局）
```

### 数据模型

```
Floor  1—* Zone  1—* Workstation *—1 Person     （一人一工位唯一约束）
User *—1 Person                                   （登录账号 ↔ 人员档案）
Category 1—* NewsItem / Resource                  （统一分类，kind 区分）
ApiKey / Setting / SyncLog                         （密钥 / 调度配置 / 审计）
```

Prisma schema 见 `prisma/schema.prisma`；SQLite 文件 `prisma/db.sqlite`（gitignore）。

### 关键模式

- **API**：`app/api/*` Route Handlers，SWR hooks 消费（`lib/api.ts`）。敏感写操作走 `requireAdmin`；机器调用走带 scope 的 API 密钥（`requireScope` / `requireUserOrScope`）。
- **认证**：iron-session 签名 cookie + middleware 路由保护。`requireUser`/`requireAdmin` 每次重查 User 行，**即时**反映封禁与角色变更（不等 7 天 cookie 过期）。
- **限流**：API 密钥按 key 限额（DB 原子计数，多实例共享），超限返回 429 + `Retry-After`。
- **调度**：`instrumentation.ts` 启动注册 node-cron；任务每分钟心跳，重读 `Setting` 表的 cron 表达式（北京时间解释），改动无需重启。
- **钉钉同步**：核心逻辑在 `lib/dingtalk-sync.ts`（route 与 scheduler 共用），access_token 缓存；`Person.role` 直接存钉钉职位原文。

### 目录约定

```
app/                Next.js App Router（页面 + API 路由）
components/ui/      shadcn/ui 基础组件
components/dashboard/  仪表盘领域组件
components/admin/   管理后台组件
lib/                工具、类型、auth、API hooks、调度、限流
lib/db/             Prisma client、seed、序列化
prisma/             schema + migrations + 本地 sqlite
tests/              Vitest 测试
```

导入使用 `@/*` 路径别名。

## 🧪 测试

使用 Vitest（`pnpm test`），当前 100 个测试，覆盖：session round-trip / 篡改拒绝 / `SESSION_SECRET` fail-fast、`requireUser`/`requireAdmin`/`requireScope`（含 429/封禁/live-role）、middleware 路由保护、User upsert 唯一性、Workstation 一人一工位唯一约束、Category 唯一约束、API key 限流原子计数、调度 cron 匹配（北京时间）、钉钉考勤优先级映射、定时发布时间戳归一、Person.role 自由文本（含空值）。CI（`.github/workflows/ci.yml`）在 push / PR 时跑 tsc + test + build。

## 📄 许可证

私有项目，未声明开源许可证。
