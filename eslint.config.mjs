import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

export default [
  ...coreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'prisma/migrations/**',
      '.screenshots/**',
      'uploads/**',
    ],
  },
  {
    // 测试里用 require() 做 require 缓存控制 / 模块 mock，属既有模式。
    files: ['tests/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    // 存量「挂载后从 sessionStorage / API 同步回填 state」的模式（约 14 处，
    // 涉及 sidebar/auth/floor-editor 等），正确修法是 useSyncExternalStore /
    // 服务端取数，属后续重构；先降为 warning 保留信号。
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]
