# 更新日志

本项目的所有重要变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [v0.2.4] - 2026-08-05

### 修复

- fix(news): clearing the cover URL in the editor now persists (#68)

## [v0.2.3] - 2026-08-05

### 修复

- fix(sync-logs): 拍平考勤同步日志的 stats 嵌套 (#67)

## [v0.2.2] - 2026-08-05

### 新增

- feat(api): admin scope 支持 agent 门户管理（草稿审核/考勤查询/人员/日志） (#66)

## [v0.2.1] - 2026-08-04

### 新增

- feat(news): 编辑动态增加 Markdown 实时预览 (#65)

## [v0.2.0] - 2026-08-04

### 新增

- feat(news): 动态正文图片上传 (#64)

## [v0.1.9] - 2026-08-04

### 新增

- feat(attendance): 榜单前三名做成领奖台突出展示 (#62)

### 修复

- fix(ui): unify sidebar toggle, visible workstation status, denser personnel grid (#61)
- fix(floor-editor): use full zone name as workstation name prefix (#60)

## [v0.1.8] - 2026-07-30

### 修复

- fix(dingtalk): tolerate dt-<userid> id clash on member sync (#59)

## [v0.1.7] - 2026-07-23

### 其他

- chore: use IDRL logo for sidebar/header/login wordmarks (#58)
- chore: replace favicon with IDRL brand package (#57)

## [v0.1.6] - 2026-07-23

### 新增

- feat(admin): 动态/资源支持手动调整显示顺序 (#56)

## [v0.1.5] - 2026-07-22

### 新增

- feat(api): add resource:publish scope for key-based resource writes (#55)

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
