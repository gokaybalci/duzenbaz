// Derived views of a project's placements: per class / teacher / room grids.

import { cardId, type Lesson, type Project } from './model'

export type Kind = 'class' | 'teacher' | 'room'

export interface CellCard {
  cardId: string
  lesson: Lesson
  part: number
  len: number
  /** position inside a multi-period block (0 = first period) */
  offset: number
  locked: boolean
  /** class group id when the lesson touches only a group of this class */
  groupId: string | null
}

export interface UnplacedCard {
  cardId: string
  lesson: Lesson
  part: number
  len: number
}

export interface TTIndex {
  S: number
  grids: Record<Kind, Map<string, CellCard[][]>>
  unplaced: UnplacedCard[]
  /** slot -> number of resources double-booked (any kind) */
  clashSlots: Map<string, Set<number>>
}

export function buildIndex(p: Project): TTIndex {
  const P = p.periods.length, S = p.days.length * P
  const grids: TTIndex['grids'] = { class: new Map(), teacher: new Map(), room: new Map() }
  const mk = (m: Map<string, CellCard[][]>, id: string) => {
    let g = m.get(id)
    if (!g) { g = Array.from({ length: S }, () => []); m.set(id, g) }
    return g
  }
  for (const c of p.classes) mk(grids.class, c.id)
  for (const t of p.teachers) mk(grids.teacher, t.id)
  for (const r of p.rooms) mk(grids.room, r.id)
  const unplaced: UnplacedCard[] = []
  for (const l of p.lessons)
    l.split.forEach((len, part) => {
      const id = cardId(l.id, part)
      const pl = p.placements[id]
      if (!pl || pl.day >= p.days.length || pl.period + len > P) { unplaced.push({ cardId: id, lesson: l, part, len }); return }
      for (let k = 0; k < len; k++) {
        const s = pl.day * P + pl.period + k
        const base = { cardId: id, lesson: l, part, len, offset: k, locked: pl.locked }
        for (const c of l.classes) grids.class.get(c.classId)?.[s].push({ ...base, groupId: c.groupId })
        for (const t of l.teacherIds) grids.teacher.get(t)?.[s].push({ ...base, groupId: null })
        for (const r of l.roomIds) grids.room.get(r)?.[s].push({ ...base, groupId: null })
      }
    })
  // A cell is a clash if two cards share a teacher/room, or a class with overlapping groups.
  const clashSlots = new Map<string, Set<number>>()
  const mark = (id: string, s: number) => { let set = clashSlots.get(id); if (!set) clashSlots.set(id, (set = new Set())); set.add(s) }
  for (const [, g] of grids.teacher) g.forEach((cards, s) => { if (cards.length > 1) cards.forEach(c => mark(c.cardId, s)) })
  const cap = new Map(p.rooms.map(r => [r.id, r.capacity || 1]))
  for (const [rid, g] of grids.room) g.forEach((cards, s) => { if (cards.length > (cap.get(rid) ?? 1)) cards.forEach(c => mark(c.cardId, s)) })
  for (const [, g] of grids.class)
    g.forEach((cards, s) => {
      for (let i = 0; i < cards.length; i++)
        for (let j = i + 1; j < cards.length; j++) {
          const a = cards[i], b = cards[j]
          if (a.cardId === b.cardId) continue
          if (a.groupId === null || b.groupId === null || a.groupId === b.groupId) { mark(a.cardId, s); mark(b.cardId, s) }
        }
    })
  return { S, grids, unplaced, clashSlots }
}

export interface Names {
  subject: Map<string, { name: string; short: string; color: string }>
  teacher: Map<string, { name: string; short: string }>
  room: Map<string, { name: string; short: string }>
  class: Map<string, { name: string; short: string; groups: { id: string; name: string }[] }>
}

export function names(p: Project): Names {
  return {
    subject: new Map(p.subjects.map(s => [s.id, s])),
    teacher: new Map(p.teachers.map(s => [s.id, s])),
    room: new Map(p.rooms.map(s => [s.id, s])),
    class: new Map(p.classes.map(s => [s.id, s])),
  }
}

const pick = (e: { name: string; short: string } | undefined, short: boolean) => (e ? (short ? e.short || e.name : e.name) : '?')

export function classLabel(n: Names, c: { classId: string; groupId: string | null }, short: boolean) {
  const cls = n.class.get(c.classId)
  const base = pick(cls, short)
  if (c.groupId === null) return base
  const g = cls?.groups.find(g => g.id === c.groupId)
  return `${base} (${g?.name ?? c.groupId})`
}

/** Text lines for a card shown in a given kind of timetable. */
export function cardLines(n: Names, l: Lesson, kind: Kind, short: boolean, viewerId?: string): { title: string; lines: string[]; color: string } {
  const subj = n.subject.get(l.subjectId)
  const title = pick(subj, short)
  const teachers = l.teacherIds.map(t => pick(n.teacher.get(t), short)).join(', ')
  const rooms = l.roomIds.map(r => pick(n.room.get(r), short)).join(', ')
  const classes = l.classes.map(c => classLabel(n, c, true)).join(', ')
  const lines: string[] = []
  if (kind === 'class') {
    const own = l.classes.find(c => c.classId === viewerId)
    if (own?.groupId) lines.push(classLabel(n, own, true).replace(/^[^(]*\(|\)$/g, ''))
    if (teachers) lines.push(teachers)
    if (rooms) lines.push(rooms)
  } else if (kind === 'teacher') {
    lines.push(classes)
    if (rooms) lines.push(rooms)
  } else {
    lines.push(classes)
    if (teachers) lines.push(teachers)
  }
  return { title, lines, color: subj?.color ?? '#888' }
}

export function entitiesOf(p: Project, kind: Kind) {
  return kind === 'class' ? p.classes : kind === 'teacher' ? p.teachers : p.rooms
}

/**
 * Weekly hours assigned to a class / teacher / room (from lesson definitions).
 * For classes, group lessons run in parallel, so it is whole-class hours + the busiest group.
 */
export function loadOf(p: Project, kind: Kind, id: string) {
  let h = 0
  const groups = new Map<string, number>()
  for (const l of p.lessons) {
    const sum = l.split.reduce((a, b) => a + b, 0)
    if (kind === 'class') {
      for (const c of l.classes) {
        if (c.classId !== id) continue
        if (c.groupId === null) h += sum
        else groups.set(c.groupId, (groups.get(c.groupId) ?? 0) + sum)
      }
    } else if (kind === 'teacher' ? l.teacherIds.includes(id) : l.roomIds.includes(id)) h += sum
  }
  return h + Math.max(0, ...groups.values())
}
