import assert from 'node:assert/strict'
import { demoProject } from '../src/demo'
import { cardId, isGroupLesson, removeStudent, setStudentTeacher, classCells, emptyProject, fullGrid, newId, type Project, type SchoolClass } from '../src/model'
import { evaluate, solve, Solver } from '../src/solver/engine'
import { buildIndex } from '../src/timetable'
import { removeTeacher } from '../src/store'

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
const tea = (name: string) => ({ ...ent(name), maxPerDay: 0, maxGapsPerDay: -1 })
g.subjects.push(ent('TDE'), ent('PİY'), ent('KOR'))
g.teachers.push(tea('X'), tea('T1'), tea('T2'), tea('T3'), tea('T4'), tea('T5'), tea('Y'))
const k: SchoolClass = { ...ent('9-A'), groups: [], students: [1, 2, 3, 4, 5, 6].map(i => ({ id: 's' + i, no: String(i), name: 'Ö' + i })) }
g.classes.push(k)
g.lessons.push({ id: 'tde', subjectId: g.subjects[0].id, teacherIds: [g.teachers[0].id], roomIds: [], classes: [{ classId: k.id, groupId: null }], split: Array(19).fill(2), sameDayOk: true, link: '' })
k.groups.push({ id: 'piy', name: 'Piyano', subjectId: g.subjects[1].id, split: [2] })
const teacherOf: Record<string, number> = { s1: 1, s2: 1, s3: 2, s4: 3, s5: 4, s6: 5 }
for (const [sid, ti] of Object.entries(teacherOf)) setStudentTeacher(g, k.id, 'piy', sid, g.teachers[ti].id)
const piano = g.lessons.filter(l => l.subjectId === g.subjects[1].id)
assert.equal(piano.length, 5, 'one lesson per teacher, T1 teaches s1 and s2 together')
assert.equal(new Set(piano.map(l => l.link)).size, 1, 'the five piano lessons are linked')
assert.deepEqual(k.groups.find(x => x.id === 'piy')!.students!.sort(), ['s1', 's2', 's3', 's4', 's5', 's6'], 'the group holds every student that has a teacher')
assert.equal(classCells(k).length, 5, 'students in the same groups share one timetable')
setStudentTeacher(g, k.id, 'piy', 's6', g.teachers[1].id)
setStudentTeacher(g, k.id, 'piy', 's6', g.teachers[5].id)
assert.equal(g.lessons.filter(l => l.subjectId === g.subjects[1].id).length, 5, 'moving a student back and forth leaves no empty lesson behind')
const gr = solve(g, { timeLimitMs: 2000, seed: 1, keepPlacements: false })
assert.equal(gr.hard, 0, `9-A is solved without gaps (${gr.issues.map(i => i.kind + ' ' + i.who).join(', ')})`)
assert.equal(new Set(g.lessons.filter(l => l.link).map(l => JSON.stringify(gr.placements[cardId(l.id, 0)]))).size, 1, 'all piano lessons at the same time')
assert.equal(S, 40)

// A choir group with s1 and s3 overlaps both T1's and T2's piano groups, which themselves do not overlap.
k.groups.push({ id: 'koro', name: 'Koro', students: ['s1', 's3'] })
g.lessons.push({ id: 'kor', subjectId: g.subjects[2].id, teacherIds: [g.teachers[6].id], roomIds: [], classes: [{ classId: k.id, groupId: 'koro' }], split: [1], sameDayOk: false, link: '' })
const at = (id: string) => ({ [cardId(id, 0)]: { day: 0, period: 0, locked: false } })
const pianoOf = (ti: number) => g.lessons.find(l => l.subjectId === g.subjects[1].id && l.teacherIds[0] === g.teachers[ti].id)!.id
g.placements = { ...at(pianoOf(1)), ...at('kor') }
assert.ok(buildIndex(g).clashSlots.size > 0 && evaluate(g).issues.some(i => i.kind === 'classClash'), 'choir and piano of a shared student clash')
g.placements = { ...at(pianoOf(1)), ...at(pianoOf(2)) }
assert.ok(buildIndex(g).clashSlots.size === 0 && !evaluate(g).issues.some(i => i.kind === 'classClash'), 'piano groups without shared students do not clash')

