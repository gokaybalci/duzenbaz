import { t } from './i18n'
import { parseCardId, type DutyRole, type Project, type SpecialDay } from './model'
import { ref, S, type Cell, type Sheet } from './xlsx'

export const DUTY_ROLES: [DutyRole, string][] = [['duty', 'On duty'], ['admin', 'Administrator'], ['dutyAdmin', 'Duty administrator'], ['preschool', 'Preschool'], ['none', 'No duty']]

export function schoolDays(p: Project): Map<string, boolean[]> {
  const D = p.days.length, P = p.periods.length
  const lessons = new Map(p.lessons.map(l => [l.id, l]))
  const placed = new Map(p.teachers.map(t => [t.id, Array<boolean>(D).fill(false)]))
  for (const [id, pl] of Object.entries(p.placements)) {
    for (const t of lessons.get(parseCardId(id).lessonId)?.teacherIds ?? []) {
      const days = placed.get(t)
      if (days) days[pl.day] = true
    }
  }
  const out = new Map<string, boolean[]>()
  for (const t of p.teachers) {
    const fromLessons = placed.get(t.id)!
    out.set(t.id, fromLessons.some(Boolean) ? fromLessons
      : p.days.map((_, d) => p.periods.some((_, j) => t.avail[d * P + j] !== '0' && p.avail[d * P + j] !== '0')))
  }
  return out
}

export const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']
export const WEEKDAYS_SHORT = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
export const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']

export const dutyDays = (p: Project, school = schoolDays(p)) =>
  new Map(p.teachers.map(t => { const base = p.duty.days[t.id] ?? school.get(t.id)!; return [t.id, WEEKDAYS.map((_, d) => !!base[d])] }))

export const roleOf = (p: Project, id: string): DutyRole => p.duty.role[id] ?? 'duty'

export interface Slot { key: string; place: string }

export const dutySlots = (p: Project): Slot[] =>
  p.duty.places.flatMap(pl => Array.from({ length: Math.max(0, pl.count) }, (_, k) => ({ key: `${pl.id}#${k}`, place: pl.id })))

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && iso(parse(s)) === s
export const weekdayOf = (date: string) => (parse(date).getDay() + 6) % 7

export const currentMonth = (p: Project) => (/^\d{4}-\d{2}$/.test(p.duty.month) ? p.duty.month : iso(new Date()).slice(0, 7))

export function monthDates(month: string): string[] {
  const [y, m] = month.split('-').map(Number)
  return Array.from({ length: new Date(y, m, 0).getDate() }, (_, i) => iso(new Date(y, m - 1, i + 1)))
}

export const shiftMonth = (month: string, by: number) => { const [y, m] = month.split('-').map(Number); return iso(new Date(y, m - 1 + by, 1)).slice(0, 7) }

export const monthLabel = (month: string) => { const [y, m] = month.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }

export const schoolYear = (month: string) => {
  const [y, m] = month.split('-').map(Number), start = m >= 9 ? y : y - 1
  return Array.from({ length: 10 }, (_, i) => shiftMonth(`${start}-09`, i))
}

export const specialOn = (p: Project, date: string): SpecialDay | undefined =>
  p.duty.specials.find(s => validDate(s.from) && s.from <= date && date <= (validDate(s.to) && s.to >= s.from ? s.to : s.from))

export const hasPlan = (p: Project, month: string) => Object.keys(p.duty.assign).some(d => d.startsWith(month))

export interface Count { places: Record<string, number>; total: number }

export function dutyCounts(p: Project, until: string, from = ''): Map<string, Count> {
  const out = new Map(p.teachers.map(t => [t.id, { places: {}, total: 0 } as Count]))
  for (const [date, row] of Object.entries(p.duty.assign)) {
    if (date > until || date < from) continue
    for (const [key, t] of Object.entries(row)) {
      const c = out.get(t)
      if (!c) continue
      const pl = key.split('#')[0]
      c.places[pl] = (c.places[pl] ?? 0) + 1
      c.total++
    }
  }
  for (const [t, months] of Object.entries(p.duty.manual))
    for (const [m, n] of Object.entries(months)) {
      const c = out.get(t)
      if (c && m <= until.slice(0, 7) && m >= from.slice(0, 7) && !hasPlan(p, m)) c.total += n
    }
  return out
}

