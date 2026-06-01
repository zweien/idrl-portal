# 工位布局灵活化设计

## 背景

当前人员工位页面使用固定 SVG 平面图，硬编码 A/B/C/D 四个区域，无楼层概念。需要扩展为支持多楼层、多区域的灵活展示系统，并提供管理员工位配置能力。

## 需求

- 支持多楼层（如 9 层、10 层）分开展示
- 每层内支持多个逻辑区域，区域数量和布局可配置
- 管理员通过可视化编辑器管理楼层/区域/工位
- 普通用户仅查看工位状态
- 工位多时支持滚动和缩放

## 数据模型

### Floor（楼层）

```typescript
interface Floor {
  id: string        // 如 "floor-9"
  name: string      // 如 "9层"
  order: number     // 标签排序
  zones: Zone[]
}
```

### Zone（区域）

```typescript
interface Zone {
  id: string        // 如 "zone-9a"
  name: string      // 如 "教授区"
  floorId: string
  color: string     // 区域标识色（SVG 边框）
  order: number
  workstations: Workstation[]
}
```

### Workstation（工位，扩展现有类型）

```typescript
interface Workstation {
  id: string
  name: string      // 如 "A-01"
  zoneId: string
  floorId: string   // 冗余字段，方便查询
  row: number       // 区域内网格行号
  col: number       // 区域内网格列号
  personId?: string
  status: 'occupied' | 'empty' | 'maintenance'
}
```

**设计决策：**

- 工位用 `row/col` 网格坐标替代原来的 `x/y` 像素坐标，由 SVG 组件自动计算像素位置
- `Floor > Zone > Workstation` 三层嵌套
- `status` 表示工位状态（有人/空/维护），人员状态通过关联 `Person.status` 获取

## 页面结构

### 查看视图（所有用户，`/dashboard/personnel`）

- 顶部楼层标签（Tab 组件），点击切换当前楼层
- SVG 画布展示当前楼层的所有区域和工位
- 区域用虚线矩形 + 标题标注
- 工位显示状态色：绿（在位）、灰（离线）、黄（忙碌）、紫（请假）、白色虚线框（空位）
- 点击工位弹出右侧面板显示人员信息（复用现有交互）
- SVG 外层容器固定高度（`h-[600px]`），内容超出可滚动
- 提供缩放控制（+/- 按钮和滚轮缩放）

### 编辑视图（管理员，`/dashboard/admin/floor-layout`）

左右分栏布局：

- **左栏 — 配置表单：**
  - 楼层管理：添加/删除/重命名楼层，上下箭头调排序
  - 区域管理：选中楼层后，添加/删除/重命名区域，颜色选择器
  - 工位设置：选中区域后，设置行列数，系统自动生成对应数量工位
- **右栏 — SVG 实时预览：**
  - 复用 FloorPlan 组件（只读模式）
  - 表单变更时实时更新预览

数据存储当前阶段使用 JSON 配置文件，后续可迁移到数据库。

## SVG 渲染逻辑

1. 选中楼层 → 获取该楼层下所有区域
2. 每个区域根据包含的工位自动计算尺寸：
   - 工位单元格固定大小（70×50px）
   - 区域宽度 = `max(工位列数) × 单元格宽 + 间距`
   - 区域高度 = `工位行数 × 单元格高 + 间距 + 标题栏`
3. 区域采用流式布局，从左到右从上到下排列，每行最多 2-3 个区域
4. SVG 画布总尺寸根据区域布局动态计算

## 组件架构

### 新增/修改文件

| 文件 | 变更 |
|------|------|
| `lib/types.ts` | 新增 Floor、Zone 类型，扩展 Workstation |
| `lib/mock-data.ts` | 新增多楼层区域数据，替换原有固定四区域 |
| `components/dashboard/floor-plan.tsx` | 重写：多楼层、多区域、网格自动布局、滚动缩放 |
| `components/dashboard/floor-tabs.tsx` | 新增：楼层标签切换组件 |
| `app/dashboard/personnel/page.tsx` | 修改：集成楼层标签和新平面图 |
| `app/dashboard/admin/floor-layout/page.tsx` | 新增：管理员工位布局编辑页 |
| `components/admin/floor-editor.tsx` | 新增：编辑器左栏配置表单 |
| `components/admin/floor-preview.tsx` | 新增：编辑器右栏 SVG 预览 |

### 组件依赖

```
personnel/page.tsx
├── FloorTabs        ← 楼层切换，接收 floors[]
├── FloorPlan        ← SVG 平面图，接收单个 Floor
└── PersonDetailPanel ← 复用现有人员面板

admin/floor-layout/page.tsx
├── FloorEditor      ← 配置表单（楼层/区域/工位）
└── FloorPreview     ← SVG 预览，复用 FloorPlan（只读模式）
```
