# 发布流程说明

本文档定义当前仓库的正式发版路径。当前生产部署由 GitHub Release 触发，而不是普通 `master` push。

## 版本号规则

使用 `v<major>.<minor>.<patch>`：

- `patch`：缺陷修复、部署修正、文档与运维调整
- `minor`：新增功能、接口增强、可见能力扩展
- `major`：不兼容变更

示例：`v0.1.0`、`v0.2.0`、`v1.0.0`

## 发布前检查

发布前至少完成：

```bash
pnpm exec tsc --noEmit
pnpm test
DATABASE_URL=file:prisma/db.sqlite SESSION_SECRET=test_secret_for_build_validation_123456789 pnpm run build
```

## 创建发布

1. 确认当前 `master` 已包含要发布的提交
2. 创建并推送 tag
3. 创建 GitHub Release

示例：

```bash
git checkout master
git pull --ff-only
git tag -a "v0.1.0" -m "Release v0.1.0"
git push origin "v0.1.0"
gh release create "v0.1.0" --title "v0.1.0" --generate-notes
```

发布后会自动触发 `Deploy to VPS` workflow，并按该 tag 部署。

## 手动按 Tag 部署

如需重试或手动部署某个已存在版本，可在 GitHub Actions 页面手动运行 `Deploy to VPS`，并填写：

- `tag=v0.1.0`

该流程不会读取 `master` 最新状态，而是严格部署指定 tag。

## 发布后验证

检查 GitHub Actions：

- Workflow：`Deploy to VPS`
- Event：`release` 或 `workflow_dispatch`
- 目标 tag 正确
- `Deploy application` 步骤成功

服务器侧至少验证：

```bash
pm2 status
pm2 logs idrl-portal --lines 50
curl -I http://127.0.0.1:3050
curl -I https://portal.idrl.top
```

## 回滚

优先回滚到上一个稳定 tag，而不是临时找 commit。在 GitHub Actions 页面手动运行 `Deploy to VPS`，填入旧 tag 即可。

> 注意：`prisma migrate deploy` 只向前应用迁移，不会回退 schema。
> 跨迁移回滚代码时确认旧代码能兼容当前数据库 schema。
