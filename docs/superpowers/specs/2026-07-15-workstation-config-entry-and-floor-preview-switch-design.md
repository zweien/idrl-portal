# 工位管理功能扩展：配置入口 + 预览楼层切换

**日期**：2026-07-15
**状态**：设计已批准，待实现
**范围**：两个小而独立的 UI 改进，纯前端，不动 API/数据库/类型

## 背景

工位管理目前有两个可用性问题：

1. **人员工位页面（`/dashboard/personnel`）是只读的**，没有任何入口指向工位布局编辑器。用户想调整工位布局时，必须自行导航到 `/dashboard/admin/floor-layout`，发现路径困难。

2. **工位布局管理页面（`/dashboard/admin/floor-layout`）右侧"实时预览"永远只显示 9 层**。根因在 `app/dashboard/admin/floor-layout/page.tsx:81`——预览楼层硬编码为 `localFloors[0]`（`floor-9` 的 `order: 0` 使其排在首位）。左侧 `FloorEditor` 内部维护了 `selectedFloorId` 状态（切换楼层编辑），但该状态被困在组件内部、未上抛到页面，导致右侧预览无法跟随。当前种子数据有 2 个楼层（`floor-9` / `floor-10`），10 层的预览无法查看。

## 目标

1. 人员工位页面提供一个跳转到工位布局编辑器的入口（仅管理员可见）。
2. 工位布局管理页面的右侧预览能跟随左侧编辑器当前选中的楼层，二者始终同步。

## 非目标（YAGNI）

- 不在人员工位页面就地编辑布局或分配工位。
- 不在右侧预览新增第二个独立的楼层切换控件（避免双状态不同步）。
- 不修改 API、数据库 schema、类型定义。
- 不改变 `FloorEditor` 内部的 `selectedZoneId`（区域选中）逻辑——它保持内部状态。

## 设计

### 需求 1：人员工位页面增加配置入口

**位置**：`app/dashboard/personnel/page.tsx` 页面头部右侧操作区（第 104 行 `<div className="flex flex-wrap items-center gap-2">` 内），与搜索框、状态筛选按钮同一区域。

**形态**：
- `<Button variant="outline" size="sm">`（与现有按钮视觉一致，`h-8 text-xs`）
- 图标：`Settings`（来自 `lucide-react`）
- 文案："工位布局配置"
- 用 `next/link` 的 `<Link>` 包裹，`Button asChild`，`href="/dashboard/admin/floor-layout"`

**权限**：
- 该页面已通过 `useAuth()` 获取 `user`。仅当 `user?.role === 'admin'` 时渲染该按钮。
- 目标页面 `/dashboard/admin/floor-layout` 自身已有 admin gating（page.tsx:54 渲染"访问受限"），作为双重保险，非管理员即便手动访问也会被拦截。

**布局调整**：为避免按钮挤入筛选按钮行，可将其放在筛选区最右侧，或用一个 `ml-auto` 把它推到行尾。最终样式以"与现有操作区视觉协调、不挤压搜索框"为准。

### 需求 2：预览跟随左侧选中的楼层

采用 **lift state up（状态上提）** 模式，使"当前选中楼层 id"成为页面层的单一数据源。

**数据流（改动后）**：

```
页面 selectedFloorId (single source of truth)
   │
   ├─► FloorEditor（受控：props value + onChange）
   │     - 用 selectedFloorId 显示当前编辑楼层
   │     - 切换/删除楼层时通过 onChange 回调通知页面
   │
   └─► previewFloor = localFloors.find(f => f.id === selectedFloorId) ?? null
         └─► FloorPreview（实时跟随）
```

**改动点**：

#### 2.1 `app/dashboard/admin/floor-layout/page.tsx`

- 新增 state：`const [selectedFloorId, setSelectedFloorId] = useState<string>(localFloors[0]?.id ?? '')`。
  - 注意初始化时机：`localFloors` 初始为 `null`，需在 `useEffect` 把 server 数据复制到 local 时一并初始化 `selectedFloorId`（若其为空）。或在派生 `previewFloor` 时对缺失 id 做兜底。
