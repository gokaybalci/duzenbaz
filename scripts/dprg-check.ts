import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readDprg } from '../src/dprg'
import { parseCardId, type Project } from '../src/model'

// Samples live outside the repo; pass another folder as the first argument.
const dir = process.argv[2] ?? '/ssdy/rea/dagit'
const load = (f: string) => { const b = readFileSync(join(dir, f)); return readDprg(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer) }

// Returns how many placed hours sit on a teacher's closed hour: Dağıtmatik keeps a stale solution when conditions change later.
function noClashes(p: Project, f: string) {
  const P = p.periods.length, busy = new Map<string, string>()
  let closed = 0
  for (const [card, pl] of Object.entries(p.placements)) {
    const { lessonId, part } = parseCardId(card), l = p.lessons.find(x => x.id === lessonId)!
    const len = l.split[part]
    assert.ok(pl.day < p.days.length && pl.period + len <= P, `${f}: ${card} fits inside the day`)
    const c = (classId: string, groupId: string | null) => { const g = p.classes.find(x => x.id === classId)!.groups; return groupId ? [`${classId}:${groupId}`] : g.length ? g.map(x => `${classId}:${x.id}`) : [classId] }
    for (let k = 0; k < len; k++) for (const who of [...l.teacherIds, ...l.classes.flatMap(x => c(x.classId, x.groupId))]) {
      const key = `${who}|${pl.day}|${pl.period + k}`
      assert.ok(!busy.has(key), `${f}: ${who} has ${busy.get(key)} and ${card} at the same time`)
      busy.set(key, card)
      const t = p.teachers.find(x => x.id === who)
      if (t?.avail[pl.day * P + pl.period + k] === '0') closed++
    }
  }
  return closed
}

const files = ['Bayramoğlu 23-24.dprg', 'Bayramoğlu 23-24new.dprg', 'Bayramoğlu 23-24newest.dprg', 'Şablonlar/Meb Şablon.dprg', ...readdirSync(join(dir, 'Örnekler')).filter(f => f.endsWith('.dprg')).map(f => `Örnekler/${f}`)]
for (const f of files) {
  const p = await load(f)
  const blocks = p.lessons.reduce((a, l) => a + l.split.length, 0), hours = p.lessons.reduce((a, l) => a + l.split.reduce((x, y) => x + y, 0), 0)
  assert.ok(p.days.length && p.periods.length && p.avail.length === p.days.length * p.periods.length, `${f}: has a week`)
  if (f.includes('newest')) {
    // + subject Almanca, class 9-A (and its room), lesson Almanca 2+2 for Gökay in 1-2A, not placed
    assert.deepEqual([p.subjects.length, p.teachers.length, p.rooms.length, p.classes.length, p.lessons.length, hours, blocks, Object.keys(p.placements).length],
      [31, 7, 6, 6, 59, 166, 91, 75], `${f}: counts`)
    const l = p.lessons.at(-1)!
    assert.deepEqual([p.subjects.find(s => s.id === l.subjectId)?.name, p.teachers.find(x => x.id === l.teacherIds[0])?.name, p.classes.find(c => c.id === l.classes[0].classId)?.name, l.split],
      ['Almanca', 'Gökay BALCI', '1-2A', [2, 2]])
  } else if (f.startsWith('Bayramoğlu')) {
    assert.deepEqual([p.subjects.length, p.teachers.length, p.rooms.length, p.classes.length, p.lessons.length, hours, blocks, Object.keys(p.placements).length],
      [30, f.includes('new') ? 8 : 7, 5, 5, 58, 162, 89, 75], `${f}: counts`)
    assert.equal(p.school.name, 'BAYRAMOGLU ORTAOKULU')
    assert.equal(p.school.year, '2024-2025')
    assert.deepEqual([p.days.length, p.periods[0].time], [5, '08:30-09:10'])
  }
  if (f.startsWith('Şablonlar')) assert.deepEqual([p.subjects.length, p.classes.length], [27, 15], `${f}: counts`)
  if (f.startsWith('Örnekler')) assert.ok(p.lessons.length && [0, blocks].includes(Object.keys(p.placements).length), `${f}: all blocks placed, or none (unsolved sample)`)
  const closed = noClashes(p, f)
  console.log(`${f}: ${p.subjects.length} subjects, ${p.teachers.length} teachers, ${p.classes.length} classes, ${p.lessons.length} lessons, ${Object.keys(p.placements).length}/${blocks} placed${closed ? `, ${closed} on closed teacher hours` : ''}`)
}
console.log('dprg-check ok')
