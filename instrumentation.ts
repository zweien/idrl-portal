/**
 * Next.js instrumentation hook — runs once on server boot in the Node.js
 * runtime. Registers the background scheduler (node-cron) that drives
 * sync-members / sync-attendance / publish-news jobs.
 *
 * Skipped in the edge runtime and during builds.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  if (process.env.NEXT_PHASE === 'phase-production-build') return
  const { registerScheduler } = await import('./lib/scheduler')
  registerScheduler()
}