- 第 81 行改为派生：`const previewFloor = localFloors.find(f => f.id === selectedFloorId) ?? null`。
- `<FloorEditor>` 调用（第 116 行）新增受控 props：`selectedFloorId={selectedFloorId}` 和 `onSelectedFloorIdChange={setSelectedFloorId}`。

#### 2.2 `components/admin/floor-editor.tsx`

- Props 接口（第 13-16 行）新增：
  - `selectedFloorId: string`
  - `onSelectedFloorIdChange: (id: string) => void`
- 第 24 行 `const [selectedFloorId, setSelectedFloorId] = useState(...)` **删除**，改为从 props 读取。
- 所有内部 `setSelectedFloorId(...)` 调用替换为 `onSelectedFloorIdChange(...)`：
  - 第 46 行 `addFloor`：新建楼层后选中新楼层 → `onSelectedFloorIdChange(id)`。
  - 第 53-55 行 `removeFloor`：删除当前选中楼层时重置 → 计算剩余楼层后 `onSelectedFloorIdChange(remaining[0]?.id ?? '')`。
  - 第 233 行楼层 tab 点击 → `onSelectedFloorIdChange(floor.id)`。
- `selectedZoneId` 保持内部 `useState` 不变（区域选择是编辑器内部关注点，预览不需要）。

**边界处理**：
- 删除选中楼层 → 重置为剩余首个楼层（沿用现有逻辑，仅改调用方式）。
- 删除所有楼层 → `selectedFloorId` 为 `''`，`previewFloor` 为 `null`，`FloorPreview` 不渲染（页面第 126 行已有 `{previewFloor ? <FloorPreview/> : null}`）。
- `FloorPreview` 组件本身无需改动——它已接受单个 `floor` prop 并有空态。

## 改动清单

| 文件 | 改动类型 | 说明 |
|---|---|---|
| `app/dashboard/personnel/page.tsx` | 新增 | 头部加 admin-only `<Link>` 按钮跳转 `/dashboard/admin/floor-layout` |
| `app/dashboard/admin/floor-layout/page.tsx` | 改 | 新增 `selectedFloorId` state；`previewFloor` 由它派生；传受控 props 给 `FloorEditor` |
| `components/admin/floor-editor.tsx` | 改 | `selectedFloorId` 由内部 state 改为受控 props；3 处 `setSelectedFloorId` 改为回调 |

## 验收标准

1. **需求 1**：
   - 以管理员登录 `/dashboard/personnel`，头部可见"工位布局配置"按钮，点击跳转到 `/dashboard/admin/floor-layout`。
   - 以非管理员登录，该按钮不显示。
2. **需求 2**：
   - 在 `/dashboard/admin/floor-layout` 左侧 `FloorEditor` 切换到"10层"，右侧预览立即显示 10 层布局。
   - 切回"9层"，右侧预览同步回到 9 层。
   - 删除当前选中楼层，预览自动切到剩余首个楼层且不报错。
   - 删除全部楼层，预览区为空（不渲染 `FloorPreview`），不报错。
3. 保存配置功能不受影响（`PUT /api/floor-layout` 行为不变）。
4. `beforeunload` 未保存提示、dirty 标记等既有功能不受影响。

## 风险与缓解

- **`selectedFloorId` 初始化竞态**：`localFloors` 异步从 SWR 到达。若 `selectedFloorId` 初始化为 `''` 而数据未到，首次渲染 `previewFloor` 为 `null`。需确保数据到达后正确初始化（在现有 `useEffect` 中处理，或在派生时兜底取 `floors[0]`）。实现时优先在 `localFloors` 首次赋值的 `useEffect` 里同步设置 `selectedFloorId`。
- **改动范围小、局部**：三个文件，无 API/DB 变更，回归风险低。
