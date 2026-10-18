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

export const dutyDays = (p: Project, school = schoolDays(p)) =>
  new Map(p.teachers.map(t => [t.id, p.duty.days[t.id] ?? school.get(t.id)!]))

export const roleOf = (p: Project, id: string): DutyRole => p.duty.role[id] ?? 'duty'

export const dutySlots = (p: Project) => p.duty.places.flatMap(pl => Array<string>(Math.max(0, pl.count)).fill(pl.id))

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)

export const currentMonth = (p: Project) => (/^\d{4}-\d{2}$/.test(p.duty.month) ? p.duty.month : iso(new Date()).slice(0, 7))

export const specialOn = (p: Project, date: string): SpecialDay | undefined =>
  p.duty.specials.find(s => validDate(s.from) && s.from <= date && date <= (validDate(s.to) && s.to >= s.from ? s.to : s.from))

export interface DutyDay { date: string; weekday: number; special?: string; row: (string | null)[] }

export function dutyPlan(p: Project, until: string): DutyDay[] {
  const slots = dutySlots(p)
  const per = new Map<string, number>()
  for (const pl of slots) per.set(pl, (per.get(pl) ?? 0) + 1)
  const days = dutyDays(p)
  const pool = p.teachers.filter(t => roleOf(p, t.id) === 'duty').map(t => t.id)
  const total = new Map<string, number>(), last = new Map<string, number>(), at = new Map<string, number>()
  const key = (t: string, pl: string) => t + '|' + pl
  const cost = (t: string, j: number) => (j < slots.length ? (at.get(key(t, slots[j])) ?? 0) / per.get(slots[j])! : 0)
  const out: DutyDay[] = []
  const first = validDate(p.duty.start) ? p.duty.start : until.slice(0, 8) + '01'
  for (let d = parse(first), n = 0; iso(d) <= until; d.setDate(d.getDate() + 1), n++) {
    const date = iso(d), weekday = (d.getDay() + 6) % 7
    if (weekday >= p.days.length) continue
    const special = specialOn(p, date)
    if (special) { out.push({ date, weekday, special: special.name, row: [] }); continue }
    const sorted = pool.filter(t => days.get(t)![weekday])
      .sort((a, b) => (total.get(a) ?? 0) - (total.get(b) ?? 0) || (last.get(a) ?? -1) - (last.get(b) ?? -1))
    const edge = total.get(sorted[slots.length - 1]) ?? 0
    const bench = sorted.slice(slots.length).filter(t => (total.get(t) ?? 0) === edge)
    const row: (string | null)[] = [...slots.map((_, j) => sorted[j] ?? null), ...bench]
    for (let better = true; better;) {
      better = false
      for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) {
        const a = row[i], b = row[j]
        if (!a || (j < slots.length && slots[i] === slots[j]) || (j >= slots.length && (total.get(a) ?? 0) !== edge)) continue
        const now = cost(a, i) ** 2 + (b ? cost(b, j) ** 2 : 0), swapped = cost(a, j) ** 2 + (b ? cost(b, i) ** 2 : 0)
        if (swapped < now - 1e-9) { row[i] = b; row[j] = a; better = true }
      }
    }
    row.length = slots.length
    row.forEach((t, j) => {
      if (!t) return
      total.set(t, (total.get(t) ?? 0) + 1)
      last.set(t, n)
      at.set(key(t, slots[j]), (at.get(key(t, slots[j])) ?? 0) + 1)
    })
    out.push({ date, weekday, row })
  }
  return out
}

export function dutyCounts(p: Project, plan: DutyDay[]): Map<string, Record<string, number>> {
  const slots = dutySlots(p)
  const out = new Map(p.teachers.filter(t => roleOf(p, t.id) === 'duty').map(t => [t.id, {} as Record<string, number>]))
  for (const day of plan)
    day.row.forEach((t, j) => { const c = t && out.get(t); if (c) c[slots[j]] = (c[slots[j]] ?? 0) + 1 })
  return out
}

export function monthPlan(p: Project, month = currentMonth(p)) {
  const [y, m] = month.split('-').map(Number)
  const plan = dutyPlan(p, iso(new Date(y, m, 0)))
  return { month, days: plan.filter(d => d.date.startsWith(month)), counts: dutyCounts(p, plan) }
}

export const totalOf = (c: Record<string, number>) => Object.values(c).reduce((a, b) => a + b, 0)

export const heat = (v: number, min: number, max: number): 'low' | 'mid' | 'high' => (max === min || v === min ? 'low' : v === max ? 'high' : 'mid')

export const trDate = (iso: string) => iso.split('-').reverse().join('.')

export function buildSheet(p: Project, mp: ReturnType<typeof monthPlan>, title: string): Sheet {
  const places = p.duty.places, teacher = new Map(p.teachers.map(x => [x.id, x.name]))
  const slots = places.flatMap(pl => Array<string>(pl.count).fill(pl.id))
  const W = 1 + slots.length
  const rows: Cell[][] = [[{ v: title, s: S.Title }], [], [{ v: t('Date'), s: S.Head }, ...slots.map(id => ({ v: places.find(x => x.id === id)!.name, s: S.Head }))]]
  const merges = [`A1:${ref(Math.max(W, places.length + 2) - 1, 0)}`]
  for (const d of mp.days) {
    const label = `${trDate(d.date)} ${p.days[d.weekday]}`
    if (d.special) {
      rows.push([{ v: label, s: S.Cell }, { v: d.special, s: S.Struck }, ...slots.slice(1).map(() => ({ v: '', s: S.Struck }))])
      if (slots.length > 1) merges.push(`${ref(1, rows.length - 1)}:${ref(slots.length, rows.length - 1)}`)
    } else rows.push([{ v: label, s: S.Cell }, ...d.row.map(id => ({ v: id ? teacher.get(id) ?? '' : '—', s: S.Center }))])
  }
  rows.push([], [{ v: t('DUTY COUNTERS'), s: S.Title }], [{ v: t('Teacher'), s: S.Head }, ...places.map(pl => ({ v: pl.name, s: S.Head })), { v: t('Total duties'), s: S.Head }])
  const totals = [...mp.counts.values()].map(totalOf), min = Math.min(...totals), max = Math.max(...totals)
  for (const [id, c] of mp.counts) {
    const h = heat(totalOf(c), min, max)
    rows.push([{ v: teacher.get(id) ?? '', s: S.Cell }, ...places.map(pl => ({ v: c[pl.id] ?? 0, s: S.Center })), { v: totalOf(c), s: h === 'low' ? S.Low : h === 'mid' ? S.Mid : S.High }])
  }
  return { name: t('Duty roster'), cols: [26, ...Array(Math.max(slots.length, places.length + 1)).fill(20)], rows, merges }
}
