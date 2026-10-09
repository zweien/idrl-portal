import { describe, it, expect, beforeEach } from 'vitest'
import { runSyncTask, getSyncTask, isSyncBusy, SYNC_STAGES, type SyncTaskState } from '@/lib/sync-task'

// In-process sync-task registry: the global mutex, stage progression, and the
// background/inline execution modes behind the sync progress feature.

beforeEach(() => {
  // No resetSyncTask export — drain any leftovers by waiting for tasks? The
  // registry holds only the latest task; tests below always run to completion
  // (or assert on the running state), so state leaks are explicit failures.
  if (getSyncTask()?.state === 'running') {
    throw new Error('a previous test left a sync task running')
  }
})

describe('runSyncTask (global sync mutex + stage tracking)', () => {
  it('is idle before any task', () => {
    expect(getSyncTask()).toBeNull()
    expect(isSyncBusy()).toBe(false)
  })

  it('rejects a second start while one is running, with the live task attached', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>(r => { release = r })
    const first = runSyncTask('attendance', async () => {
      await gate
      return { summary: 'first' }
    }, { background: true })
    // The background task registers synchronously before the first await.
    await new Promise(r => setTimeout(r, 0))
    expect(isSyncBusy()).toBe(true)

    const second = await runSyncTask('attendance', async () => ({ summary: 'second' }), { background: true })
    expect(second.ok).toBe(false)
    if (!second.ok) {
      expect(second.reason).toBe('already-running')
      expect(second.task.kind).toBe('attendance')
    }

    release()
    const done = await first
    expect(done.ok).toBe(true)
    // runSyncTask resolves before the detached IIFE finishes its finally —
    // give the microtask queue a beat before asserting the mutex is free.
    await new Promise(r => setTimeout(r, 0))
    expect(isSyncBusy()).toBe(false)
    expect(getSyncTask()?.state).toBe('done')
  })

  it('progresses stages and records per-stage ms', async () => {
    const res = await runSyncTask('attendance', async (p) => {
      p.stage('attendance')
      p.stage('leave')
      p.stage('trip')
      p.counter('拉取出差审批详情', 34, 84)
      p.stage('write')
      return { summary: 'done', stats: { total: 94 } }
    }, { background: false })
    expect(res.ok).toBe(true)
    // Assert on the returned task, not getSyncTask() — the registry is a
    // module singleton and other tests' tasks may be the "latest".
    const task = (res as { task: SyncTaskState }).task
    expect(task.state).toBe('done')
    expect(task.stages.map(s => s.status)).toEqual(['done', 'done', 'done', 'done'])
    expect(task.stages.every(s => s.ms !== null)).toBe(true)
    expect(task.counter).toEqual({ label: '拉取出差审批详情', done: 34, total: 84 })
    // Inline results ride the return value; task.result is the background
    // path's display payload only.
    expect(res.result.summary).toBe('done')
    // Stage labels match the shared definitions the UI renders.
    expect(task.stages.map(s => s.label)).toEqual(SYNC_STAGES.attendance.map(s => s.label))
  })

  it('marks failure on the running stage and exposes the error', async () => {
    const res = await runSyncTask('members', async (p) => {
      p.stage('fetch')
      throw new Error('dingtalk down')
    }, { background: false })
    expect(res.ok).toBe(false)
    const task = (res as { task: SyncTaskState }).task
    expect(task.state).toBe('failed')
    expect(task.error).toBe('dingtalk down')
    expect(task.stages.find(s => s.key === 'fetch')?.status).toBe('failed')
    // The mutex is released after a failure.
    expect(isSyncBusy()).toBe(false)
  })

  it('background tasks complete on their own and keep the final state queryable', async () => {
    const res = await runSyncTask('backfill', async (p) => {
      p.stage('fetch')
      return { summary: '补拉完成' }
    }, { background: true })
    expect(res.ok).toBe(true)
    // Not yet finished (or already finished) — either way the mutex frees and
    // the task state stays queryable.
    await new Promise(r => setTimeout(r, 10))
    const task = getSyncTask()
    expect(task?.state).toBe('done')
    expect(task?.result?.summary).toBe('补拉完成')
    expect(isSyncBusy()).toBe(false)
  })

  it('inline (machine) path returns the fn value and clears the mutex', async () => {
    const res = await runSyncTask('attendance', async () => ({ summary: 'inline' }), { background: false })
    expect(res.ok).toBe(true)
    expect(res.result.summary).toBe('inline')
    expect(getSyncTask()?.state).toBe('done')
    expect(isSyncBusy()).toBe(false)
  })
})
