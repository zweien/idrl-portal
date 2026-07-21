const appDir = process.env.VPS_APP_DIR || '/opt/idrl-portal';

module.exports = {
  apps: [
    {
      name: 'idrl-portal',
      cwd: appDir,
      script: '/bin/bash',
      // next start 会自动加载项目根目录的 .env.production（Next.js 内建
      // dotenv 行为），无需用 bash source —— source 会把值里的 $、` 等当
      // shell 语法展开，有执行任意命令的风险。
      // VPS 系统 Node 是 20（scheduling 在用），本应用用 /opt/node24 下
      // 独立安装的 Node 24，互不影响。pm2 守护进程的环境里没有这个路径，
      // 必须显式前置到 PATH。
      args: [
        '-lc',
        'export PATH=/opt/node24/bin:$PATH && exec corepack pnpm run start -- --hostname 127.0.0.1 --port "${PORT:-3050}"',
      ],
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production',
        PORT: '3050',
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: '3050',
      },
      error_file: `${appDir}/logs/pm2-error.log`,
      out_file: `${appDir}/logs/pm2-out.log`,
      time: true,
    },
  ],
};
