# IDRL Portal Design

状态：2026-10-13 完成 IDRL VI（视觉识别）接入重构。品牌规则上游为 `idrl-vi` 仓库的 `DESIGN.md` 与 `assets/brand/tokens.json`（视觉基础 v0.1，2026-10-12 已审核）。本文是其在本项目落地的主入口：上游未覆盖处沿用本项目的既有模式，并在「新增约定与例外」中记录。

## 资产位置

- Logo（官方 SVG）：`public/brand/logo/`。横向组合 `lockup-idrl(.reverse).svg`、双语组合 `lockup-bilingual(.reverse).svg`、仅图形 `symbol-color(.reverse).svg`。
- 字体与授权：`public/brand/fonts/`（InterVariable.woff2 + OFL 许可）。
- 语义 token 原始值：`public/brand/tokens.json`（由 VI 仓库生成，勿手改）。
- Favicon 生成脚本：`node scripts/generate-favicons.mjs`（navy 底 + reverse 图形，sharp 来自 next 的传递依赖）。
- React 封装：`components/brand.tsx`（`<Brand variant="wordmark|bilingual|symbol" width={} theme="auto|light|dark" />`）。

## 名称与语气

- 中文全称：智能设计与鲁棒学习；英文：Intelligent Design and Robust Learning；缩写 IDRL。
- 任何 logo、页面标题、页脚与宣传名称不得把 IDRL 展开为「…实验室 / …Laboratory」。「IDRL Portal」作为产品名可以使用。
- 语气严谨、探索、开放；状态与指标描述必须具体，不虚构数据。

## Logo 使用

- 浅／白底用彩色资产，深色底（含品牌 navy 面板）必须用 `-reverse` 专用资产；**禁止用 CSS 滤镜把彩色 logo 整体变白**。
- 主题切换由 `components/brand.tsx` 输出双 `<img>` + `globals.css` 的 `.brand-light/.brand-dark` 工具类在 CSS 层完成（SSR 安全）；常驻深色面板用 `theme="dark"` 固定 reverse 资产。
- 当前使用点：侧栏展开 = 字标（宽 88px）、侧栏收起 = 图形（宽 32px）、移动端头部 = 字标（84px）、登录页 = 双语组合；登录页右侧为品牌 navy 面板 + reverse 双语组合。
- 净空 ≥ 图形高度的 1/4；不拉伸、不旋转、不加描边；图形最小宽度建议 32px。

## 颜色与主题

- 品牌三主色：navy `#203663`、blue `#236db9`、cyan `#56c0e5`。深浅主题均使用 VI 的独立语义值（见 `app/globals.css`），深色不做整体反转。
- 语义变量映射（globals.css）：shadcn 的 `--primary ← VI primary`、`--card/--popover ← VI surface`、`--muted/--secondary ← VI surface-subtle`、`--accent ← VI accent`、`--input ← VI control-border`、`--ring ← VI focus`；并新增 `--primary-hover`、`--success`、`--warning`、`--color-success/--color-warning/--color-primary-hover/--color-brand-navy|blue|cyan` 工具色。
- 页面代码只允许语义类 / `var(--…)`；禁止新增 hex、rgb、oklch 字面量或 Tailwind 命名色（`text-amber-600` 等）。
- 考勤状态映射：present→success、absent→destructive、trip→primary、leave→warning（`--status-*` 变量；SVG 中经 `lib/floor-constants.ts` 的类名引用，展示属性需用 `style={{ fill: 'var(--…)' }}`，attribute 不支持 `var()`）。
- 功能色（destructive/warning/success）必须配文字或图标，不能只靠颜色；错误/警告横幅统一 `border-warning/30 bg-warning/5 + text-warning` 模式。
- Cyan 只用于图形、装饰和浅色强调底，不用于白底小号正文或白字按钮。深 navy 品牌色块（如登录页右栏）配白字与 cyan 圆点。
- 图表类别色 `--chart-1..5`：blue → navy → cyan → success → warning（深色主题用各自的深色适配值，navy 深色用 reverse 资产适配色 `#8fb8dc`）；系列多于 3 组时优先分面，并按 VI 要求加线型/标记/标签。

## 字体

- 英文与数字：Inter（`next/font/local` 自托管 InterVariable.woff2，变量 `--font-inter`）；代码用平台等宽字体（`--font-mono`，不再使用 JetBrains Mono）。
- 中文：字体栈 `Inter, 'Noto Sans CJK SC', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', …`。**新增约定**：VI 提供的中文 woff2 是其演示文案的子集（~190KB），门户内容为动态数据，不适合固定子集 webfont，故中文回退系统 CJK 黑体；后续如需像素级一致，可为本门户文案生成专属子集后再引入。
- 数字指标与表格使用 `tabular-nums`（`<table>` 已在全局生效，StatCard 等大数字单独添加）。
- 内容文字 14px（text-sm），辅助文字 ≥12px，正文行高 1.6。

## 布局、圆角与动效

- 4px 间距网格；内容区 `p-4 lg:p-6`（手机 16px / 桌面 24px），最大宽 1600px（工作台型应用可铺满，沿用既有模式）。
- 圆角：控件 `rounded-md` 6px、卡片 `rounded-xl` 12px、弹窗 `rounded-2xl` 16px（`--radius-xl: 0.75rem`，Tailwind 默认 2xl=1rem）。
- 动效 tokens `--motion-fast/normal/slow`（120/180/240ms），`prefers-reduced-motion` 时全局归零。
- 弹窗（Dialog/AlertDialog）：`bg-card` + `rounded-2xl`；遮罩用品牌 navy（`bg-brand-navy/60`，深色 `black/60`）。

## 新增约定与例外（上游 VI 未覆盖）

1. **中文 webfont 策略**：见「字体」，回退系统 CJK 黑体。
2. **图表类别色**：VI 只定义三个品牌主色；门户以「三主色 + 功能色」组成 5 色类别板（`--chart-1..5`），全篇映射一致。
3. **考勤状态→功能色映射**：`--status-*` 锚定 VI 功能色，替代旧的独立 oklch 值。人员状态徽章全站统一为「状态色 15% 底 + 状态色文字 + 30% 描边」样式（`bg-[var(--status-X)]/15 …`），管理页表格、人员页、考勤页、平面图同一状态必须同色；资源状态徽章同规则（可用→present、维护中→absent）。
4. **工位区域（zone）颜色**：属于用户数据（入库渲染，编辑器无取色器）。新建区域按 `lib/floor-constants.ts` 的 `ZONE_COLOR_PALETTE`（品牌色板轮转）取默认色，种子数据已换品牌色；**已有数据库中的旧颜色不迁移**。
5. **排行榜金银铜**：保留既有 amber/slate/orange 命名色作为装饰性例外（名次同时有数字与文字标签，不单靠颜色表达）；如后续品牌化需另立方案。
6. **未使用的 shadcn 组件**（`ui/toast.tsx`、`ui/chart.tsx` 等）内的命名色不在本次清理范围；应用实际走 sonner（默认配色）。
7. `styles/globals.css` 为模板遗留死文件，已删除；唯一全局样式是 `app/globals.css`。
8. 品牌资产的深浅切换统一走 `components/brand.tsx`，不要直接 `<img>` 引 logo（避免漏掉 reverse 资产）。

## 检查

- `pnpm lint`、`pnpm test`（vitest，45 个文件）、`pnpm build`。
- 视觉验收：深浅主题下检查侧栏/登录页/仪表盘；确认深色底 logo 均为 reverse 资产、无滤镜。
