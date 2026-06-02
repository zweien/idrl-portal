# 自由布局区域（Free Layout Zones）设计

- **日期**：2026-06-02
- **范围**：在现有 `floor-layout` 管理页与 `FloorPlan` 渲染层加入"自由模式"区域，使工位可以稀疏摆放（不强制 rows×cols 铺满），以适配柱子阻挡、走道拐弯、会议讨论区等不规则空间场景。
- **不在范围内**：持久化（保存到后端 / 数据库）、API 路由改动、`mockWorkstations` 旧字段迁移、工位旋转/跨格/非矩形形状。

---

## 背景与动机

当前 `lib/types.ts` 中 `Zone` 仅描述"规则网格"——`rows` × `cols` 决定区域尺寸，所有 cell 自动铺满工位（见 `mock-data.ts` 的 `generateWorkstations`）。这套模型在以下场景里捉襟见肘：

- **会议/讨论区**：四周就座、中间留空
- **柱子/设备阻挡**：某列某行需要跳过
- **L 形/拐角区域**：边界外的格子不该被填充

设计目标是在不破坏现有网格区域的前提下，给每个 zone 一个"自由"选项——保留栅格对齐性，但允许工位稀疏存放。

## 设计决策（已确认）

| # | 决策点 | 选择 |
|---|---|---|
| 1 | "不规则"指什么 | 区域仍是矩形，工位可任意坐标摆放（不强制行列网格） |
| 2 | 网格 vs 自由 | 双模式并存，每个 zone 独立选择 |
| 3 | 自由模式的坐标系 | 虚拟栅格吸附，工位用整数 `row/col`，可稀疏 |
| 4 | 编辑交互 | 拖拽"刷"法（add / remove 画笔）+ 点击单格 |
| 5 | 工位尺寸 | 固定 1×1，不旋转、不跨格 |
| 6 | 区域边界 | 每个 zone 独立 `maxRows/maxCols` |
| 7 | 工位命名 | 默认 `前缀-序号` 自动连续，可手动改名 |
| 8 | 删除行为 | 不重排；自定义命名的工位被删后，其他工位名不变 |
| 9 | 模式互转 | 单向：网格 → 自由（保留所有工位原 row/col） |
| 10 | 画布位置 | 嵌入 `floor-editor` 工位设置块下方 |

---

## § 1 · 数据模型（`lib/types.ts`）

```ts
export type ZoneMode = 'grid' | 'free'

export interface Zone {
  id: string
  name: string
  floorId: string
  color: string
  order: number
  mode: ZoneMode                              // 新增
  // grid 模式专用（free 模式下闲置，保留默认值）
  rows: number
  cols: number
  // free 模式专用（grid 模式下闲置，保留默认值）
  maxRows: number                             // 新增
  maxCols: number                             // 新增
  workstations: NewWorkstation[]
}

export interface NewWorkstation {
  id: string
  name: string
  zoneId: string
  floorId: string
  row: number
  col: number
  personId?: string
  status: WorkstationStatus
  nameCustomized?: boolean                    // 新增：手动改名标记
}
```

**关键点**：
- 工位层面**仅新增 `nameCustomized?` 一个字段**——`row/col` 已存在，自由模式只是允许稀疏
- `mode` 决定编辑器与渲染分支行为
- `nameCustomized` 用于实现"删除不重排"：决定哪些工位名是用户意图锁定

**迁移**：现有 `mockFloors` 所有 zone 补 `mode: 'grid'`、`maxRows: zone.rows`、`maxCols: zone.cols`。无破坏性。

---

## § 2 · 编辑器架构

### 布局

`/dashboard/admin/floor-layout` 现有左右双栏（左 `FloorEditor`，右 `FloorPreview`）保持不变。改动集中在 `FloorEditor` 内部：

```
┌─ 楼层管理 ─────────────────────┐
├─ 区域管理 · 9层 ───────────────┤
├─ 工位设置 · 博士生区 [模式: 自由] ┤
│   ├─ 最大行/列输入
│   └─ 模式切换按钮（grid → free 单向）
└─ 自由布局画布（仅 free 模式显示） ┘
   ┌────────────────────────────────┐
   │ [添加] [清除] 画笔切换  │ 改名输入│
   │ ┌──┬──┬──┬──┬──┐               │
   │ │  │■ │  │■ │  │ 拖拽刷        │
   │ ├──┼──┼──┼──┼──┤               │
   │ │■ │■ │  │  │  │               │
   │ └──┴──┴──┴──┴──┘               │
   └────────────────────────────────┘
```

### 新组件

| 路径 | 职责 |
|---|---|
| `lib/floor-constants.ts` | 抽出 `CELL_W/CELL_H/CELL_GAP/ZONE_PAD/ZONE_TITLE_H` 与 `statusColors/statusLabels` 等共享常量 |
| `components/admin/zone-free-canvas.tsx` | 自由模式拖拽刷画布（SVG），含工具栏、改名输入 |

