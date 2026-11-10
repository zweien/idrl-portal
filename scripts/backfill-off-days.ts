/**
 * 一次性回填：历史休息日行的 absent → off。
 *
 * 背景：节假日感知上线前，finalize 水位线把每个周末/法定假日都固化成了
 * absent（未到）——展示上是误导性的红。本脚本把「无任何打卡且日历判定为
 * 休息日」的历史行刷成 off。判定逻辑直接复用 lib/attendance-holidays.ts
 * （与同步运行时同一份日历，不存在两套真相）。
 *
 * 用法（VPS /opt/idrl-portal 下）：
 *   npx tsx scripts/backfill-off-days.ts          # 预览：只打印将改动什么
 *   npx tsx scripts/backfill-off-days.ts --apply  # 实际写入
 *
 * 打卡/出差/请假行一律不动；offboarded 人员的休息日行同样刷新（他们只是
 * 历史冻结，休息日本就不该显示「未到」）。
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

  const rows = db
    .prepare("SELECT id, personId, date FROM AttendanceRecord WHERE status = 'absent' AND checkIn IS NULL AND checkOut IS NULL")
    .all() as Array<{ id: string; personId: string; date: string }>
  const targets = rows.filter(r => isOffDay(r.date))
  const named = targets.filter(r => holidayName(r.date) !== null)

  console.log(`扫描无打卡 absent 行: ${rows.length}`)
  console.log(`其中休息日（将改为 off）: ${targets.length}（法定假日 ${named.length}，普通周末 ${targets.length - named.length}）`)
  for (const sample of targets.slice(0, 5)) {
    console.log(`  样例: ${sample.date} person=${sample.personId}${holidayName(sample.date) ? `（${holidayName(sample.date)}）` : ''}`)
  }
  if (!apply) {
    console.log('预览模式，未写入。加 --apply 执行。')
    db.close()
    return
  }

  // 谓词里重查资格（status/checkIn/checkOut 可能自 SELECT 后被并发修改——
  // 例如补卡修正 pass 恰好在两步之间落库），避免把新写入的 present/trip/
  // leave 覆盖成 off。
  const update = db.prepare(
    "UPDATE AttendanceRecord SET status = 'off' WHERE id = ? AND status = 'absent' AND checkIn IS NULL AND checkOut IS NULL",
  )
  let changed = 0
  const run = db.transaction((ids: string[]) => {
    for (const id of ids) changed += update.run(id).changes
  })
  run(targets.map(t => t.id))
  const after = db.prepare("SELECT status, COUNT(*) c FROM AttendanceRecord GROUP BY status ORDER BY c DESC").all()
  console.log(`已写入（实际更新 ${changed} 行，其余因并发修改被跳过）。当前状态分布:`, JSON.stringify(after))
  db.close()
}

main().catch(e => {
  console.error('BACKFILL FAILED:', e)
  process.exit(1)
})
