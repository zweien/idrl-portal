# VPS 部署说明

本文档说明如何通过 GitHub Actions 将 idrl-portal 部署到自有 VPS，运行方式为 `Node.js + pnpm + PM2 + Nginx`。

## 部署架构

- GitHub 作为代码源（public repo，VPS 直接 `git fetch` 拉取）
- GitHub Actions 负责触发部署（Release / 手动 tag）
- VPS 上使用 `pm2` 托管 `next start`，应用名 `idrl-portal`
- `nginx` 反向代理 `portal.idrl.top` → `127.0.0.1:3050`
- SQLite 数据库存放在 VPS 本地磁盘（`prisma/db.sqlite`），不随部署重置
- 同一台 VPS 上还运行着 scheduling（端口 3018），部署脚本**禁止 `pm2 kill`**

## 前置条件

- Ubuntu 或 Debian 系统
- Node.js 24 + `corepack enable`（pnpm 版本由 package.json 的 `packageManager` 字段锁定为 11.12.0）
- 已安装 `git`、`pm2`、`nginx`、`certbot`、`build-essential`（better-sqlite3 原生编译需要）

## 第一次初始化 VPS

```bash
# 1. 系统依赖
apt-get update
apt-get install -y git curl build-essential python3 nginx certbot python3-certbot-nginx

# 2. Node 24（独立安装到 /opt/node24，不动系统 Node —— 系统 Node 20
#    正在被 scheduling 使用，升级会导致它的 better-sqlite3 ABI 失配）
NODE_VER=$(curl -fsSL https://nodejs.org/dist/index.json | python3 -c "import json,sys; d=json.load(sys.stdin); print([v['version'] for v in d if v['version'].startswith('v24')][0])")
curl -fsSLO "https://nodejs.org/dist/${NODE_VER}/node-${NODE_VER}-linux-x64.tar.xz"
mkdir -p /opt/node24
tar -xJf "node-${NODE_VER}-linux-x64.tar.xz" -C /opt/node24 --strip-components=1
rm "node-${NODE_VER}-linux-x64.tar.xz"
/opt/node24/bin/corepack enable --install-directory /opt/node24/bin
export PATH=/opt/node24/bin:$PATH

# 3. pm2（复用系统 Node 20 的全局 pm2 即可，守护进程已开机自启）
pm2 startup   # 若尚未执行过，按输出提示执行

# 4. 拉代码
git clone https://github.com/zweien/idrl-portal.git /opt/idrl-portal
cd /opt/idrl-portal
mkdir -p logs
```

### 生产环境变量

编辑 `/opt/idrl-portal/.env.production`：

```env
NODE_ENV=production
PORT=3050
DATABASE_URL="file:prisma/db.sqlite"
SESSION_SECRET="replace-with-openssl-rand-base64-32"

# 钉钉 OAuth + 组织同步（从本地开发 .env 复制真实值）
DINGTALK_CLIENT_ID=""
DINGTALK_CLIENT_SECRET=""
DINGTALK_DEPT_ID="340351089"
DINGTALK_TRIP_PROCESS_CODE=""

# Authentik SSO（如启用）
AUTHENTIK_ISSUER=""
AUTHENTIK_CLIENT_ID=""
AUTHENTIK_CLIENT_SECRET=""

# 内网网段（可选）
INTRANET_CIDRS=""
```

说明：

- `PORT` 是应用监听端口，固定 `3050`
- `SESSION_SECRET` 生产必填，用 `openssl rand -base64 32` 生成
- `.env.production` 只存在于 VPS，**不要提交到仓库**

## 配置 GitHub Actions Secrets

在仓库 `Settings -> Secrets and variables -> Actions` 中添加：

| Secret | 值 |
|---|---|
| `VPS_HOST` | `192.227.137.51` |
| `VPS_USER` | `root` |
| `VPS_SSH_KEY` | 部署私钥全文（见下） |
| `VPS_APP_DIR` | `/opt/idrl-portal` |
| `VPS_PORT` | `22` |

## 配置部署 SSH Key

本地生成专用部署密钥（不要复用个人密钥）：

```bash
ssh-keygen -t ed25519 -C "github-actions-idrl-portal" -f ~/.ssh/github-actions-idrl-portal
```

将公钥追加到 VPS 的 `/root/.ssh/authorized_keys`，私钥全文写入 GitHub Secret `VPS_SSH_KEY`。

> root 密码不写入任何文件与仓库；配置完密钥登录后建议在 `sshd_config`
> 中关闭密码登录（`PasswordAuthentication no`）。

## Nginx 配置

`/etc/nginx/sites-available/idrl-portal`：

