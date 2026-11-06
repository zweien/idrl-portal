import { redirect } from 'next/navigation'
import { getSession, isAuthenticated } from '@/lib/session'

/**
 * Root entry — and the DingTalk workbench target: the developer console's
 * app home URL is configured as `https://host/?corpid=$CORPID$` (the
 * workbench replaces `$CORPID$` on open, and only then). The query string
 * must survive the redirect here or the login page loses the corpId its
 * free-login component needs (components/dingtalk-free-login.tsx).
 *
 * Logged-in users skip the login page entirely — opening the workbench app
 * lands straight in the dashboard.
 */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      query.set(key, value)
    } else if (Array.isArray(value)) {
      for (const v of value) query.append(key, v)
    }
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : ''

  const session = await getSession()
  redirect(isAuthenticated(session) ? `/dashboard${suffix}` : `/login${suffix}`)
}
