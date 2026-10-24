import assert from 'node:assert/strict'
import { demoProject } from '../src/demo'
import { arrangeByTeacher, cardId, classCells, emptyProject, fullGrid, newId, type Project, type SchoolClass } from '../src/model'
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

// Güzel sanatlar: 6 students of 9-A have 5 piano teachers, at most 2 students per lesson.
const g: Project = emptyProject()
const S = g.days.length * g.periods.length
const ent = (name: string) => ({ id: newId('x'), name, short: name, color: '#888', avail: fullGrid(g.days.length, g.periods.length) })
const tea = (name: string) => ({ ...ent(name), maxPerDay: 0, maxDays: 0, maxGapsPerDay: -1 })
g.subjects.push(ent('TDE'), ent('PİY'), ent('KOR'))
g.teachers.push(tea('X'), tea('T1'), tea('T2'), tea('T3'), tea('T4'), tea('T5'), tea('Y'))
const k: SchoolClass = { ...ent('9-A'), groups: [], students: [1, 2, 3, 4, 5, 6].map(i => ({ id: 's' + i, no: String(i), name: 'Ö' + i })) }
g.classes.push(k)
g.lessons.push({ id: 'tde', subjectId: g.subjects[0].id, teacherIds: [g.teachers[0].id], roomIds: [], classes: [{ classId: k.id, groupId: null }], split: Array(19).fill(2), sameDayOk: true, link: '' })
const teacherOf = { s1: g.teachers[1].id, s2: g.teachers[1].id, s3: g.teachers[2].id, s4: g.teachers[3].id, s5: g.teachers[4].id, s6: g.teachers[5].id }
assert.equal(arrangeByTeacher(g, k.id, g.subjects[1].id, [2], 2, teacherOf), 5, 'one lesson per teacher, T1 teaches s1 and s2 together')
assert.equal(new Set(g.lessons.filter(l => l.subjectId === g.subjects[1].id).map(l => l.link)).size, 1, 'the five piano lessons are linked')
assert.equal(classCells(k).length, 5, 'students in the same groups share one timetable')
const gr = solve(g, { timeLimitMs: 2000, seed: 1, keepPlacements: false })
assert.equal(gr.hard, 0, `9-A is solved without gaps (${gr.issues.map(i => i.kind + ' ' + i.who).join(', ')})`)
assert.equal(new Set(g.lessons.filter(l => l.link).map(l => JSON.stringify(gr.placements[cardId(l.id, 0)]))).size, 1, 'all piano lessons at the same time')
assert.equal(S, 40)

// A choir group with s1 and s3 overlaps both T1's and T2's piano groups, which themselves do not overlap.
const [p1, p2] = k.groups
k.groups.push({ id: 'koro', name: 'Koro', students: ['s1', 's3'] })
g.lessons.push({ id: 'kor', subjectId: g.subjects[2].id, teacherIds: [g.teachers[6].id], roomIds: [], classes: [{ classId: k.id, groupId: 'koro' }], split: [1], sameDayOk: false, link: '' })
const at = (id: string) => ({ [cardId(id, 0)]: { day: 0, period: 0, locked: false } })
const pianoOf = (gid: string) => g.lessons.find(l => l.classes[0].groupId === gid)!.id
g.placements = { ...at(pianoOf(p1.id)), ...at('kor') }
assert.ok(buildIndex(g).clashSlots.size > 0 && evaluate(g).issues.some(i => i.kind === 'classClash'), 'choir and piano of a shared student clash')
g.placements = { ...at(pianoOf(p1.id)), ...at(pianoOf(p2.id)) }
assert.ok(buildIndex(g).clashSlots.size === 0 && !evaluate(g).issues.some(i => i.kind === 'classClash'), 'piano groups without shared students do not clash')
console.log('solver-check ok')
