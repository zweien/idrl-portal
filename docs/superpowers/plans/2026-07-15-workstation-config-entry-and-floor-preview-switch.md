# 工位配置入口 + 预览楼层切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在人员工位页面增加跳转到工位布局编辑器的入口（管理员可见），并修复工位布局管理页面右侧预览永远只显示 9 层的问题（改为跟随左侧编辑器当前选中楼层）。

**Architecture:** 两个独立的小改动。需求 1 是在 `personnel/page.tsx` 加一个 admin-gated `<Link>` 按钮。需求 2 采用 lift-state-up：把 `selectedFloorId` 从 `FloorEditor` 内部 `useState` 上提到 `floor-layout/page.tsx` 页面层作为单一数据源，受控传给 `FloorEditor`，并派生出 `previewFloor` 传给 `FloorPreview`。纯前端，无 API/DB/类型变更。

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, shadcn/ui, lucide-react, pnpm。

**测试说明:** 本项目未配置测试框架（见 CLAUDE.md "No test framework is configured"）。每个任务以运行中的 dev server（http://localhost:3500）做手动浏览器验证替代 TDD 红绿循环。dev server 已在后台运行（task `exec_1d8a116e`）；若已停止，用 `pnpm exec next dev -p 3500` 重启。登录凭据：管理员 `admin/admin`，普通成员任意凭据。

## Global Constraints

- 包管理器：pnpm（不要用 npm/yarn）。
- 端口：3500（dev server）。
- 路径别名 `@/*` 指向项目根。
- 中文 UI 文案：按钮文案、标题等保持中文，与现有页面一致。
- 登录状态用 `useAuth()`（来自 `@/lib/auth-context`），管理员判断为 `user?.role === 'admin'`。
- TypeScript 严格模式，但 `next.config.mjs` 中 `ignoreBuildErrors: true`（构建不强制类型检查）。仍应保持类型正确。
- 频繁提交，每个任务一个 commit。

## File Structure

| 文件 | 责任 | 改动 |
|---|---|---|
| `app/dashboard/personnel/page.tsx` | 人员工位页面（只读视图 + 头部操作区） | 新增 admin-only「工位布局配置」跳转按钮 |
| `components/admin/floor-editor.tsx` | 工位布局左侧编辑器（楼层/区域/工位几何编辑） | `selectedFloorId` 从内部 state 改为受控 props |
| `app/dashboard/admin/floor-layout/page.tsx` | 工位布局管理页面（左编辑 + 右预览两栏） | 新增 `selectedFloorId` state，受控驱动编辑器与预览 |

无新文件创建。

---

### Task 1: 人员工位页面增加「工位布局配置」入口

**Files:**
- Modify: `app/dashboard/personnel/page.tsx`（头部操作区，约第 104-134 行；import 区第 1-13 行）

**Interfaces:**
- Consumes: `useAuth()` from `@/lib/auth-context`（返回 `{ user }`，`user.role === 'admin'` 判定管理员）。该页面当前未 import `useAuth`，需新增 import。
- Produces: 无（仅页面内按钮，不影响其他模块）。

**背景：** 该页面当前是只读的，头部操作区（`<div className="flex flex-wrap items-center gap-2">`，第 104 行）内有搜索框和状态筛选按钮。需在该区放一个管理员可见的跳转按钮。注意：`useAuth` 目前未在该页面 import/使用。

- [ ] **Step 1: 加 import**

在 `app/dashboard/personnel/page.tsx` 第 13 行（`import { Search, MapPin, Mail, User } from 'lucide-react'`）之后加：

```tsx
import Link from 'next/link'
import { useAuth } from '@/lib/auth-context'
import { Settings } from 'lucide-react'
```

（`Settings` 也可并入已有的 lucide import 行：将第 13 行改为 `import { Search, MapPin, Mail, User, Settings } from 'lucide-react'`，然后只单独加 `Link` 和 `useAuth` 两行。两种皆可，推荐合并以减少 import 行数。）

- [ ] **Step 2: 在组件内读取 user**

