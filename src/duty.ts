import { parseCardId, type Project } from './model'

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

export function autoDays(p: Project): Record<string, number> {
  const days = schoolDays(p)
  const open = (id: string) => days.get(id)!.filter(Boolean).length
  const load = p.days.map(() => 0)
  const out: Record<string, number> = {}
  for (const t of [...p.teachers].sort((a, b) => open(a.id) - open(b.id))) {
    let best = -1
    days.get(t.id)!.forEach((ok, d) => { if (ok && (best < 0 || load[d] < load[best])) best = d })
    out[t.id] = best
    if (best >= 0) load[best]++
  }
  return out
}

export const dutySlots = (p: Project) => p.duty.places.flatMap(pl => Array<string>(Math.max(0, pl.count)).fill(pl.id))

export const teachersByDay = (p: Project) =>
  p.days.map((_, d) => p.teachers.filter(t => p.duty.day[t.id] === d).map(t => t.id))

export function dutySchedule(p: Project): (string | null)[][][] {
  const slots = dutySlots(p)
  const total = new Map<string, number>(), last = new Map<string, number>(), at = new Map<string, number>()
  const key = (t: string, pl: string) => t + '|' + pl
  const groups = teachersByDay(p)
  const per = new Map<string, number>()
  for (const pl of slots) per.set(pl, (per.get(pl) ?? 0) + 1)
  const weeks: (string | null)[][][] = []
  for (let w = 0; w < p.duty.weeks; w++) {
    weeks.push(groups.map(L => {
      const sorted = [...L].sort((a, b) => (total.get(a) ?? 0) - (total.get(b) ?? 0) || (last.get(a) ?? -1) - (last.get(b) ?? -1))
      const edge = total.get(sorted[slots.length - 1]) ?? 0
      const bench = sorted.slice(slots.length).filter(t => (total.get(t) ?? 0) === edge)
      const row: (string | null)[] = [...slots.map((_, j) => sorted[j] ?? null), ...bench]
      const cost = (t: string, j: number) => (j < slots.length ? (at.get(key(t, slots[j])) ?? 0) / per.get(slots[j])! : 0)
      const canBench = (t: string | null) => !t || (total.get(t) ?? 0) === edge
      for (let better = true; better;) {
        better = false
        for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) {
          const a = row[i], b = row[j]
          if (!a || (j < slots.length && slots[i] === slots[j]) || (j >= slots.length && !canBench(a))) continue
          const now = cost(a, i) ** 2 + (b ? cost(b, j) ** 2 : 0), swapped = cost(a, j) ** 2 + (b ? cost(b, i) ** 2 : 0)
          if (swapped < now - 1e-9) { row[i] = b; row[j] = a; better = true }
        }
      }
      row.length = slots.length
      for (const t of row) if (t) { total.set(t, (total.get(t) ?? 0) + 1); last.set(t, w) }
      row.forEach((t, j) => { if (t) at.set(key(t, slots[j]), (at.get(key(t, slots[j])) ?? 0) + 1) })
      return row
    }))
  }
  return weeks
}

export function dutyCounts(p: Project, weeks = dutySchedule(p)): Map<string, Record<string, number>> {
  const slots = dutySlots(p)
  const out = new Map(p.teachers.map(t => [t.id, {} as Record<string, number>]))
  for (const days of weeks)
    for (const day of days)
      day.forEach((t, j) => { if (t) { const c = out.get(t)!; c[slots[j]] = (c[slots[j]] ?? 0) + 1 } })
  return out
}

export function weekDates(p: Project, w: number): Date[] | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.duty.start)) return null
  const [y, m, d] = p.duty.start.split('-').map(Number)
  return p.days.map((_, i) => new Date(y, m - 1, d + 7 * w + i))
}
