import { rmSync } from 'node:fs'

/**
 * Best-effort temp dir cleanup for test afterAll/beforeEach hooks.
 *
 * On Windows, better-sqlite3 handles that vitest has not finalized keep the
 * DB files locked, so rmSync throws EPERM even with force:true — that made
 * the whole suite report failed test FILES despite every test passing (the
 * release quality gate runs `vitest run` and would refuse to release).
 * The dirs live under os.tmpdir() and the OS reclaims them, so a failed
 * sweep must not fail the suite: warn and move on.
 */
export function removeTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code ?? String(e)
    console.warn(`[test] temp dir not removed (${code}): ${dir}`)
  }
}