找到该页面主组件函数体（`export default function` 内，`useState`/`usePersonnel` 等 hooks 调用附近），加一行：

```tsx
const { user } = useAuth()
```

放在已有 hooks（如 `const { data } = useFloorLayout()` 或 `const [search, setSearch] = useState('')` 之类）紧邻处，保持 hooks 调用顺序稳定。

- [ ] **Step 3: 在头部操作区加按钮**

在头部操作区 `<div className="flex flex-wrap items-center gap-2">`（约第 104 行）内，状态筛选按钮 `{statusFilters.map(...)}` 之后（即该 `</div>` 闭合之前），插入：

```tsx
{user?.role === 'admin' && (
  <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 ml-auto" asChild>
    <Link href="/dashboard/admin/floor-layout">
      <Settings className="h-3.5 w-3.5" />
      工位布局配置
    </Link>
  </Button>
)}
```

`ml-auto` 把按钮推到操作行最右侧，避免挤压搜索框。`Button asChild` 让 `Link` 成为可点击根元素。

- [ ] **Step 4: 浏览器验证（管理员）**

1. 确认 dev server 在 3500 运行。
2. 用 `admin/admin` 登录，访问 `http://localhost:3500/dashboard/personnel`。
3. 预期：头部操作区最右侧出现「工位布局配置」按钮（带齿轮图标）。
4. 点击该按钮，预期跳转到 `http://localhost:3500/dashboard/admin/floor-layout`（显示"工位布局管理"页面）。

- [ ] **Step 5: 浏览器验证（非管理员）**