const between = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5)

export const shiftDate = (date: string, by: number) => { const d = parse(date); d.setDate(d.getDate() + by); return iso(d) }

export const allowsRun = (p: Project, t: string) => p.duty.consecutive[t] !== false

export function prefersDay(p: Project, t: string, weekday: number, days = dutyDays(p)) {
  const pr = p.duty.prefer[t], on = days.get(t)
  return !pr || !on || !pr.some((x, i) => x && on[i]) || !!pr[weekday]
}

export function fillMonth(p: Project, month: string) {
  const slots = dutySlots(p)
  const per = new Map<string, number>()
  for (const s of slots) per.set(s.place, (per.get(s.place) ?? 0) + 1)
  const days = dutyDays(p)
  const pool = p.teachers.filter(t => roleOf(p, t.id) === 'duty').map(t => t.id)
  const dates = monthDates(month)
  const history = dutyCounts(p, shiftDate(dates[0], -1))
  const past = new Map(pool.map(t => [t, history.get(t)!.total]))
  const pastAt = new Map(pool.map(t => {
    const h = history.get(t)!, places = { ...h.places }
    const byHand = h.total - Object.values(h.places).reduce((x, y) => x + y, 0)
    for (const [pl, n] of per) places[pl] = (places[pl] ?? 0) + (byHand * n) / slots.length
    return [t, places]
  }))
  const total = new Map(pool.map(t => [t, 0]))
  const at = new Map(pool.map(t => [t, {} as Record<string, number>]))
  const free = (date: string, key: string) => !p.duty.locked[`${date}|${key}`]
  const place = (key: string) => key.split('#')[0]
  const rows = new Map<string, Record<string, string>>()
  for (const date of dates) {
    const old = p.duty.assign[date] ?? {}, row: Record<string, string> = {}
    for (const s of slots) if (!free(date, s.key) && old[s.key]) row[s.key] = old[s.key]
    rows.set(date, row)
  }
  const rowOf = (date: string) => rows.get(date) ?? p.duty.assign[date] ?? {}
  const near = (t: string, date: string, except = '') =>
    !allowsRun(p, t) && [shiftDate(date, -1), shiftDate(date, 1)].some(d => d !== except && Object.values(rowOf(d)).includes(t))
  const can = (t: string, date: string, except = '') => days.get(t)![weekdayOf(date)] && !near(t, date, except)
  const there = (t: string, date: string) => days.get(t)![weekdayOf(date)]
  const likes = (t: string, date: string) => prefersDay(p, t, weekdayOf(date), days)
  const weekOf = (date: string) => shiftDate(date, -weekdayOf(date))
  const wk = new Map<string, Map<string, number>>()
  const wcount = (t: string, w: string) => wk.get(w)?.get(t) ?? 0
  const wadd = (t: string, w: string, n: number) => { let m = wk.get(w); if (!m) wk.set(w, (m = new Map())); m.set(t, (m.get(t) ?? 0) + n) }
  for (let d = weekOf(dates[0]); d <= shiftDate(weekOf(dates[dates.length - 1]), 6); d = shiftDate(d, 1))
    if (!rows.has(d)) for (const t of Object.values(p.duty.assign[d] ?? {})) wadd(t, weekOf(d), 1)
  const last = new Map<string, string>()
  for (const [date, row] of Object.entries(p.duty.assign)) if (date < dates[0]) for (const t of Object.values(row)) if (!last.has(t) || last.get(t)! < date) last.set(t, date)
  const cost = (t: string, pl: string, date: string) => {
    const l = last.get(t)
    return ((at.get(t)![pl] ?? 0) / per.get(pl)!) * 3 + total.get(t)! + (l && between(l, date) <= 1 ? 0.5 : 0) + (likes(t, date) ? 0 : 2) + (near(t, date) ? 50 : 0)
      + 0.01 * (past.get(t)! + (pastAt.get(t)![pl] ?? 0) / per.get(pl)!) + (wcount(t, weekOf(date)) ? 4 : 0)
  }

  for (const date of dates) {
    const row = rows.get(date)!
    if (!specialOn(p, date)) {
      const used = new Set(Object.values(row))
      const open = slots.filter(s => !row[s.key])
      const pick: (string | null)[] = open.map(() => null)
      const bench = pool.filter(t => !used.has(t) && there(t, date))
      open.forEach((s, i) => {
        let best = -1
        bench.forEach((t, j) => { if (best < 0 || cost(t, s.place, date) < cost(bench[best], s.place, date)) best = j })
        if (best >= 0) pick[i] = bench.splice(best, 1)[0]
      })
      for (let better = true; better;) {
        better = false
        for (let i = 0; i < open.length; i++) {
          const a = pick[i]
          if (!a) continue
          for (let j = i + 1; j < open.length; j++) {
            const b = pick[j]
            if (!b || open[i].place === open[j].place) continue
            if (cost(a, open[j].place, date) + cost(b, open[i].place, date) < cost(a, open[i].place, date) + cost(b, open[j].place, date) - 1e-9) {
              pick[i] = b; pick[j] = a; better = true
            }
          }
          for (let j = 0; j < bench.length; j++) {
            const cur = pick[i]!, b = bench[j]
            if (cost(b, open[i].place, date) < cost(cur, open[i].place, date) - 1e-9) { pick[i] = b; bench[j] = cur; better = true }
          }
        }
      }
      open.forEach((s, i) => { if (pick[i]) row[s.key] = pick[i]! })
    }
    for (const [key, t] of Object.entries(row)) {
      if (!total.has(t)) continue
      total.set(t, total.get(t)! + 1)
      at.get(t)![place(key)] = (at.get(t)![place(key)] ?? 0) + 1
      last.set(t, date)
      wadd(t, weekOf(date), 1)
    }
  }

  const move = (date: string, key: string, from: string, to: string) => {
    rows.get(date)![key] = to
    const pl = place(key), w = weekOf(date)
    at.get(from)![pl]--
    at.get(to)![pl] = (at.get(to)![pl] ?? 0) + 1
    wadd(from, w, -1)
    wadd(to, w, 1)
  }

  for (const w of [...new Set(dates.map(weekOf))]) {
    const wdates = dates.filter(d => weekOf(d) === w && !specialOn(p, d))
    for (const t of pool) {
      if (wcount(t, w) || !wdates.some(d => there(t, d))) continue
      const prev = new Map<string, { to: string; date: string; key: string }>()
      const seen = new Set([t]), queue = [t]
      let goal = ''
      while (queue.length && !goal) {
        const x = queue.shift()!
        for (const d of wdates) {
          const row = rows.get(d)!
          if (!there(x, d) || Object.values(row).includes(x)) continue
          for (const [key, u] of Object.entries(row)) {
            if (seen.has(u) || !free(d, key) || !total.has(u)) continue
            seen.add(u)
            prev.set(u, { to: x, date: d, key })
            if (wcount(u, w) >= 2) { goal = u; break }
            queue.push(u)
          }
          if (goal) break
        }
      }
      for (let u = goal; u && u !== t;) {
        const e = prev.get(u)!
        move(e.date, e.key, u, e.to)
        u = e.to
      }
      if (goal) { total.set(goal, total.get(goal)! - 1); total.set(t, total.get(t)! + 1) }
    }
  }

  for (let moved = true; moved;) {
    moved = false
    for (const src of [...pool].sort((a, b) => total.get(b)! - total.get(a)! || past.get(b)! - past.get(a)!)) {
      const prev = new Map<string, { from: string; date: string; key: string }>()
      const seen = new Set([src]), queue = [src]
      let goal = ''
      while (queue.length && !goal) {
        const x = queue.shift()!
        for (const [date, row] of rows) {
          const onDay = new Set(Object.values(row))
          for (const [key, owner] of Object.entries(row)) {
            if (owner !== x || !free(date, key)) continue
            const w = weekOf(date), lone = wcount(x, w) < 2
            for (const y of pool) {
              if (seen.has(y) || onDay.has(y) || !can(y, date) || (lone && wcount(y, w) > 0)) continue
              seen.add(y)
              prev.set(y, { from: x, date, key })
              queue.push(y)
              const d = total.get(src)! - total.get(y)!
              if (d >= 2 || (d === 1 && past.get(src)! + total.get(src)! - past.get(y)! - total.get(y)! >= 2)) { goal = y; break }
            }
            if (goal) break
          }
          if (goal) break
        }
      }
      if (!goal) continue
      for (let y = goal; y !== src;) {
        const e = prev.get(y)!
        move(e.date, e.key, e.from, y)
        y = e.from
      }
      total.set(src, total.get(src)! - 1)
      total.set(goal, total.get(goal)! + 1)
      moved = true
      break
    }
  }

  const share = (t: string, pl: string) => ((at.get(t)?.[pl] ?? 0) + 0.01 * (pastAt.get(t)?.[pl] ?? 0)) / per.get(pl)!
  const swapScore = (a: string, pa: string, b: string, pb: string) => share(a, pa) ** 2 + share(b, pb) ** 2 + share(a, pb) ** 2 + share(b, pa) ** 2
  const trade = (a: string, pa: string, b: string, pb: string, dir: 1 | -1) => {
    at.get(a)![pa] -= dir; at.get(a)![pb] = (at.get(a)![pb] ?? 0) + dir; at.get(b)![pb] -= dir; at.get(b)![pa] = (at.get(b)![pa] ?? 0) + dir
  }
  const balanceDays = () => {
    for (let better = true; better;) {
      better = false
      for (const [date, row] of rows) {
        const keys = Object.keys(row).filter(k => free(date, k) && total.has(row[k]))
        for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
          const a = row[keys[i]], b = row[keys[j]], pa = place(keys[i]), pb = place(keys[j])
          if (pa === pb) continue
          const now = swapScore(a, pa, b, pb)
          trade(a, pa, b, pb, 1)
          if (swapScore(a, pa, b, pb) < now - 1e-9) { row[keys[i]] = b; row[keys[j]] = a; better = true }
          else trade(a, pa, b, pb, -1)
        }
      }
    }
  }
  balanceDays()

  const cells = [...rows].flatMap(([date, row]) => Object.keys(row).filter(k => free(date, k) && total.has(row[k])).map(key => ({ date, key })))
  for (let better = true; better;) {
    better = false
    for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
      const c1 = cells[i], c2 = cells[j], r1 = rows.get(c1.date)!, r2 = rows.get(c2.date)!
      const a = r1[c1.key], b = r2[c2.key], pa = place(c1.key), pb = place(c2.key)
      if (c1.date === c2.date || a === b || Object.values(r1).includes(b) || Object.values(r2).includes(a)) continue
      if (!there(b, c1.date) || !there(a, c2.date)) continue
      const w1 = weekOf(c1.date), w2 = weekOf(c2.date)
      if (w1 !== w2 && ((wcount(a, w1) < 2 && wcount(b, w1) > 0) || (wcount(b, w2) < 2 && wcount(a, w2) > 0))) continue
      const miss = (x: string, d: string, except = '') => (likes(x, d) ? 0 : 10) + (near(x, d, except) ? 100 : 0)
      const now = miss(a, c1.date) + miss(b, c2.date) + swapScore(a, pa, b, pb)
      trade(a, pa, b, pb, 1)
      const after = miss(a, c2.date, c1.date) + miss(b, c1.date, c2.date) + swapScore(a, pa, b, pb)
      if (after < now - 1e-9) {
        r1[c1.key] = b; r2[c2.key] = a; better = true
        if (w1 !== w2) { wadd(a, w1, -1); wadd(a, w2, 1); wadd(b, w2, -1); wadd(b, w1, 1) }
      } else trade(a, pa, b, pb, -1)
    }
  }

  balanceDays()

  for (const [date, row] of rows) {
    if (Object.keys(row).length) p.duty.assign[date] = row
    else delete p.duty.assign[date]
  }
}

