'use client'

import dynamic from 'next/dynamic'

/**
 * Lazily-loaded MarkdownContent. The markdown pipeline (react-markdown +
 * remark-gfm + rehype-raw + rehype-sanitize) is a sizable chunk; for surfaces
 * that only render markdown after a user interaction (news detail dialog,
 * resource detail dialog), defer loading it until first render so it stays
 * out of the initial page bundle. For surfaces that show markdown on first
 * paint (the dashboard feed, the changelog), import MarkdownContent directly.
 *
 * ssr: false — markdown is rendered from already-fetched content; there's no
 * SEO benefit to server-rendering it (pages are 'use client' behind auth), and
 * skipping SSR avoids shipping the markdown pipeline to the server bundle too.
 */
const MarkdownContent = dynamic(
  () => import('@/components/dashboard/markdown-content').then(m => m.MarkdownContent),
  {
    ssr: false,
    loading: () => <div className="text-muted-foreground text-sm">加载中…</div>,
  },
)

export function LazyMarkdownContent({ content, className }: { content: string; className?: string }) {
  return <MarkdownContent content={content} className={className} />
}