### 模式切换

- **`grid → free`**：当前铺满的工位保留 `row/col`，标记 `nameCustomized: false`，区域 `mode = 'free'`，`maxRows = rows`、`maxCols = cols`
- **`free → grid`**：按钮禁用 + tooltip "自由模式无法转回网格（会丢失稀疏布局）"

### 工位设置区（自由模式特有）

- `maxRows` / `maxCols` 数字输入（带最小尺寸保护，见 § 4）
- 当前工位数 / 容量上限显示
- 选中工位后激活"重命名"输入框

---

## § 3 · 渲染层（`components/dashboard/floor-plan.tsx`）

仅 `layoutZones()` 尺寸计算分支化，工位渲染逻辑完全不变。

```ts
function layoutZones(floor: Floor) {
  for (const zone of sorted) {
    let zoneW, zoneH
    if (zone.mode === 'free') {
      zoneW = ZONE_PAD * 2 + zone.maxCols * (CELL_W + CELL_GAP) - CELL_GAP
      zoneH = ZONE_TITLE_H + ZONE_PAD + zone.maxRows * (CELL_H + CELL_GAP) - CELL_GAP + ZONE_PAD
    } else {
      zoneW = ZONE_PAD * 2 + zone.cols * (CELL_W + CELL_GAP) - CELL_GAP
      zoneH = ZONE_TITLE_H + ZONE_PAD + zone.rows * (CELL_H + CELL_GAP) - CELL_GAP + ZONE_PAD
    }
    // 工位定位两种模式完全一致：用 ws.row/ws.col
  }
}
```

### 视觉差异（自由模式）

- 区域外框内显示**淡栅格底纹**（虚线 pattern，`opacity: 0.3`），网格模式不显示
- 空 cell 不显示任何占位（与现状一致）
- 工位状态点、tooltip、缩放、状态图例等行为完全复用现有实现

`FloorPlan` 公共 API 不变：`floor` / `onSelectWorkstation` / `selectedWorkstationId` / `readOnly`。

---

## § 4 · 自由画布交互（`zone-free-canvas.tsx`）

### 画笔模式与"拖拽 vs 单击"

顶部工具栏切换画笔，默认 `add`。**拖拽**与**单击**是不同动作：

- **拖拽**（按下并移动 >1 格距离）：执行画笔刷法
- **单击**（按下立即抬起，未移动）：选中该格用于改名（无论画笔模式）

| 模式 | 拖拽经过的 cell | 单击 cell |
|---|---|---|
| `add` | 空 → 添加工位；已有 → 无变化 | 空 → 添加；已有 → 选中（改名） |
| `remove` | 空 → 无变化；已有 → 删除 | 空 → 无变化；已有 → 选中（改名） |

**理由**：单击是"指向"的天然语义；拖拽是"批量操作"。两者分开避免改名与添加冲突。remove 模式下也保留单击选中，便于先选后改名再决定是否删除。

### 拖拽实现

- `onPointerDown` 记录起始 cell，进入"刷"状态；指针移动距离 < 阈值（如 4px）视为单击
- `onPointerMove` 计算起点 cell 到当前指针所在 cell 构成的**矩形范围**内所有 cell，加入待处理集合（box-select 语义）
- `onPointerUp` 一次性提交：根据画笔模式批量 `add`/`remove`，触发一次 `onChange`
- `setPointerCapture` 防止鼠标移出 SVG 时丢失事件

### SVG 结构

```
<svg viewBox="0 0 zoneW zoneH>
  <rect 外框 />
  <pattern 栅格底纹 (free 专属) />
  <g 每个 cell>
    <rect 空白底 (透明) />
    <rect 工位 (若存在) />
    <text 工位名 />
    <circle 状态点 (若有 personId) />
  </g>
</svg>
```

### 命名规则

- 新增工位：序号 = 该 zone 工位 id 序号最大值 + 1，名字 = `${区域首字符}-${String(seq).padStart(2, '0')}`
- 与现有 `generateWorkstations` 规则一致
- `nameCustomized: false`

### 选中后改名

- 点击画布已有工位 → 工具栏下方出现输入框，显示当前 name
- 用户修改 → `nameCustomized: true`，立即 onChange
- 清空输入 → 回退为默认命名规则生成的值，`nameCustomized: false`

### 删除行为

- 删除任意工位后，**其他工位的 name 不变**
- 即使被删的工位 `nameCustomized: true`，也只删自己，不影响其他

### 边界与最小尺寸保护