// No student may sit idle: piano and violin groups that take turns fill every hour.
const rot = (withViolin: boolean) => {
  const r: Project = emptyProject()
  r.subjects.push(ent('TDE'), ent('PİY'), ent('KEM'))
  r.teachers.push(tea('X'), tea('AYŞE'), tea('MEHMET'))
  const c: SchoolClass = { ...ent('9-B'), groups: [], students: [1, 2, 3, 4].map(i => ({ id: 's' + i, no: String(i), name: 'Ö' + i })) }
  r.classes.push(c)
  r.lessons.push({ id: 'tde', subjectId: r.subjects[0].id, teacherIds: [r.teachers[0].id], roomIds: [], classes: [{ classId: c.id, groupId: null }], split: Array(withViolin ? 18 : 19).fill(2), sameDayOk: true, link: '' })
  c.groups.push({ id: 'p1', name: 'Piyano 1', subjectId: r.subjects[1].id }, { id: 'p2', name: 'Piyano 2', subjectId: r.subjects[1].id })
  for (const s of ['s1', 's2']) setStudentTeacher(r, c.id, 'p1', s, r.teachers[1].id)
  for (const s of ['s3', 's4']) setStudentTeacher(r, c.id, 'p2', s, r.teachers[1].id)
  if (withViolin) {
    c.groups.push({ id: 'k1', name: 'Keman 1', subjectId: r.subjects[2].id }, { id: 'k2', name: 'Keman 2', subjectId: r.subjects[2].id })
    for (const s of ['s1', 's2']) setStudentTeacher(r, c.id, 'k1', s, r.teachers[2].id)
    for (const s of ['s3', 's4']) setStudentTeacher(r, c.id, 'k2', s, r.teachers[2].id)
  }
  return solve(r, { timeLimitMs: 2000, seed: 1, keepPlacements: false })
}
const ok = rot(true)
assert.equal(ok.hard, 0, `piano and violin rotate so nobody is idle (${ok.issues.map(i => i.kind + ' ' + i.who).join(', ')})`)
const idle = rot(false)
assert.ok(idle.hard > 0 && idle.issues.some(i => i.who.includes('Piyano')), 'piano alone in two lessons leaves students idle and is reported')
// Students who always share the same lessons are checked once, but count as many times as before.
const one = new Solver(g)
const live = [...new Set(one.units.flatMap(u => u.res))].filter(r => one.resName[r].startsWith('9-A'))
assert.ok(live.length < classCells(k).length, 'identical student timetables are merged')
let x = 12345
const rnd = () => ((x = (x * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
for (const sv of [one, new Solver(demoProject({ classes: 6 }))]) {
  for (let t = 0; t < 5000; t++) { const u = (rnd() * sv.units.length) | 0, dom = sv.units[u].domain; sv.moveTo(u, rnd() < 0.1 || !dom.length ? -1 : dom[(rnd() * dom.length) | 0]) }
  const full = sv.parts()
  assert.ok(full.hard === sv.hard + sv.unplaced && Math.abs(full.soft - sv.soft) < 1e-6, 'the running score always matches a full recount')
}
// Deleting a student or teacher never leaves a group lesson without students or without a teacher.
const del = structuredClone(g)
const dk = del.classes[0]
const lonely = dk.groups.find(x => x.parent === 'piy' && x.students!.length === 1)!
removeStudent(del, dk.id, lonely.students![0])
assert.ok(!dk.groups.some(x => x.id === lonely.id) && !del.lessons.some(l => l.classes[0].groupId === lonely.id), 'the last student of a teacher takes the lesson with them')
removeTeacher(del, g.teachers[1].id)
assert.ok(del.lessons.every(l => l.teacherIds.length) && !dk.groups.some(x => x.teacherId === g.teachers[1].id), 'a deleted teacher takes their group lessons with them')
assert.ok(!evaluate(del).issues.some(i => i.kind === 'underload' && i.who.includes('·')), 'no empty teacher group is reported')
assert.ok(isGroupLesson(g, piano[0]) && !isGroupLesson(g, g.lessons[0]), 'group lessons are told apart from whole-class lessons')
console.log('solver-check ok')
