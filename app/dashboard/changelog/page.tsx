import { readChangelog } from '@/lib/changelog'
import { MarkdownContent } from '@/components/dashboard/markdown-content'
import { Badge } from '@/components/ui/badge'
import { History } from 'lucide-react'

export const metadata = { title: '更新日志 - IDRL Portal' }

export default function ChangelogPage() {
  const entries = readChangelog()

  return (
    <div className="space-y-4 py-2 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <History className="h-5 w-5 text-muted-foreground" />
          更新日志
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">各版本的功能变更与修复记录</p>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">暂无更新记录</p>
      ) : (
        <div className="space-y-4">
          {entries.map((e, i) => (
            <section key={e.version} className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <Badge
                  variant={i === 0 ? 'default' : 'secondary'}
                  className="text-xs font-mono"
                >
                  {e.version}
                </Badge>
                {e.date && <span className="text-xs text-muted-foreground tabular-nums">{e.date}</span>}
                {i === 0 && <span className="text-xs text-muted-foreground">· 当前版本</span>}
              </div>
              <div className="px-4 py-3 text-sm">
                <MarkdownContent content={e.body} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