export const totalOf = (c: Count) => c.total

export const heat = (v: number, min: number, max: number): 'low' | 'mid' | 'high' => (max === min || v === min ? 'low' : v === max ? 'high' : 'mid')

export const trDate = (iso: string) => iso.split('-').reverse().join('.')

export function monthView(p: Project, month: string) {
  const dates = monthDates(month)
  const counts = dutyCounts(p, dates[dates.length - 1], dates[0])
  const duty = p.teachers.filter(t => roleOf(p, t.id) === 'duty')
  const rows = dates.map(date => ({ date, weekday: weekdayOf(date), special: specialOn(p, date)?.name, row: p.duty.assign[date] ?? {} }))
  const totals = duty.map(t => counts.get(t.id)!.total)
  return { rows, counts, duty, min: Math.min(...totals), max: Math.max(...totals) }
}

export function buildSheet(p: Project, month: string, title: string): Sheet {
  const places = p.duty.places, slots = dutySlots(p), teacher = new Map(p.teachers.map(x => [x.id, x.name]))
  const v = monthView(p, month)
  const width = Math.max(1 + slots.length, places.length + 2)
  const rows: Cell[][] = [[{ v: title, s: S.Title }], [], [{ v: t('Date'), s: S.Head }, ...slots.map(s => ({ v: places.find(x => x.id === s.place)!.name, s: S.Head }))]]
  const merges = [`A1:${ref(width - 1, 0)}`]
  for (const d of v.rows) {
    const label = `${trDate(d.date)} ${WEEKDAYS[d.weekday]}`
    if (d.special && !Object.keys(d.row).length) {
      rows.push([{ v: label, s: S.Cell }, { v: d.special, s: S.Struck }, ...slots.slice(1).map(() => ({ v: '', s: S.Struck }))])
      if (slots.length > 1) merges.push(`${ref(1, rows.length - 1)}:${ref(slots.length, rows.length - 1)}`)
    } else rows.push([{ v: label, s: S.Cell }, ...slots.map(s => ({ v: teacher.get(d.row[s.key]) ?? '', s: S.Center }))])
  }
  rows.push([], [{ v: t('DUTY COUNTERS'), s: S.Title }], [{ v: t('Teacher'), s: S.Head }, ...places.map(pl => ({ v: pl.name, s: S.Head })), { v: t('Total duties'), s: S.Head }])
  for (const te of v.duty) {
    const c = v.counts.get(te.id)!, h = heat(c.total, v.min, v.max)
    rows.push([{ v: te.name, s: S.Cell }, ...places.map(pl => ({ v: c.places[pl.id] ?? 0, s: S.Center })), { v: c.total, s: h === 'low' ? S.Low : h === 'mid' ? S.Mid : S.High }])
  }
  return { name: t('Duty roster'), cols: [26, ...Array(width - 1).fill(20)], rows, merges }
}

