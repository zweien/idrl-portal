import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { ResizeObserverFix } from '@/components/resize-observer-fix'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

// IDRL VI 品牌字体：英文与数字使用 Inter（可变字重），
// 中文使用 Noto Sans CJK SC —— 动态内容不适合固定子集 webfont，
// 由 globals.css 的字体栈回退到系统 CJK 黑体（见 DESIGN.md 字体约定）。
const inter = localFont({
  src: '../public/brand/fonts/InterVariable.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'IDRL Portal · 智能设计与鲁棒学习',
  description: 'IDRL 门户 - 人员在位、资源聚合、最新动态',
  manifest: '/site.webmanifest',
  icons: {
    // SVG 自适应 favicon 放首位（随浏览器系统配色切换 navy 色块）；
    // ICO / PNG 作为不支持 SVG 图标的浏览器回退。
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#203663',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={true}
          storageKey="idrl-theme"
          disableTransitionOnChange
          themes={["light", "dark", "system"]}
        >
          <ResizeObserverFix />
          {children}
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ThemeProvider>
      </body>
    </html>
  )
}
