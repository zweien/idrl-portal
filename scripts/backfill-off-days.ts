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
import { isOffDay } from '@/lib/attendance-holidays'
import { holidayName } from '@/lib/attendance-holidays'

async function main() {
  const apply = process.argv.includes('--apply')
  const raw = process.env.DATABASE_URL ?? 'file:prisma/db.sqlite'
  const dbPath = raw.replace(/^file:/, '')
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

  const update = db.prepare("UPDATE AttendanceRecord SET status = 'off' WHERE id = ?")
  const run = db.transaction((ids: string[]) => {
    for (const id of ids) update.run(id)
  })
  run(targets.map(t => t.id))
  const after = db.prepare("SELECT status, COUNT(*) c FROM AttendanceRecord GROUP BY status ORDER BY c DESC").all()
  console.log('已写入。当前状态分布:', JSON.stringify(after))
  db.close()
}

main().catch(e => {
  console.error('BACKFILL FAILED:', e)
  process.exit(1)
})
