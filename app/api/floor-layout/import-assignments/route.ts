import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/db'
import { requireAdmin } from '@/lib/auth-api'

/**
 * POST /api/floor-layout/import-assignments
 * Accepts an xlsx file upload with two columns: workstation name, person name.
 * Batch-assigns persons to workstations. Same-name persons resolve to the
 * first match (with a warning in the response).
 *
 * Returns { assigned, skipped, warnings }.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: '文件未上传' }, { status: 400 })
    }

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) {
      return NextResponse.json({ error: '无法读取工作表' }, { status: 400 })
    }

    // Parse rows: [[wsName, personName], ...]. Skip header if it looks like one.
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })
    const rows = rawRows
      .filter(r => Array.isArray(r) && r.length >= 2 && r[0] && r[1])
      .map(r => [String(r[0]).trim(), String(r[1]).trim()])

    // Drop header row if first cell contains "工位" or similar
    if (rows.length > 0 && /工位|workstation/i.test(rows[0][0])) {
      rows.shift()
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: '文件无有效数据行（需要至少两列：工位名、姓名）' }, { status: 400 })
    }

    // Load all workstations and persons for matching
    const floors = await prisma.floor.findMany({
      include: { zones: { include: { workstations: true } } },
    })
    const allWorkstations = floors.flatMap(f => f.zones.flatMap(z => z.workstations))

    const persons = await prisma.person.findMany({ select: { id: true, name: true } })
    // Build name → first-matching-person map
    const personByName = new Map<string, { id: string }>()
    const duplicateNames = new Set<string>()
    for (const p of persons) {
      if (personByName.has(p.name)) duplicateNames.add(p.name)
      if (!personByName.has(p.name)) personByName.set(p.name, { id: p.id })
    }

    const wsByName = new Map(allWorkstations.map(w => [w.name, w]))
    // Existing personId → workstation-name lookup, to detect a person already
    // assigned elsewhere in the DB (one-person-one-workstation). Build from the
    // current state; entries are removed as we reassign within this batch.
    const existingPersonWs = new Map<string, string>()
    for (const w of allWorkstations) {
      if (w.personId) existingPersonWs.set(w.personId, w.name)
    }

    let assigned = 0
    let skipped = 0
    const warnings: string[] = []
    // Track persons claimed within this batch so a later row for the same
    // person on a different workstation is skipped (not silently reassigned).
    const claimedInBatch = new Set<string>()

    // One transaction so a mid-batch error rolls back everything written so far.
    await prisma.$transaction(async (tx) => {
      for (const [wsName, personName] of rows) {
        const ws = wsByName.get(wsName)
        if (!ws) {
          skipped++
          warnings.push(`工位 "${wsName}" 未找到，跳过`)
          continue
        }
        const person = personByName.get(personName)
        if (!person) {
          skipped++
          warnings.push(`人员 "${personName}" 未找到，跳过`)
          continue
        }
        if (duplicateNames.has(personName)) {
          warnings.push(`"${personName}" 有同名人员，使用第一个匹配`)
        }
        // One-person-one-workstation: skip if this person is already assigned
        // (either earlier in this batch, or to a different workstation in the DB).
        const existingWsName = existingPersonWs.get(person.id)
        if (claimedInBatch.has(person.id)) {
          skipped++
          warnings.push(`"${personName}" 已分配到其他工位，跳过 工位 "${wsName}"`)
          continue
        }
        if (existingWsName && existingWsName !== wsName) {
          skipped++
          warnings.push(`"${personName}" 已分配到工位 "${existingWsName}"，跳过 工位 "${wsName}"`)
          continue
        }
        await tx.workstation.update({
          where: { id: ws.id },
          data: { personId: person.id },
        })
        // This workstation may have previously held a different person; that
        // person is now freed, so drop them from the existing-assignment map —
        // otherwise a later row assigning them elsewhere would be incorrectly
        // skipped as "already assigned".
        for (const [pid, wName] of existingPersonWs) {
          if (wName === wsName && pid !== person.id) existingPersonWs.delete(pid)
        }
        claimedInBatch.add(person.id)
        existingPersonWs.set(person.id, wsName)
        assigned++
      }
    })

    return NextResponse.json({ assigned, skipped, warnings: warnings.slice(0, 20) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
