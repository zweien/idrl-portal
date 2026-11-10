/**
 * 一次性回填：节假日感知上线前的历史休息日行（两类）。
 *
 * 背景：旧映射把休息日无差别固化成 absent（未到）——展示上是误导性的红。
 * finalize 水位线让常规同步永不回访这些日期，必须由本脚本修正：
 *   A. 无任何打卡的休息日 absent 行 → off（休息日本就不该显示「未到」）
 *   B. 只有下班打卡的休息日 absent 行 → present（假日加班，旧映射没认出
 *      来；新映射对这类日子返回 present，保留 checkOut 不动）
 * 判定逻辑直接复用 lib/attendance-holidays.ts（与同步运行时同一份日历，
 * 不存在两套真相）。
 *
 * 用法（VPS /opt/idrl-portal 下）：
 *   npx tsx scripts/backfill-off-days.ts          # 预览：只打印将改动什么
 *   npx tsx scripts/backfill-off-days.ts --apply  # 实际写入
 *
 * 出差/请假行与双端打卡行一律不动；offboarded 人员的休息日行同样刷新
 * （他们只是历史冻结，休息日本就不该显示「未到」）。
 */
import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isOffDay } from '@/lib/attendance-holidays'
import { holidayName } from '@/lib/attendance-holidays'

/** tsx 不会自动加载 .env.production——手动读入（不覆盖已有环境变量）。 */
function loadEnvFiles(): void {
  for (const f of ['.env.production', '.env']) {
    try {
      const txt = readFileSync(resolve(process.cwd(), f), 'utf8')
      for (const line of txt.split('\n')) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/)
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2]
      }
    } catch {
      /* 可选文件，缺了就跳过 */
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply')
  loadEnvFiles()
  const raw = process.env.DATABASE_URL ?? 'file:prisma/db.sqlite'
  const dbPath = resolve(raw.replace(/^file:/, ''))
  console.log(`数据库: ${dbPath}${apply ? '' : '（预览模式）'}`)
  const db = new Database(dbPath)
  db.pragma('busy_timeout = 5000')
  db.pragma('journal_mode = WAL')

  // Case A: 无任何打卡的休息日 absent 行。
  const rowsA = db
    .prepare("SELECT id, personId, date FROM AttendanceRecord WHERE status = 'absent' AND checkIn IS NULL AND checkOut IS NULL")
    .all() as Array<{ id: string; personId: string; date: string }>
  const offTargets = rowsA.filter(r => isOffDay(r.date))
  const named = offTargets.filter(r => holidayName(r.date) !== null)

  // Case B: 只有下班打卡的休息日 absent 行（假日加班；absent 意味着无上班
  // 打卡，故 checkIn 必为 NULL——旧映射把这类的 checkOut 存着但状态记成
  // absent，新映射会把它们归为 present）。
  const rowsB = db
    .prepare("SELECT id, personId, date, checkOut FROM AttendanceRecord WHERE status = 'absent' AND checkIn IS NULL AND checkOut IS NOT NULL")
    .all() as Array<{ id: string; personId: string; date: string; checkOut: string }>
  const workTargets = rowsB.filter(r => isOffDay(r.date))

  console.log(`扫描无打卡 absent 行: ${rowsA.length}，其中休息日（→ off）: ${offTargets.length}（法定假日 ${named.length}，普通周末 ${offTargets.length - named.length}）`)
  for (const sample of offTargets.slice(0, 5)) {
    console.log(`  样例A: ${sample.date} person=${sample.personId}${holidayName(sample.date) ? `（${holidayName(sample.date)}）` : ''}`)
  }
  console.log(`扫描仅下班打卡的 absent 行: ${rowsB.length}，其中休息日（→ present）: ${workTargets.length}`)
  for (const sample of workTargets.slice(0, 5)) {
    console.log(`  样例B: ${sample.date} person=${sample.personId} checkOut=${sample.checkOut}${holidayName(sample.date) ? `（${holidayName(sample.date)}）` : ''}`)
  }
  if (!apply) {
    console.log('预览模式，未写入。加 --apply 执行。')
    db.close()
    return
  }

  // 谓词里重查资格（status/checkIn/checkOut 可能自 SELECT 后被并发修改——
  // 例如补卡修正 pass 恰好在两步之间落库），避免覆盖并发写入的新状态。
  const toOff = db.prepare(
    "UPDATE AttendanceRecord SET status = 'off' WHERE id = ? AND status = 'absent' AND checkIn IS NULL AND checkOut IS NULL",
  )
  const toPresent = db.prepare(
    "UPDATE AttendanceRecord SET status = 'present' WHERE id = ? AND status = 'absent' AND checkIn IS NULL AND checkOut IS NOT NULL",
  )
  let changedOff = 0
  let changedPresent = 0
  const run = db.transaction(() => {
    for (const t of offTargets) changedOff += toOff.run(t.id).changes
    for (const t of workTargets) changedPresent += toPresent.run(t.id).changes
  })
  run()
  const after = db.prepare("SELECT status, COUNT(*) c FROM AttendanceRecord GROUP BY status ORDER BY c DESC").all()
  console.log(`已写入（→off ${changedOff} 行，→present ${changedPresent} 行，其余因并发修改被跳过）。当前状态分布:`, JSON.stringify(after))
  db.close()
}

main().catch(e => {
  console.error('BACKFILL FAILED:', e)
  process.exit(1)
})
