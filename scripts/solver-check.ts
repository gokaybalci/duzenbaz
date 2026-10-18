import assert from 'node:assert/strict'
import { demoProject } from '../src/demo'
import { cardId } from '../src/model'
import { solve } from '../src/solver/engine'

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
console.log('solver-check ok')