export function buildCsv(p: Project, month: string): string {
  const places = p.duty.places, slots = dutySlots(p), teacher = new Map(p.teachers.map(x => [x.id, x.name]))
  const v = monthView(p, month)
  const q = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`
  const lines = [[t('Date'), t('Day'), ...slots.map(s => places.find(x => x.id === s.place)!.name)].map(q).join(';')]
  for (const d of v.rows)
    lines.push([trDate(d.date), WEEKDAYS[d.weekday], ...slots.map(s => (d.special && !Object.keys(d.row).length ? d.special : teacher.get(d.row[s.key]) ?? ''))].map(q).join(';'))
  lines.push('', [t('Teacher'), ...places.map(pl => pl.name), t('Total duties')].map(q).join(';'))
  for (const te of v.duty) { const c = v.counts.get(te.id)!; lines.push([te.name, ...places.map(pl => c.places[pl.id] ?? 0), c.total].map(q).join(';')) }
  return '\ufeff' + lines.join('\r\n')
}

export function uncoveredWeeks(p: Project, month: string) {
  const days = dutyDays(p), dates = monthDates(month)
  const weekOf = (d: string) => shiftDate(d, -weekdayOf(d))
  const out: { from: string; to: string; teachers: string[] }[] = []
  for (const w of [...new Set(dates.map(weekOf))]) {
    const week = Array.from({ length: 7 }, (_, i) => shiftDate(w, i))
    const open = week.filter(d => d.startsWith(month) && !specialOn(p, d))
    if (week[6] > dates[dates.length - 1] && !hasPlan(p, week[6].slice(0, 7))) continue
    const busy = new Set(week.flatMap(d => Object.values(p.duty.assign[d] ?? {})))
    const missing = p.teachers.filter(t => roleOf(p, t.id) === 'duty' && !busy.has(t.id) && open.some(d => days.get(t.id)![weekdayOf(d)])).map(t => t.id)
    if (missing.length) out.push({ from: open[0], to: open[open.length - 1], teachers: missing })
  }
  return out
}
