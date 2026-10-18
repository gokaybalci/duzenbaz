import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { demoProject } from '../src/demo'
import { dutyCounts, dutyDays, dutyPlan, monthPlan, schoolDays, totalOf } from '../src/duty'
import { migrate } from '../src/store'
import { S, xlsx } from '../src/xlsx'

const p = migrate(demoProject({ classes: 12 }))
const P = p.periods.length
const [t0, t1, t2] = p.teachers
t0.avail = p.days.map((_, d) => (d === 1 || d === 2 ? '0' : '1').repeat(P)).join('')
assert.deepEqual(schoolDays(p).get(t0.id), [true, false, false, true, true], 'closed days come from the teacher availability')

const l1 = p.lessons.find(l => l.teacherIds.includes(t1.id))!
p.placements = { [l1.id + '#0']: { day: 3, period: 0, locked: false } }
assert.deepEqual(schoolDays(p).get(t1.id), p.days.map((_, d) => d === 3), 'once lessons are placed, school days are the lesson days')
p.placements = {}

p.duty.days[t2.id] = [true, false, false, false, false]
assert.deepEqual(dutyDays(p).get(t2.id), [true, false, false, false, false], 'ticked days can be changed by hand')
p.duty.role[p.teachers[3].id] = 'admin'
p.duty.places = [{ id: 'a', name: 'BAHÇE', count: 2 }, { id: 'b', name: 'BİNA', count: 1 }, { id: 'c', name: 'KANTİN', count: 1 }]
p.duty.start = '2026-09-07'
p.duty.specials = [{ id: 'h', from: '2026-10-28', to: '2026-10-29', name: 'Cumhuriyet Bayramı' }]

const plan = dutyPlan(p, '2027-01-31')
const days = dutyDays(p)
for (const d of plan) {
  assert.ok(d.weekday < 5, 'no duty at weekends')
  if (d.date === '2026-10-28' || d.date === '2026-10-29') { assert.equal(d.special, 'Cumhuriyet Bayramı'); assert.equal(d.row.length, 0); continue }
  assert.equal(d.special, undefined)
  const ids = d.row.filter(Boolean) as string[]
  assert.equal(ids.length, 4, 'every place filled')
  assert.equal(new Set(ids).size, ids.length, 'nobody twice on the same day')
  for (const id of ids) {
    assert.ok(days.get(id)![d.weekday], 'only on ticked days')
    assert.notEqual(id, p.teachers[3].id, 'administrators get no duty')
  }
}

const full = p.teachers.filter(t => t.id !== t0.id && t.id !== t2.id && t.id !== p.teachers[3].id).map(t => t.id)
for (const until of ['2026-09-30', '2026-10-31', '2026-11-30', '2026-12-31', '2027-01-31']) {
  const c = dutyCounts(p, dutyPlan(p, until))
  const spread = (f: (id: string) => number) => Math.max(...full.map(f)) - Math.min(...full.map(f))
  assert.ok(spread(id => totalOf(c.get(id)!)) <= 1, `${until}: totals differ by at most one`)
  for (const pl of p.duty.places) assert.ok(spread(id => c.get(id)![pl.id] ?? 0) <= 1, `${until}: ${pl.name} differs by at most one`)
}

p.duty.month = '2026-10'
const mp = monthPlan(p)
assert.ok(mp.days.every(d => d.date.startsWith('2026-10')))
assert.ok(totalOf(mp.counts.get(full[0])!) > 0, 'counters include the months before')

const file = xlsx({ name: 'Nöbet', cols: [20, 20], rows: [[{ v: 'Başlık', s: S.Title }], [{ v: 'Cumhuriyet Bayramı', s: S.Struck }, { v: 3, s: S.High }]], merges: ['A1:B1'] })
writeFileSync(process.argv[2] ?? '/dev/null', file)
console.log('duty-check ok')