- 拖拽超出 `maxRows/maxCols` 范围的格不响应
- `maxRows/maxCols` 输入失焦时校验：
  ```
  newMaxRows >= max(ws.row) + 1
  newMaxCols >= max(ws.col) + 1
  ```
  违规则回退上一次合法值并 toast 提示"无法缩小到能容纳现有工位的最小尺寸以下"

---

## § 5 · Mock 数据

### 现有 zone

所有 zone 补默认值：

```ts
{
  ...existingZone,
  mode: 'grid',
  maxRows: existingZone.rows,
  maxCols: existingZone.cols,
}
```

### 新增示例自由模式区域

放在 `floor-10` 下，用作编辑器与渲染联调样例：

```ts
{
  id: 'zone-10c',
  name: '会议讨论区',
  floorId: 'floor-10',
  color: 'oklch(0.60 0.12 30)',
  order: 2,
  mode: 'free',
  rows: 0, cols: 0,
  maxRows: 4, maxCols: 6,
  workstations: [
    { id: 'ws-zone-10c-1', name: 'M-01', zoneId: 'zone-10c', floorId: 'floor-10',
      row: 0, col: 1, status: 'empty' },
    { id: 'ws-zone-10c-2', name: 'M-02', zoneId: 'zone-10c', floorId: 'floor-10',
      row: 0, col: 4, status: 'empty' },
    { id: 'ws-zone-10c-3', name: 'M-03', zoneId: 'zone-10c', floorId: 'floor-10',
      row: 2, col: 0, status: 'empty' },
    { id: 'ws-zone-10c-4', name: 'M-04', zoneId: 'zone-10c', floorId: 'floor-10',
      row: 2, col: 5, status: 'empty' },
  ],
}
```

### 持久化

- 项目当前所有数据都是内存态（`useState` + mock），无数据库
- 本次范围内**不引入持久化**，保持 `useState + onChange` 链路
- 顶部"保存配置"按钮继续作为占位（与现状一致）

---

## § 6 · 验收清单（手工）

项目无测试框架，按以下用例人工核对。

### 类型与编译
- [ ] `pnpm build` 不报 TypeScript 错误
- [ ] `pnpm lint` 通过

### 渲染
- [ ] `/dashboard` 的 `FloorPlan` 显示原有网格区域，外观无变化
- [ ] `/dashboard/admin/floor-layout` 右侧预览显示新增"会议讨论区"，4 个工位稀疏分布
- [ ] 自由模式区域外框内显示淡栅格底纹（grid 模式不显示）

### 编辑器
- [ ] 选中网格区域 → 工位设置显示行列输入（现状不变）
- [ ] 选中自由区域 → 工位设置显示 maxRows/maxCols 输入，下方出现自由画布
- [ ] 默认画笔为"添加"，按下并拖拽 → 经过的空格变为工位，名字自动 `M-05/06/07...`
- [ ] 单击空白格 → 添加单工位；单击已有工位 → 选中（不删除/不重复添加）
- [ ] 切换"清除"画笔 → 拖拽删除工位；单击已有工位 → 选中（仍用于改名）
- [ ] 删除中间工位后，剩余工位名不变（删 M-05，M-06/M-07 保持原名）
- [ ] 点击已有工位 → 工具栏下方出现名称输入框；改名后 `nameCustomized: true`
- [ ] 改名后清空输入 → 名字回退为默认规则生成的值
- [ ] `grid → free` 按钮可用，转换后保留所有工位原 row/col
- [ ] `free → grid` 按钮禁用 + tooltip 解释

### 边界
- [ ] 拖拽超出 `maxRows/maxCols` 范围不响应
- [ ] 缩小 `maxRows/maxCols` 至能容纳现有工位的最小尺寸以下 → 失焦回退 + toast 提示

---

## § 7 · 受影响文件清单

### 修改
| 文件 | 改动 |
|---|---|
| `lib/types.ts` | `Zone` 加 `mode/maxRows/maxCols`；`NewWorkstation` 加 `nameCustomized?` |
| `lib/mock-data.ts` | 现有 zone 补默认值；新增 `zone-10c` 示例自由区域 |
| `components/dashboard/floor-plan.tsx` | `layoutZones` 按 `mode` 分支；自由模式显示栅格底纹 |
| `components/admin/floor-editor.tsx` | 区域/工位设置块按 `mode` 分支；模式切换按钮；嵌入画布；最小尺寸保护 |

### 新增
| 文件 | 用途 |
|---|---|
| `lib/floor-constants.ts` | 共享常量（CELL_W 等）与 status token |
| `components/admin/zone-free-canvas.tsx` | 自由模式拖拽刷画布 |

### 不动
- `app/dashboard/admin/floor-layout/page.tsx`（双栏布局已满足）
- `components/admin/floor-preview.tsx`（透传 `FloorPlan`）
- `app/dashboard/personnel/page.tsx` 及其他工位消费方（公共 API 不变）
