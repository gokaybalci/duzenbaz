import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { demoProject } from '../src/demo'
import { dutyCounts, dutyDays, dutyWeights, fillMonth, monthDates, monthView, schoolDays, shiftDate, uncoveredWeeks, weekdayOf } from '../src/duty'
import { loadOf } from '../src/timetable'
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
for (const m of months) {
  const mc = dutyCounts(p, m + '-31', m + '-01'), month = (id: string) => mc.get(id)!.total
  assert.ok(Math.max(...full.map(month)) - Math.min(...full.map(month)) <= 1, `${m}: each month on its own is balanced`)
  for (const pl of p.duty.places) assert.ok(Math.max(...full.map(id => mc.get(id)!.places[pl.id] ?? 0)) - Math.min(...full.map(id => mc.get(id)!.places[pl.id] ?? 0)) <= 2, `${m}: ${pl.name} balanced within the month`)
  assert.ok(month(t4.id) <= Math.min(...full.map(month)), `${m}: a teacher with many hand-entered earlier duties is at the low end`)
}

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

assert.deepEqual(uncoveredWeeks(q, '2026-11'), [], 'every teacher has at least one duty every week')
for (const w of new Set(monthDates('2026-11').map(d => shiftDate(d, -weekdayOf(d)))))
  for (const t of q.teachers) {
    const places = Array.from({ length: 7 }, (_, i) => shiftDate(w, i)).flatMap(d => Object.entries(q.duty.assign[d] ?? {}).filter(([, x]) => x === t.id).map(([k]) => k.split('#')[0]))
    assert.equal(new Set(places).size, places.length, `${t.name} week ${w}: two duties in one week are at different places`)
  }
for (const t of q.teachers) q.duty.consecutive[t.id] = false
q.duty.specials = [{ id: 'h', from: '2026-11-16', to: '2026-11-20', name: 'Ara Tatil' }]
fillMonth(q, '2026-11')
for (const d of monthDates('2026-11')) if (weekdayOf(d) < 5 && (d < '2026-11-16' || d > '2026-11-20'))
  assert.equal(Object.keys(q.duty.assign[d] ?? {}).length, 2, `${d}: every place is filled even when back-to-back duty is off for everyone`)
assert.deepEqual(uncoveredWeeks(q, '2026-11'), [], 'still a duty every week with back-to-back off and a holiday week')
fillMonth(q, '2026-12')
assert.deepEqual([...uncoveredWeeks(q, '2026-11'), ...uncoveredWeeks(q, '2026-12')], [], 'a week split over two months is covered once both are distributed')

assert.ok(!monthView(p, '2026-12').duty.some(x => x.id === t6.id), 'Nöbet tutmaz teachers are left out of the counters')
const gone = full[1], lessonsBefore = p.lessons.length
const goneKey = Object.keys(p.duty.assign['2026-12-01'] ?? {}).find(k => p.duty.assign['2026-12-01'][k] === gone)
if (goneKey) p.duty.locked[`2026-12-01|${goneKey}`] = true
removeTeacher(p, gone)
assert.ok(!p.teachers.some(x => x.id === gone) && !p.lessons.some(l => l.teacherIds.includes(gone)), 'deleting removes the teacher everywhere')
assert.ok(!Object.values(p.duty.assign).some(row => Object.values(row).includes(gone)), 'and from the duty plan')
assert.ok(!goneKey || !p.duty.locked[`2026-12-01|${goneKey}`], 'and from the locks')
assert.equal(p.lessons.length, lessonsBefore, 'lessons stay, only the teacher leaves them')

const many = uncoveredWeeks(p, '2026-11')
assert.ok(many.length > 0 && many.every(w => w.teachers.length <= full.length + 4 - 20), 'with more teachers than weekly places, only the unavoidable few miss a week, and they are reported')

