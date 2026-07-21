const appDir = process.env.VPS_APP_DIR || '/opt/idrl-portal';

module.exports = {
  apps: [
    {
      name: 'idrl-portal',
      cwd: appDir,
      script: '/bin/bash',
      args: [
        '-lc',
        'set -a && source ./.env.production && set +a && exec corepack pnpm run start -- --hostname 127.0.0.1 --port "${PORT:-3050}"',
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
