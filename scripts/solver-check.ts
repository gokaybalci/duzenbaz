import assert from 'node:assert/strict'
import { demoProject } from '../src/demo'
import { cardId } from '../src/model'
import { evaluate, solve } from '../src/solver/engine'
import { buildIndex } from '../src/timetable'

const p = demoProject({ classes: 12 })
const r = solve(p, { timeLimitMs: 3000, seed: 1, keepPlacements: false })
assert.equal(r.hard, 0, `the demo school is solved without problems (${r.issues.map(i => i.kind).join(', ')})`)

const D = p.days.length, P = p.periods.length
const busy = new Map<string, string>()
const take = (who: string, day: number, period: number, card: string) => {
  const k = `${who}|${day}|${period}`
  assert.ok(!busy.has(k), `${who} has two lessons on day ${day} period ${period} (${busy.get(k)} and ${card})`)
  busy.set(k, card)
}
const atoms = (classId: string, groupId: string | null) => {
  const c = p.classes.find(x => x.id === classId)!
  return !c.groups.length ? [c.id] : groupId === null ? c.groups.map(g => `${c.id}:${g.id}`) : [`${c.id}:${groupId}`]
}
for (const l of p.lessons) l.split.forEach((len, part) => {
  const id = cardId(l.id, part), pl = r.placements[id]
  assert.ok(pl, `${id} is placed`)
  assert.ok(pl.day < D && pl.period + len <= P, `${id} fits inside the day`)
  for (let k = 0; k < len; k++) {
    const s = pl.day * P + pl.period + k
    assert.notEqual(p.avail[s], '0', `${id} is not on a closed school hour`)
    for (const t of l.teacherIds) { assert.notEqual(p.teachers.find(x => x.id === t)!.avail[s], '0', `${id}: teacher is available`); take(t, pl.day, pl.period + k, id) }
    for (const c of l.classes) for (const a of atoms(c.classId, c.groupId)) take(a, pl.day, pl.period + k, id)
  }
})

for (const c of p.classes) for (const a of atoms(c.id, null)) for (let d = 0; d < D; d++) {
  const used = Array.from({ length: P }, (_, j) => busy.has(`${a}|${d}|${j}`))
  const last = used.lastIndexOf(true)
  for (let j = 0; j < last; j++)
    if (c.avail[d * P + j] !== '0' && p.avail[d * P + j] !== '0') assert.ok(used[j], `${c.name} ${a}: no blank period on day ${d} before period ${last} (MEB rule)`)
}
// Two linked lessons that share a teacher clash; the solver must say so, like the Timetable page does.
const q = demoProject({ classes: 2 })
const [la, lb] = q.classes.map(c => q.lessons.find(l => l.classes[0].classId === c.id)!)
Object.assign(la, { link: 'x', split: [1] }); Object.assign(lb, { link: 'x', split: [1], teacherIds: la.teacherIds })
q.placements = { [cardId(la.id, 0)]: { day: 0, period: 0, locked: false }, [cardId(lb.id, 0)]: { day: 0, period: 0, locked: false } }
assert.ok(buildIndex(q).clashSlots.size > 0, 'the Timetable page marks the shared teacher')
assert.ok(evaluate(q).issues.some(i => i.kind === 'teacherClash'), 'the solver reports the shared teacher in linked lessons')
console.log('solver-check ok')
