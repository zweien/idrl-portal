'use client'

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { cn } from '@/lib/utils'

export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('prose-idrl', className)}>
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
        {content}
      </Markdown>
    </div>
  )
}