1. 退出登录，用任意非 admin 凭据登录（如 `member/123`）。
2. 访问 `http://localhost:3500/dashboard/personnel`。
3. 预期：头部操作区**没有**「工位布局配置」按钮。

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/personnel/page.tsx
git commit -m "feat(personnel): add admin-only link to floor-layout editor"
```

---

### Task 2: 把 `FloorEditor` 的 `selectedFloorId` 改为受控 props

**Files:**
- Modify: `components/admin/floor-editor.tsx`（Props 接口第 13-16 行；组件体第 23-25 行；`addFloor` 第 46 行；`removeFloor` 第 53-56 行；楼层点击第 233 行）

**Interfaces:**
- Consumes: 父组件传入 `selectedFloorId: string` 与 `onSelectedFloorIdChange: (id: string) => void`。
- Produces: `FloorEditor` 变为受控组件，selectedFloorId 由父组件持有。Task 3 的页面层会传入这两个 props。

**背景：** 当前 `selectedFloorId` 是 `FloorEditor` 内部 `useState`（第 24 行），导致页面层无法得知当前选中楼层，右侧预览拿不到。本任务把它改为受控 props。`selectedZoneId` 保持内部 state 不变。

- [ ] **Step 1: 扩展 Props 接口**

将第 13-16 行：

```tsx
interface FloorEditorProps {
  floors: Floor[]
  onChange: (floors: Floor[]) => void
}
```

改为：

```tsx
interface FloorEditorProps {
  floors: Floor[]
  onChange: (floors: Floor[]) => void
  selectedFloorId: string
  onSelectedFloorIdChange: (floorId: string) => void
}
```

- [ ] **Step 2: 解构新 props 并移除内部 state**

将第 23-25 行：

```tsx
export function FloorEditor({ floors, onChange }: FloorEditorProps) {
  const [selectedFloorId, setSelectedFloorId] = useState<string>(floors[0]?.id ?? '')
  const [selectedZoneId, setSelectedZoneId] = useState<string>('')
```

改为：

```tsx
export function FloorEditor({ floors, onChange, selectedFloorId, onSelectedFloorIdChange }: FloorEditorProps) {
  const [selectedZoneId, setSelectedZoneId] = useState<string>('')
```

注意：删除了 `selectedFloorId` 的 `useState`，但保留了 `selectedZoneId`。`useState` import 仍被 `selectedZoneId`、`newFloorName`、`newZoneName` 使用，无需动 import 行。

- [ ] **Step 3: 修改 `addFloor`（第 46 行）**

将第 46 行：

```tsx
    setSelectedFloorId(id)
```

改为：

```tsx
    onSelectedFloorIdChange(id)
```

- [ ] **Step 4: 修改 `removeFloor`（第 53-56 行）**

将第 53-56 行：

```tsx
    if (selectedFloorId === floorId) {
      const remaining = floors.filter(f => f.id !== floorId)
      setSelectedFloorId(remaining[0]?.id ?? '')
      setSelectedZoneId('')
    }
```

改为：

```tsx
    if (selectedFloorId === floorId) {
      const remaining = floors.filter(f => f.id !== floorId)
      onSelectedFloorIdChange(remaining[0]?.id ?? '')
      setSelectedZoneId('')
    }
```

- [ ] **Step 5: 修改楼层 tab 点击（第 233 行）**

将第 233 行：

```tsx
              onClick={() => { setSelectedFloorId(floor.id); setSelectedZoneId('') }}
```

改为：

```tsx
              onClick={() => { onSelectedFloorIdChange(floor.id); setSelectedZoneId('') }}
```

- [ ] **Step 6: 确认无遗漏的 `setSelectedFloorId`**

运行检索，确认组件内已无 `setSelectedFloorId` 残留：

```bash
grep -n "setSelectedFloorId" components/admin/floor-editor.tsx
```

预期：无输出（grep 返回空）。若仍有匹配，逐一改为 `onSelectedFloorIdChange`。

- [ ] **Step 7: 浏览器验证（暂时期望编译通过、页面不崩）**

注意：此任务完成后 `FloorEditor` 已是受控组件，但 `floor-layout/page.tsx`（Task 3）尚未传入新 props，所以直接访问页面会报 props 缺失/`undefined`。**本步只验证 TypeScript/编译层面无语法错误**——通过 dev server 的 HMR 看终端日志无编译报错即可。若此时页面因缺 props 报错属正常，Task 3 会修复。

```bash
# 查看 dev server 日志最新几行，确认无 "Failed to compile" / 语法错误
tail -5 /home/z/.zcode/cli/exec/sess_7b7d8516-09cb-4f31-9262-0ab477576d15/call_43601e9cafd440938b48a354-stdout.log
```

预期：无新增编译错误（缺 props 的运行时报错可忽略）。

- [ ] **Step 8: Commit**

```bash
git add components/admin/floor-editor.tsx
git commit -m "refactor(floor-editor): make selectedFloorId controlled prop"
```

---

### Task 3: 页面层持有 `selectedFloorId`，驱动编辑器与预览

**Files:**
- Modify: `app/dashboard/admin/floor-layout/page.tsx`（state 区第 18-25 行；`previewFloor` 第 81 行；`FloorEditor` 调用第 116 行）

**Interfaces:**
- Consumes: Task 2 产出的受控 `FloorEditor` props（`selectedFloorId` + `onSelectedFloorIdChange`）。
- Produces: 完整功能——预览跟随左侧选中楼层。

**背景：** 页面已持有 `localFloors` state（从 SWR 复制）。需新增 `selectedFloorId` state，在数据首次到达时初始化，并派生 `previewFloor`。注意初始化竞态：`localFloors` 初始为 `null`，需在它首次被赋值的 `useEffect` 里同步设置 `selectedFloorId`。

- [ ] **Step 1: 新增 `selectedFloorId` state**

在第 19 行（`const [saving, setSaving] = useState(false)`）之后加：

```tsx
  const [selectedFloorId, setSelectedFloorId] = useState<string>('')
```

- [ ] **Step 2: 数据首次到达时初始化 `selectedFloorId`**

将第 22-25 行：

```tsx
  // 初始加载时把 server 数据复制到 local
  useEffect(() => {
    if (serverFloors && localFloors === null) setLocalFloors(serverFloors)
  }, [serverFloors, localFloors])
```

改为：

```tsx
  // 初始加载时把 server 数据复制到 local，并初始化选中楼层
  useEffect(() => {
    if (serverFloors && localFloors === null) {
      setLocalFloors(serverFloors)
      setSelectedFloorId(serverFloors[0]?.id ?? '')
    }
  }, [serverFloors, localFloors])
```

这样数据到达时同时设置 `localFloors` 和 `selectedFloorId`，避免预览首次为空。

- [ ] **Step 3: 派生 `previewFloor`（第 81 行）**

将第 81 行：

```tsx
  const previewFloor = localFloors[0] ?? null
```

改为：

```tsx
  const previewFloor = localFloors.find(f => f.id === selectedFloorId) ?? null
```

- [ ] **Step 4: 受控传递 props 给 `FloorEditor`（第 116 行）**

将第 116 行：

```tsx
            <FloorEditor floors={localFloors} onChange={setLocalFloors} />
```

改为：

```tsx
            <FloorEditor
              floors={localFloors}
              onChange={setLocalFloors}
              selectedFloorId={selectedFloorId}
              onSelectedFloorIdChange={setSelectedFloorId}
            />
```

- [ ] **Step 5: 浏览器验证（楼层切换同步）**

1. 用 `admin/admin` 登录，访问 `http://localhost:3500/dashboard/admin/floor-layout`。
2. 预期：左侧"配置编辑"区默认选中"9层"，右侧"实时预览"显示 9 层布局。
3. 在左侧"楼层管理"点击"10层"那一行。
4. 预期：左侧选中"10层"（高亮），**右侧预览立即切换为 10 层布局**（含会议/讨论区、自由讨论区等）。
4. 切回点击"9层"，预期右侧预览同步回到 9 层。

- [ ] **Step 6: 浏览器验证（删除楼层边界）**

1. 仍在该页面，删除当前选中的楼层（点该楼层行的垃圾桶图标）。
2. 预期：该楼层从左侧列表移除，右侧预览自动切到剩余的首个楼层（不报错、不留空白）。
3. （可选）继续删除直到没有楼层，预期右侧预览区为空（`FloorPreview` 不渲染），无报错。
4. 用 `撤销`（删除操作不可撤销——可改用浏览器刷新 `Ctrl+R` 恢复未保存状态，或点"保存配置"前的刷新会丢弃改动）。验证后建议**刷新页面**丢弃删除改动，避免污染数据库。

- [ ] **Step 7: 浏览器验证（回归：保存功能未受影响）**

1. 在左侧做一个小改动（如给某楼层改名）。
2. 预期头部出现"● 未保存改动"标记和可点的"保存配置"按钮。
3. 点击"保存配置"，预期提示消失、按钮变灰，保存成功（无报错）。
4. 若有未保存改动尝试关闭/刷新页面，预期浏览器弹出离开确认。

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/admin/floor-layout/page.tsx
git commit -m "feat(floor-layout): preview follows editor's selected floor"
```

---

## Self-Review

**1. Spec coverage:**
- 需求 1（配置入口）→ Task 1 全覆盖（按钮位置、形态、权限、跳转）。✓
- 需求 2（预览跟随左侧）→ Task 2（受控化）+ Task 3（页面持有 state + 派生预览）全覆盖。✓
- 边界（删除选中楼层重置、删空预览为空）→ Task 2 Step 4 + Task 3 Step 6 覆盖。✓
- 权限双重保险 → Task 1（按钮 admin-only）+ 目标页已有 gating。✓
- 不改 API/DB/类型 → 全计划无相关改动。✓

**2. Placeholder scan:** 无 TBD/TODO；所有步骤含具体代码或具体命令。✓

**3. Type consistency:**
- `onSelectedFloorIdChange: (floorId: string) => void`（Task 2 定义）↔ Task 3 传入 `setSelectedFloorId`（`Dispatch<SetStateAction<string>>`，兼容 `(value: string) => void`）。✓
- `selectedFloorId: string`（Task 2）↔ Task 3 `useState<string>('')`。✓
- Task 1 用 `user?.role === 'admin'`，与 spec 及 auth-context 一致。✓

无问题。
