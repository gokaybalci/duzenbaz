import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { demoProject } from '../src/demo'
import { dutyCounts, dutyDays, fillMonth, monthDates, schoolDays, weekdayOf } from '../src/duty'
import { migrate } from '../src/store'
import { S, xlsx } from '../src/xlsx'

const p = migrate(demoProject({ classes: 12 }))
const P = p.periods.length
const [t0, t1, t2, t3, t4] = p.teachers
t0.avail = p.days.map((_, d) => (d === 1 || d === 2 ? '0' : '1').repeat(P)).join('')
assert.deepEqual(schoolDays(p).get(t0.id), [true, false, false, true, true], 'closed days come from the teacher availability')
assert.deepEqual(dutyDays(p).get(t0.id), [true, false, false, true, true, false, false], 'weekends are unticked by default')
const l1 = p.lessons.find(l => l.teacherIds.includes(t1.id))!
p.placements = { [l1.id + '#0']: { day: 3, period: 0, locked: false } }
assert.deepEqual(schoolDays(p).get(t1.id), p.days.map((_, d) => d === 3), 'once lessons are placed, school days are the lesson days')
p.placements = {}

p.duty.days[t2.id] = [true, false, false, false, false, true, false]
p.duty.role[t3.id] = 'admin'
p.duty.manual[t4.id] = { '2026-08': 12 }
p.duty.places = [{ id: 'a', name: 'BAHÇE', count: 2 }, { id: 'b', name: 'BİNA', count: 1 }, { id: 'c', name: 'KANTİN', count: 1 }]
p.duty.specials = [{ id: 'h', from: '2026-10-28', to: '2026-10-29', name: 'Cumhuriyet Bayramı' }]

const months = ['2026-09', '2026-10', '2026-11', '2026-12']
for (const m of months) fillMonth(p, m)
const days = dutyDays(p)
for (const m of months) for (const date of monthDates(m)) {
  const row = p.duty.assign[date] ?? {}, ids = Object.values(row), wd = weekdayOf(date)
  if (date === '2026-10-28' || date === '2026-10-29') { assert.equal(ids.length, 0, 'no duty on special days'); continue }
  if (wd === 6) assert.equal(ids.length, 0, 'nobody ticked Sunday, so Sunday stays empty')
  else if (wd === 5) assert.deepEqual(ids, [t2.id], 'Saturday only goes to the teacher who ticked it')
  else assert.equal(ids.length, 4, 'every place filled on weekdays')
  assert.equal(new Set(ids).size, ids.length, 'nobody twice on the same day')
  for (const id of ids) { assert.ok(days.get(id)![wd], 'only on ticked days'); assert.notEqual(id, t3.id, 'administrators get no duty') }
}

const c = dutyCounts(p, '2026-12-31')
const full = p.teachers.filter(t => ![t0, t2, t3, t4].includes(t)).map(t => t.id)
const spread = (f: (id: string) => number) => Math.max(...full.map(f)) - Math.min(...full.map(f))
for (const pl of p.duty.places) assert.ok(spread(id => c.get(id)!.places[pl.id] ?? 0) <= 1, `${pl.name}: places differ by at most one`)
assert.ok(spread(id => c.get(id)!.total) <= 2, 'totals differ by at most two')
const avg = full.reduce((a, id) => a + c.get(id)!.total, 0) / full.length
assert.ok(Math.abs(c.get(t4.id)!.total - avg) <= 2, 'hand-entered earlier months count towards the total')

const date = '2026-11-02', key = 'b#0', other = full.find(id => !Object.values(p.duty.assign[date]).includes(id))!
p.duty.assign[date][key] = other
p.duty.locked[`${date}|${key}`] = true
fillMonth(p, '2026-11')
assert.equal(p.duty.assign[date][key], other, 'locked cells survive a new distribution')
assert.equal(new Set(Object.values(p.duty.assign[date])).size, 4, 'and nobody is doubled next to them')

const file = xlsx({ name: 'Nöbet', cols: [20, 20], rows: [[{ v: 'Başlık', s: S.Title }], [{ v: 'Cumhuriyet Bayramı', s: S.Struck }, { v: 3, s: S.High }]], merges: ['A1:B1'] })
writeFileSync(process.argv[2] ?? '/dev/null', file)
console.log('duty-check ok')
