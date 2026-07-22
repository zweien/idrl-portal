# 更新日志

本项目的所有重要变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [v0.1.4] - 2026-07-22

### 新增

- feat(dashboard): 资源/动态页增加管理员编辑快捷入口 (#54)

### 其他

- docs(readme): 重写 README，补齐面向 agent 的完整 API 参考 (#53)

## [v0.1.3] - 2026-07-22

### 新增

- feat(admin): 工位布局支持调整区域显示顺序 (#52)

## [v0.1.2] - 2026-07-22

### 新增

- feat(release): 统一版本信息 + 更新日志页 + 固化发版脚本 (#51)

### 修复

- fix(release): execSync returns null with stdio inherit — guard .trim()
- fix(release): retry network git ops (fetch/push) on transient TLS failures

## [v0.1.1] - 2026-07-21

### 修复

- 登录跳转改用代理头（X-Forwarded-Proto/Host）推导公网源，修复扫码登录后被重定向到 `localhost:3050` 的问题（#50）
- nginx 配置显式覆盖 `X-Forwarded-Host`，防止客户端伪造该头（#50）

## [v0.1.0] - 2026-07-21

首个正式发布版本，部署至 https://portal.idrl.top 。

### 新增

- 工位平面图：楼层/区域/工位布局配置、人员分配、一人一座约束、可搜索下拉 + xlsx 导入
- 钉钉集成：成员同步、考勤/请假/出差状态同步、审批单解析（京内/京外）
- 考勤统计：打卡历史、今日最早打卡 Top 20、月度工时排行、个人/全员明细（#44）
- 考勤导出：逐日明细与工时汇总 CSV，自定义日期段，出差固定工时可配置（#45）
- 信息管理：分类、草稿/发布、API Key（独立限流）、操作审计日志
- 用户管理：角色设置、账号关联人员、禁用登录
- 钉钉/Authentik 双 SSO 登录

### 运维

- GitHub Actions 自动部署到 VPS：Release tag → SSH → pnpm 构建 → pm2（#46–#49）
