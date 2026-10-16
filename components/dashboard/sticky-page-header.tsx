import { cn } from '@/lib/utils'

/**
 * 页头冻结行 —— 全站统一的「表格冻结」模式（见 DESIGN.md「布局」）：
 * 标题区 + 紧随其后的功能行（搜索/筛选/页签/操作）在内容滚动时固定在视口顶部。
 *
 * - 移动端停在固定导航（h-12）下方（top-12），桌面端停在顶部（lg:top-0）
 * - 背景 95% + backdrop-blur，z-30：低于弹窗（z-50）、高于页面内容
 * - 负 margin 抵消布局的 p-4/lg:p-6，让冻结带横贯内容区并自带左右内边距
 *
 * 大块内容（如信息管理的「集成状态」卡）不放进冻结行，避免吃掉半屏。
 */
export function StickyPageHeader({ children, className }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'sticky top-12 lg:top-0 z-30 -mx-4 px-4 lg:-mx-6 lg:px-6 pt-2 pb-3 -mt-2',
        'bg-[rgb(var(--background-rgb)/0.95)] backdrop-blur-sm border-b border-border',
        className,
      )}
    >
      {children}
    </div>
  )
}
