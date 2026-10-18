import { t } from './i18n'
import { parseCardId, type DutyRole, type Project, type SpecialDay } from './model'
import { ref, S, type Cell, type Sheet } from './xlsx'

export const DUTY_ROLES: [DutyRole, string][] = [['duty', 'On duty'], ['admin', 'Administrator'], ['dutyAdmin', 'Duty administrator'], ['preschool', 'Preschool']]

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

export function dutyCounts(p: Project, until: string): Map<string, Count> {
  const out = new Map(p.teachers.map(t => [t.id, { places: {}, total: 0 } as Count]))
  for (const [date, row] of Object.entries(p.duty.assign)) {
    if (date > until) continue
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
      if (c && m <= until.slice(0, 7) && !hasPlan(p, m)) c.total += n
    }
  return out
}

const between = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5)

export function fillMonth(p: Project, month: string) {
  const slots = dutySlots(p)
  const per = new Map<string, number>()
  for (const s of slots) per.set(s.place, (per.get(s.place) ?? 0) + 1)
  const days = dutyDays(p)
  const pool = p.teachers.filter(t => roleOf(p, t.id) === 'duty').map(t => t.id)
  const dates = monthDates(month)
  const history = dutyCounts(p, iso(new Date(parse(dates[0]).getTime() - 864e5)))
  const total = new Map(pool.map(t => [t, history.get(t)!.total]))
  const at = new Map(pool.map(t => {
    const h = history.get(t)!, places = { ...h.places }
    const byHand = h.total - Object.values(h.places).reduce((x, y) => x + y, 0)
    for (const [pl, n] of per) places[pl] = (places[pl] ?? 0) + (byHand * n) / slots.length
    return [t, places]
  }))
  const last = new Map<string, string>()
  for (const [date, row] of Object.entries(p.duty.assign)) if (date < dates[0]) for (const t of Object.values(row)) if (!last.has(t) || last.get(t)! < date) last.set(t, date)
  const cost = (t: string, place: string, date: string) => {
    const l = last.get(t)
    return ((at.get(t)![place] ?? 0) / per.get(place)!) * 3 + total.get(t)! + (l && between(l, date) <= 1 ? 0.5 : 0)
  }
  for (const date of dates) {
    const old = p.duty.assign[date] ?? {}
    const row: Record<string, string> = {}
    for (const s of slots) if (p.duty.locked[`${date}|${s.key}`] && old[s.key]) row[s.key] = old[s.key]
    if (!specialOn(p, date)) {
      const wd = weekdayOf(date), used = new Set(Object.values(row))
      const open = slots.filter(s => !row[s.key])
      const pick: (string | null)[] = open.map(() => null)
      const bench = pool.filter(t => days.get(t)![wd] && !used.has(t))
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
      const pl = key.split('#')[0]
      total.set(t, total.get(t)! + 1)
      at.get(t)![pl] = (at.get(t)![pl] ?? 0) + 1
      last.set(t, date)
    }
    if (Object.keys(row).length) p.duty.assign[date] = row
    else delete p.duty.assign[date]
  }
}

export const totalOf = (c: Count) => c.total

export const heat = (v: number, min: number, max: number): 'low' | 'mid' | 'high' => (max === min || v === min ? 'low' : v === max ? 'high' : 'mid')

export const trDate = (iso: string) => iso.split('-').reverse().join('.')

export function monthView(p: Project, month: string) {
  const dates = monthDates(month)
  const counts = dutyCounts(p, dates[dates.length - 1])
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
