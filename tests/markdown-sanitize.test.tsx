import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownContent } from '@/components/dashboard/markdown-content'

/**
 * News content is rendered with rehype-raw (parse author HTML) followed by
 * rehype-sanitize (strip dangerous nodes). These tests render MarkdownContent
 * to static HTML and assert that script/iframe/event-handlers/javascript: URLs
 * never reach the output, while ordinary formatting survives.
 */
function render(md: string): string {
  return renderToStaticMarkup(<MarkdownContent content={md} />).toLowerCase()
}

describe('MarkdownContent sanitize — dangerous content stripped', () => {
  it('strips <script> tags', () => {
    const out = render('<script>alert(1)</script>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
  })

  it('strips <iframe> tags', () => {
    const out = render('<iframe src="https://evil.com"></iframe>')
    expect(out).not.toContain('<iframe')
  })

  it('strips inline event handlers (onerror, onclick)', () => {
    const out = render('<img src="x" onerror="alert(1)">')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('alert(1)')
  })

  it('blocks javascript: URLs in href', () => {
    const out = render('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toContain('javascript:')
  })

  it('blocks javascript: URLs in img src', () => {
    const out = render('<img src="javascript:alert(1)">')
    expect(out).not.toContain('javascript:')
  })

  it('strips <style> tags (CSS injection)', () => {
    const out = render('<style>body{background:url(javascript:1)}</style>')
    expect(out).not.toContain('<style')
  })
})

describe('MarkdownContent sanitize — safe content preserved', () => {
  it('keeps standard markdown formatting', () => {
    const out = render('# Heading\n\n**bold** and *italic*')
    expect(out).toContain('<h1')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<em>italic</em>')
  })

  it('keeps safe http/https links', () => {
    const out = render('[link](https://example.com)')
    expect(out).toContain('href="https://example.com"')
  })

  it('keeps safe images', () => {
    const out = render('![alt](https://example.com/x.png)')
    expect(out).toContain('<img')
    expect(out).toContain('src="https://example.com/x.png"')
    expect(out).toContain('alt="alt"')
  })

  it('keeps tables and code blocks', () => {
    const out = render('| a | b |\n|---|---|\n| 1 | 2 |\n\n`code`')
    expect(out).toContain('<table')
    expect(out).toContain('<code>code</code>')
  })

  it('keeps basic inline HTML divs for layout', () => {
    // defaultSchema allows div/p/span; verifiable that layout HTML survives.
    const out = render('<div><p>boxed</p></div>')
    expect(out).toContain('boxed')
  })
})