const fx = migrate(demoProject({ classes: 12 }))
fx.duty.places = [{ id: 'a', name: 'BAHÇE', count: 2 }, { id: 'b', name: 'BİNA', count: 1 }, { id: 'c', name: 'KANTİN', count: 1 }]
const [f1, f2] = fx.teachers
fx.duty.fixed = { [f1.id]: 'c', [f2.id]: 'b' }
for (const m of ['2026-09', '2026-10']) fillMonth(fx, m)
const fxDates = ['2026-09', '2026-10'].flatMap(monthDates).filter(d => weekdayOf(d) < 5)
for (const d of fxDates) {
  const row = fx.duty.assign[d] ?? {}
  assert.equal(Object.keys(row).length, 4, `${d}: every place filled with fixed places`)
  for (const [k, x] of Object.entries(row)) {
    if (x === f1.id) assert.equal(k.split('#')[0], 'c', 'a teacher fixed to KANTİN only stands at KANTİN')
    if (x === f2.id) assert.equal(k.split('#')[0], 'b', 'a teacher fixed to BİNA only stands at BİNA')
  }
}
const fxc = dutyCounts(fx, '2026-10-31'), fxAll = fx.teachers.map(t => fxc.get(t.id)!.total)
assert.ok(fxc.get(f1.id)!.total > 0 && fxc.get(f2.id)!.total > 0, 'fixed teachers still get duties')
assert.ok(Math.max(...fxAll) - Math.min(...fxAll) <= 1, 'totals stay balanced with fixed places')
fx.duty.places = fx.duty.places.filter(x => x.id !== 'c')
fillMonth(fx, '2026-11')
assert.ok(Object.values(fx.duty.assign).some(r => Object.values(r).includes(f1.id)), 'a fixed place that was deleted no longer restricts the teacher')

const hw = migrate(demoProject({ classes: 12 }))
hw.duty.places = [{ id: 'a', name: 'BAHÇE', count: 2 }, { id: 'b', name: 'BİNA', count: 1 }]
const hrs = new Map(hw.teachers.map(t => [t.id, loadOf(hw, 'teacher', t.id)])), ids = hw.teachers.map(t => t.id).filter(id => hrs.get(id)! > 0).sort((a, b) => hrs.get(a)! - hrs.get(b)!)
assert.ok(hrs.get(ids[ids.length - 1])! - hrs.get(ids[0])! >= 6, 'demo teachers have different lesson loads')
assert.ok([...dutyWeights(hw, ids).values()].every(w => w === 1), 'weighting off gives every teacher the same weight')
hw.duty.hoursWeight = 1
for (const m of ['2026-09', '2026-10', '2026-11']) fillMonth(hw, m)
const hwc = dutyCounts(hw, '2026-11-30'), third = Math.floor(ids.length / 3)
const avg = (xs: string[]) => xs.reduce((a, id) => a + hwc.get(id)!.total, 0) / xs.length
assert.ok(avg(ids.slice(-third)) < avg(ids.slice(0, third)), 'teachers with many lesson hours get fewer duties than teachers with few')
for (const d of ['2026-09', '2026-10', '2026-11'].flatMap(monthDates).filter(d => weekdayOf(d) < 5))
  assert.equal(Object.keys(hw.duty.assign[d] ?? {}).length, 3, `${d}: every place filled with weighting on`)
const w = dutyWeights(hw, ids)
for (let i = 1; i < ids.length; i++) if (hrs.get(ids[i])! > hrs.get(ids[i - 1])!) assert.ok(w.get(ids[i])! >= w.get(ids[i - 1])!, 'more hours never means a lighter weight')

const file = xlsx({ name: 'Nöbet', cols: [20, 20], rows: [[{ v: 'Başlık', s: S.Title }], [{ v: 'Cumhuriyet Bayramı', s: S.Struck }, { v: 3, s: S.High }]], merges: ['A1:B1'] })
writeFileSync(process.argv[2] ?? '/dev/null', file)
console.log('duty-check ok')
