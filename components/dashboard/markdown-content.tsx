'use client'

import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { cn } from '@/lib/utils'

// News content is admin-authored but published via the news:publish scope,
// which can also be held by an API key. rehype-raw lets authors use inline
// HTML for layout; rehype-sanitize then strips anything dangerous (<script>,
// <iframe>, event handlers, javascript: URLs) so a compromised publisher
// cannot inject script into every reader's browser. The default schema keeps
// common formatting tags (p, headings, lists, links, images, tables, code)
// and safe attributes (href/src with http/https/mailto, img alt/title/width).
const sanitizeSchema = {
  ...defaultSchema,
  // Keep the target/rel attributes we set on links so external links open in
  // a new tab safely; defaultSchema strips them.
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), 'target', 'rel'],
  },
}

export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('prose-idrl', className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        // raw first (parse author HTML into the tree), then sanitize (strip
        // dangerous nodes/attributes). Order matters: sanitizing before raw
        // would have nothing to sanitize — the HTML is still an escaped string.
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
      >
        {content}
      </Markdown>
    </div>
  )
}