```nginx
server {
    listen 80;
    server_name portal.idrl.top;

    location / {
        proxy_pass http://127.0.0.1:3050;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用并签发 HTTPS（前提：`portal.idrl.top` 的 DNS 已解析到本机）：

```bash
ln -s /etc/nginx/sites-available/idrl-portal /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d portal.idrl.top
```

## 首次启动应用

```bash
cd /opt/idrl-portal
export PATH=/opt/node24/bin:$PATH
corepack pnpm install --frozen-lockfile
corepack pnpm run build
DATABASE_URL="$(grep '^DATABASE_URL=' .env.production | cut -d= -f2- | tr -d '"')" \
  corepack pnpm exec prisma migrate deploy
export VPS_APP_DIR=/opt/idrl-portal
pm2 start ecosystem.config.js --env production --update-env
pm2 save
```

说明：

- `next build` / `next start` 会自动加载 `.env.production`（Next.js 内建行为），不需要手动 `source`
- `prisma migrate deploy` 是独立进程，只需 `DATABASE_URL`，用 grep/cut 提取而不是 `source` 整个文件（避免值里的 `$` 被 shell 展开）
- `VPS_APP_DIR` 需要导出给 pm2，否则 `ecosystem.config.js` 里的 `appDir` 会回退到默认值

查看状态：

```bash
pm2 status
pm2 logs idrl-portal
curl -I http://127.0.0.1:3050
```

## GitHub Actions 自动部署流程

workflow 不是由 `master` push 触发，而是由以下两种方式触发：

1. 发布 GitHub Release
2. 在 Actions 页面手动运行 `Deploy to VPS` 并指定 `tag`

自动部署时，workflow 会：

1. 通过 SSH 登录 VPS
2. `git fetch --all --tags` 并 `git checkout "tags/<release-tag>" -B release-deploy`
3. `pnpm install --frozen-lockfile`
4. `next build`（自动加载 `.env.production`）
5. `prisma migrate deploy`（对线上 SQLite 应用迁移）
6. `pm2 startOrReload ecosystem.config.js --env production --update-env`
7. `pm2 save`

线上部署版本严格对应指定 tag，不自动跟随 `master`。

> 注意：VPS 上同时运行 scheduling，部署脚本使用 `pm2 startOrReload`
> 而非 `pm2 kill`，避免误杀其他应用。

## 钉钉回调

生产环境使用钉钉登录前，需在钉钉开放平台应用后台将
`https://portal.idrl.top` 加入回调域名白名单，否则 OAuth 回调会被拒绝。

## 回滚

优先回滚到上一个稳定 tag：在 GitHub Actions 页面手动运行
`Deploy to VPS`，填入旧 tag 即可。

也可以在 VPS 上手动执行：

```bash
cd /opt/idrl-portal
git fetch --all --tags
git checkout "tags/v0.1.0" -B release-deploy
export PATH=/opt/node24/bin:$PATH
corepack pnpm install --frozen-lockfile
corepack pnpm run build
DATABASE_URL="$(grep '^DATABASE_URL=' .env.production | cut -d= -f2- | tr -d '"')" \
  corepack pnpm exec prisma migrate deploy
export VPS_APP_DIR=/opt/idrl-portal
pm2 startOrReload ecosystem.config.js --env production --update-env
pm2 save
```

> 回滚旧代码前注意数据库迁移方向：`prisma migrate deploy` 只向前应用迁移，
> 不会回退 schema。跨迁移回滚代码时确认旧代码能兼容当前 schema。

## 常见问题

### 应用无法启动

优先检查：

- `.env.production` 是否存在、`SESSION_SECRET` 是否配置
- `pm2 logs idrl-portal` 是否有端口占用或构建错误
- `curl -I http://127.0.0.1:3050` 是否通

### better-sqlite3 报 `ERR_DLOPEN_FAILED`

原生模块与当前 Node.js ABI 不匹配，常见于 VPS 升级过 Node.js。修复：

```bash
cd /opt/idrl-portal
rm -rf node_modules
export PATH=/opt/node24/bin:$PATH
corepack pnpm install --frozen-lockfile
corepack pnpm run build
export VPS_APP_DIR=/opt/idrl-portal
pm2 startOrReload ecosystem.config.js --env production --update-env
pm2 save
```

### GitHub Actions 无法 SSH

优先检查：

- `VPS_SSH_KEY` 是否为完整私钥（含 `-----BEGIN/END-----` 行）
- 公钥是否已写入 VPS 的 `authorized_keys`
- `VPS_USER`、`VPS_HOST`、`VPS_PORT` 是否正确

### 数据未持久化

SQLite 使用本地文件存储，请确保：

- `prisma/` 目录在 VPS 上可写（`prisma/db.sqlite` 已在 .gitignore 中，部署不会覆盖）
- 备份策略覆盖 `prisma/db.sqlite`
