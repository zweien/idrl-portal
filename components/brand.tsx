import Image, { type ImageProps } from 'next/image'
import { cn } from '@/lib/utils'

// 官方 logo 资产来自 IDRL VI（public/brand/logo/）。
// 深色底必须使用专用 reverse 资产；禁止用滤镜把彩色 logo 整体变白。
// 深浅切换由 .brand-light / .brand-dark 工具类（globals.css）在 CSS 层完成，
// 两个 <img> 同时渲染、SSR 安全，不依赖 JS 或主题水印。
const sources = {
  /** IDRL 字标横向组合（页眉、侧栏） */
  wordmark: {
    light: '/brand/logo/lockup-idrl.svg',
    dark: '/brand/logo/lockup-idrl-reverse.svg',
    ratio: 600 / 180,
    alt: 'IDRL',
  },
  /** 中英文双语组合（对外介绍、登录页） */
  bilingual: {
    light: '/brand/logo/lockup-bilingual.svg',
    dark: '/brand/logo/lockup-bilingual-reverse.svg',
    ratio: 850 / 180,
    alt: 'IDRL 智能设计与鲁棒学习 · Intelligent Design and Robust Learning',
  },
  /** 仅图形（已出现完整名称的导航、头像位） */
  symbol: {
    light: '/brand/logo/symbol-color.svg',
    dark: '/brand/logo/symbol-color-reverse.svg',
    ratio: 226.86025 / 128.8813,
    alt: 'IDRL',
  },
} as const

export type BrandVariant = keyof typeof sources

export function Brand({
  variant = 'wordmark',
  width = 96,
  /** auto：跟随应用主题切换；light/dark：固定用浅底/深底(reverse)资产，
      用于不受主题影响的品牌色块（如深 navy 面板）。 */
  theme = 'auto',
  className,
  priority,
  ...props
}: {
  variant?: BrandVariant
  /** 渲染宽度（px），高度按官方 SVG 比例推导；SVG 自带留白之外需保证净空 */
  width?: number
  theme?: 'auto' | 'light' | 'dark'
} & Omit<ImageProps, 'src' | 'alt' | 'width' | 'height'>) {
  const { light, dark, ratio, alt } = sources[variant]
  const shared: Pick<ImageProps, 'width' | 'height' | 'priority'> = {
    width,
    height: Math.round(width / ratio),
    priority,
  }
  if (theme === 'light') {
    return <Image {...shared} {...props} src={light} alt={alt} className={className} />
  }
  if (theme === 'dark') {
    return <Image {...shared} {...props} src={dark} alt={alt} className={className} />
  }
  return (
    <>
      <Image
        {...shared}
        {...props}
        src={light}
        alt={alt}
        className={cn('brand-light', className)}
      />
      <Image
        {...shared}
        {...props}
        src={dark}
        alt=""
        aria-hidden
        className={cn('brand-dark', className)}
      />
    </>
  )
}
