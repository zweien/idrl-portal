# 发布流程说明

本文档定义当前仓库的正式发版路径。生产部署由 GitHub Release 触发（见 `deploy-vps.yml`），Release 通过 `pnpm release` 脚本创建。

## 版本号规则

使用语义化版本 `v<major>.<minor>.<patch>`：

- `patch`：缺陷修复、部署修正、文档与运维调整
- `minor`：新增功能、接口增强、可见能力扩展
- `major`：不兼容变更

**版本号唯一来源是 `package.json` 的 `version` 字段**，由 release 脚本自动 bump；
侧边栏与更新日志页展示的版本即来源于此。git tag、GitHub Release、CHANGELOG 条目
三者与之一一对应（`v` + version）。

## 发版（标准路径）

```bash
pnpm release 0.2.0
```

脚本自动完成：

1. 前置校验：在 master、工作区干净、与 origin 同步、tag 未存在
2. 质量门：`tsc --noEmit` + 全部测试
3. bump `package.json` 版本
4. 按 Conventional Commits 分组（feat→新增 / fix→修复 / perf→优化 / 其他），
   从上个 tag 到 HEAD 生成 CHANGELOG.md 条目草稿
5. 打开 `$EDITOR` 供润色，回车确认（`--yes` 跳过，用于无人值守）
6. `chore(release): vX.Y.Z` commit → tag → push → `gh release create`
   （release notes 取 CHANGELOG 该版本条目）

Release 发布即触发 `Deploy to VPS` 自动部署。跟踪部署：

```bash
gh run watch $(gh run list --workflow=deploy-vps.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

## 手动按 Tag 部署 / 回滚

如需重部署某个已存在版本或回滚到旧版本，在 GitHub Actions 页面手动运行
`Deploy to VPS` 并填写 `tag=vX.Y.Z`。

> 注意：`prisma migrate deploy` 只向前应用迁移，不会回退 schema。
> 跨迁移回滚代码时确认旧代码能兼容当前数据库 schema。

## 发布后验证

- GitHub Actions：`Deploy to VPS` 对应 tag 的 run 成功
- 服务器侧：

```bash
pm2 status
pm2 logs idrl-portal --lines 50
curl -I http://127.0.0.1:3050
curl -I https://portal.idrl.top
```

- 页面侧：侧边栏版本号显示为新版本；「更新日志」页出现新版本条目

## 更新日志

`CHANGELOG.md` 遵循 Keep a Changelog 格式（`## [vX.Y.Z] - YYYY-MM-DD` + `### 分组`），
应用内 `/dashboard/changelog` 页面直接渲染此文件。release 脚本生成草稿，
**提交前请顺手润色**：把 commit 标题改写成面向使用者的描述。
