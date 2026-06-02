# 管理页面编辑功能补全设计

## 背景

信息管理页面（`/dashboard/admin`）的人员、资源、动态三个 tab 中，编辑按钮仅 `console.log`，资源和动态的添加按钮无功能。需要补全所有编辑/添加弹窗。

## 设计

### 通用模式

复用现有 `AddPersonDialog` 的 Dialog + 表单模式，每个 tab 一个 Dialog 组件，同时支持添加和编辑：

- 传入 `initialData` 时为编辑模式（表单预填数据，标题显示"编辑xxx"）
- 不传时为添加模式（表单为空，标题显示"添加xxx"）
- 所有操作只修改本地 state，不涉及持久化

### 人员管理 — PersonDialog

改造现有 `AddPersonDialog`，支持编辑模式。

字段：姓名（必填）、邮箱、角色（按钮选择）、电话、状态（按钮选择）、研究方向（逗号分隔输入）

### 资源管理 — ResourceDialog

新增组件。

字段：名称（必填）、类型（按钮选择）、描述（textarea）、URL、状态（按钮选择）、访问级别（按钮选择）

### 动态管理 — NewsDialog

新增组件。

字段：标题（必填）、类型（按钮选择）、内容（textarea，支持 Markdown）、摘要、作者、日期（date input）、标签（逗号分隔输入）、置顶（开关）

## 文件变更

| 文件 | 变更 |
|------|------|
| `components/admin/person-dialog.tsx` | 新增，从 admin/page.tsx 提取并扩展 AddPersonDialog |
| `components/admin/resource-dialog.tsx` | 新增 |
| `components/admin/news-dialog.tsx` | 新增 |
| `app/dashboard/admin/page.tsx` | 修改：替换内联 AddPersonDialog 为外部组件，连接三个 Dialog 的 onEdit 回调 |
