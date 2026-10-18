import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { demoProject } from '../src/demo'
import { dutyCounts, dutyDays, fillMonth, monthDates, monthView, schoolDays, weekdayOf } from '../src/duty'
import { migrate, removeTeacher } from '../src/store'
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
const t6 = p.teachers[6]
p.duty.role[t6.id] = 'none'
p.duty.manual[t4.id] = { '2026-08': 12 }
p.duty.places = [{ id: 'a', name: 'BAHÇE', count: 2 }, { id: 'b', name: 'BİNA', count: 1 }, { id: 'c', name: 'KANTİN', count: 1 }]
p.duty.specials = [{ id: 'h', from: '2026-10-28', to: '2026-10-29', name: 'Cumhuriyet Bayramı' }]

const noRun = p.teachers.filter((_, i) => i % 2 === 0).map(t => t.id)
for (const id of noRun) p.duty.consecutive[id] = false
const fan = p.teachers[5]
p.duty.prefer[fan.id] = [false, false, true, false, false, false, false]

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
  for (const id of ids) { assert.ok(days.get(id)![wd], 'only on ticked days'); assert.notEqual(id, t3.id, 'administrators get no duty'); assert.notEqual(id, t6.id, 'Nöbet tutmaz teachers get no duty') }
}

const all = months.flatMap(monthDates)
for (const id of noRun) for (let i = 1; i < all.length; i++) {
  const on = (d: string) => Object.values(p.duty.assign[d] ?? {}).includes(id)
  assert.ok(!(on(all[i]) && on(all[i - 1])), 'no back-to-back duty when Arka arkaya nöbet is off')
}
const fanDays = all.filter(d => Object.values(p.duty.assign[d] ?? {}).includes(fan.id))
assert.ok(fanDays.length > 0 && fanDays.every(d => weekdayOf(d) === 2), 'a teacher who prefers Wednesday gets duty on Wednesdays')

const c = dutyCounts(p, '2026-12-31')
const full = p.teachers.filter(t => ![t0, t2, t3, t4, t6].includes(t)).map(t => t.id)
const spread = (f: (id: string) => number) => Math.max(...full.map(f)) - Math.min(...full.map(f))
for (const pl of p.duty.places) assert.ok(spread(id => c.get(id)!.places[pl.id] ?? 0) <= 1, `${pl.name}: places differ by at most one`)
assert.ok(spread(id => c.get(id)!.total) <= 1, 'totals differ by at most one')
const avg = full.reduce((a, id) => a + c.get(id)!.total, 0) / full.length
assert.ok(Math.abs(c.get(t4.id)!.total - avg) <= 2, 'hand-entered earlier months count towards the total')

const date = '2026-11-02', key = 'b#0', other = full.find(id => !Object.values(p.duty.assign[date]).includes(id))!
p.duty.assign[date][key] = other
p.duty.locked[`${date}|${key}`] = true
fillMonth(p, '2026-11')
assert.equal(p.duty.assign[date][key], other, 'locked cells survive a new distribution')
assert.equal(new Set(Object.values(p.duty.assign[date])).size, 4, 'and nobody is doubled next to them')

const dec = monthView(p, '2026-12')
const decCells = monthDates('2026-12').reduce((n, d) => n + Object.keys(p.duty.assign[d] ?? {}).length, 0)
assert.equal([...dec.counts.values()].reduce((n, c) => n + c.total, 0), decCells, 'counters show only the chosen month')

const q = migrate({ ...demoProject({ classes: 4 }) })
q.teachers = q.teachers.slice(0, 6)
const pattern = [[1, 1, 0, 0, 1], [1, 1, 1, 1, 1], [1, 0, 0, 0, 1], [1, 1, 1, 1, 1], [0, 0, 1, 1, 1], [1, 1, 1, 0, 0]]
q.teachers.forEach((t, i) => { q.duty.days[t.id] = [...pattern[i].map(Boolean), false, false] })
q.duty.places = [{ id: 'a', name: 'BAHÇE', count: 1 }, { id: 'b', name: 'BİNA', count: 1 }]
fillMonth(q, '2026-11')
const qc = dutyCounts(q, '2026-11-30')
assert.deepEqual(q.teachers.map(t => qc.get(t.id)!.total), [7, 7, 7, 7, 7, 7], 'a short-staffed weekday no longer leaves some teachers with 8 and others with 6')

for (const t of q.teachers) q.duty.consecutive[t.id] = false
q.duty.specials = [{ id: 'h', from: '2026-11-16', to: '2026-11-20', name: 'Ara Tatil' }]
fillMonth(q, '2026-11')
for (const d of monthDates('2026-11')) if (weekdayOf(d) < 5 && (d < '2026-11-16' || d > '2026-11-20'))
  assert.equal(Object.keys(q.duty.assign[d] ?? {}).length, 2, `${d}: every place is filled even when back-to-back duty is off for everyone`)

assert.ok(!monthView(p, '2026-12').duty.some(x => x.id === t6.id), 'Nöbet tutmaz teachers are left out of the counters')
const gone = full[1], lessonsBefore = p.lessons.length
const goneKey = Object.keys(p.duty.assign['2026-12-01'] ?? {}).find(k => p.duty.assign['2026-12-01'][k] === gone)
if (goneKey) p.duty.locked[`2026-12-01|${goneKey}`] = true
removeTeacher(p, gone)
assert.ok(!p.teachers.some(x => x.id === gone) && !p.lessons.some(l => l.teacherIds.includes(gone)), 'deleting removes the teacher everywhere')
assert.ok(!Object.values(p.duty.assign).some(row => Object.values(row).includes(gone)), 'and from the duty plan')
assert.ok(!goneKey || !p.duty.locked[`2026-12-01|${goneKey}`], 'and from the locks')
assert.equal(p.lessons.length, lessonsBefore, 'lessons stay, only the teacher leaves them')

const file = xlsx({ name: 'Nöbet', cols: [20, 20], rows: [[{ v: 'Başlık', s: S.Title }], [{ v: 'Cumhuriyet Bayramı', s: S.Struck }, { v: 3, s: S.High }]], merges: ['A1:B1'] })
writeFileSync(process.argv[2] ?? '/dev/null', file)
console.log('duty-check ok')
