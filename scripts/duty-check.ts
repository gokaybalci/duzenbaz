import assert from 'node:assert/strict'
import { demoProject } from '../src/demo'
import { autoDays, dutyCounts, dutySchedule, dutySlots, schoolDays, teachersByDay } from '../src/duty'
import { migrate } from '../src/store'

const p = migrate(demoProject({ classes: 12 }))
const D = p.days.length, P = p.periods.length
p.teachers[0].avail = p.days.map((_, d) => (d === 1 || d === 2 ? '0' : '1').repeat(P)).join('')
p.duty.places = [{ id: 'a', name: 'BAHÇE', count: 2 }, { id: 'b', name: '1. KAT', count: 1 }, { id: 'c', name: 'KANTİN', count: 1 }]

const days = schoolDays(p)
assert.deepEqual(days.get(p.teachers[0].id), [true, false, false, true, true], 'closed days come from the teacher availability')

p.duty.day = autoDays(p)
for (const t of p.teachers) assert.ok(days.get(t.id)![p.duty.day[t.id]], `${t.name} gets a day they are at school`)
const sizes = teachersByDay(p).map(L => L.length)
assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, 'teachers spread evenly over the days: ' + sizes)

const m = dutySlots(p).length
for (let W = 1; W <= 30; W++) {
  p.duty.weeks = W
  const weeks = dutySchedule(p), counts = dutyCounts(p, weeks)
  for (const L of teachersByDay(p)) {
    const spread = (f: (t: string) => number) => Math.max(...L.map(f)) - Math.min(...L.map(f))
    assert.ok(spread(t => Object.values(counts.get(t)!).reduce((a, b) => a + b, 0)) <= 1, `W=${W}: duty totals differ by at most one`)
    for (const pl of p.duty.places) assert.ok(spread(t => counts.get(t)![pl.id] ?? 0) <= 1, `W=${W}: ${pl.name} differs by at most one`)
  }
  for (const day of weeks.flat()) {
    const ids = day.filter(Boolean)
    assert.equal(new Set(ids).size, ids.length, 'nobody has two places on the same day')
  }
  weeks.forEach(days => days.forEach((day, d) => assert.equal(day.filter(Boolean).length, Math.min(m, teachersByDay(p)[d].length), 'all places filled when there are enough teachers')))
}

const t1 = p.teachers[1].id, l1 = p.lessons.find(l => l.teacherIds.includes(t1))!
p.placements = { [l1.id + '#0']: { day: 3, period: 0, locked: false } }
assert.deepEqual(schoolDays(p).get(t1), p.days.map((_, d) => d === 3), 'once lessons are placed, school days are the lesson days')
assert.equal(D, 5)
console.log('duty-check ok')
