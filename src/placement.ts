import { cardId, groupsOverlap, parseCardId, type Lesson, type Project } from './model'
import { update } from './store'
import type { TTIndex } from './timetable'

export type SlotStatus = 'closed' | 'bad' | 'warn' | 'ok'

function companions(p: Project, id: string): string[] {
  const { lessonId, part } = parseCardId(id)
  const l = p.lessons.find(x => x.id === lessonId)
  if (!l?.link) return [id]
  return p.lessons.filter(x => x.link === l.link && x.split.length > part).map(x => cardId(x.id, part))
}

export function slotStatuses(p: Project, idx: TTIndex, id: string): SlotStatus[] {
  const P = p.periods.length, S = p.days.length * P
  const group = companions(p, id)
  const lessons = group.map(c => p.lessons.find(l => l.id === parseCardId(c).lessonId)!).filter(Boolean)
  const { part } = parseCardId(id)
  const len = lessons[0]?.split[part] ?? 1
  const grids: string[] = [p.avail]
  const sub = new Map(p.subjects.map(s => [s.id, s]))
  const tea = new Map(p.teachers.map(s => [s.id, s]))
  const roo = new Map(p.rooms.map(s => [s.id, s]))
  const cla = new Map(p.classes.map(s => [s.id, s]))
  for (const l of lessons) {
    const s = sub.get(l.subjectId); if (s) grids.push(s.avail)
    l.teacherIds.forEach(t => { const x = tea.get(t); if (x) grids.push(x.avail) })
    l.roomIds.forEach(t => { const x = roo.get(t); if (x) grids.push(x.avail) })
    l.classes.forEach(c => { const x = cla.get(c.classId); if (x) grids.push(x.avail) })
  }
  const own = new Set(group)
  const busy = (cards: { cardId: string; groupId: string | null }[], hit = (_: string | null) => true) =>
    cards.some(c => !own.has(c.cardId) && hit(c.groupId))
  const out: SlotStatus[] = new Array(S).fill('closed')
  for (let d = 0; d < p.days.length; d++)
    for (let pp = 0; pp + len <= P; pp++) {
      const s0 = d * P + pp
      let st: SlotStatus = 'ok'
      for (let k = 0; k < len; k++) {
        const s = s0 + k
        if (grids.some(g => g[s] === '0')) { st = 'closed'; break }
        for (const l of lessons) {
          if (l.teacherIds.some(t => busy(idx.grids.teacher.get(t)?.[s] ?? []))) st = 'bad'
          if (l.roomIds.some(r => (idx.grids.room.get(r)?.[s] ?? []).filter(c => !own.has(c.cardId)).length >= (roo.get(r)?.capacity || 1))) st = 'bad'
          if (l.classes.some(c => busy(idx.grids.class.get(c.classId)?.[s] ?? [], g => groupsOverlap(cla.get(c.classId), c.groupId, g)))) st = 'bad'
        }
      }
      if (st === 'ok') {
        for (const l of lessons) {
          if (l.sameDayOk) continue
          l.split.forEach((_, k) => {
            if (k === part) return
            const pl = p.placements[cardId(l.id, k)]
            if (pl && pl.day === d) st = 'warn'
          })
        }
      }
      out[s0] = st
    }
  return out
}

export function moveCard(p: Project, id: string, day: number, period: number, lock = true) {
  const group = companions(p, id)
  update(d => {
    for (const c of group) d.placements[c] = { day, period, locked: lock || (d.placements[c]?.locked ?? false) }
  })
}

export function swapCards(p: Project, a: string, b: string) {
  const ga = companions(p, a), gb = companions(p, b)
  const pa = p.placements[a], pb = p.placements[b]
  if (!pa || !pb) return
  update(d => {
    for (const c of ga) d.placements[c] = { day: pb.day, period: pb.period, locked: true }
    for (const c of gb) d.placements[c] = { day: pa.day, period: pa.period, locked: true }
  })
}

export function unplaceCard(p: Project, id: string) {
  const group = companions(p, id)
  update(d => { for (const c of group) delete d.placements[c] })
}

export function setLocked(p: Project, id: string, locked: boolean) {
  const group = companions(p, id)
  update(d => { for (const c of group) if (d.placements[c]) d.placements[c].locked = locked })
}

export const lessonOf = (p: Project, id: string): Lesson | undefined => p.lessons.find(l => l.id === parseCardId(id).lessonId)
