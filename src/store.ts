import { useSyncExternalStore } from 'react'
import { produce, type Draft } from 'immer'
import { emptyProject, resizeGrid, upperName, type Project } from './model'

const KEY = 'duzenbaz.project.v1'
const MAX_HISTORY = 200

function load(): Project {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return migrate(JSON.parse(raw))
  } catch {}
  return emptyProject()
}

export function migrate(p: Partial<Project>): Project {
  const base = emptyProject()
  const out = { ...base, ...p, weights: { ...base.weights, ...(p.weights ?? {}) } } as Project
  const S = out.days.length * out.periods.length
  const fix = (g: string) => (g && g.length === S ? g : '1'.repeat(S))
  out.avail = fix(out.avail)
  for (const list of [out.subjects, out.teachers, out.rooms, out.classes]) for (const e of list) e.avail = fix(e.avail)
  for (const c of out.classes) c.groups ??= []
  for (const r of out.rooms) r.capacity ??= 1
  for (const t of out.teachers) { t.maxPerDay ??= 0; t.maxDays ??= 0; t.maxGapsPerDay ??= -1 }
  for (const l of out.lessons) { l.link ??= ''; l.sameDayOk ??= false; l.roomIds ??= [] }
  out.placements ??= {}
  for (const e of [...out.subjects, ...out.teachers]) e.name = upperName(e.name)
  out.strictClasses ??= true
  out.useRooms ??= out.rooms.length > 0 && out.lessons.some(l => l.roomIds.length > 0)
  return out
}

let state: Project = load()
let past: Project[] = []
let future: Project[] = []
let lastTag = '', lastTagAt = 0
const listeners = new Set<() => void>()
let saveTimer: number | undefined

function emit() {
  listeners.forEach(l => l())
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
  }, 400)
}

export const getProject = () => state

export function update(fn: (d: Draft<Project>) => void, tag = '') {
  const next = produce(state, fn)
  if (next === state) return
  const now = Date.now()
  if (!(tag && tag === lastTag && now - lastTagAt < 1500)) {
    past.push(state)
    if (past.length > MAX_HISTORY) past.shift()
  }
  lastTag = tag; lastTagAt = now
  future = []
  state = next
  emit()
}

export function replaceProject(p: Project) {
  past.push(state); future = []
  state = migrate(p)
  lastTag = ''
  emit()
}

export function undo() {
  const prev = past.pop()
  if (!prev) return
  future.push(state); state = prev; lastTag = ''
  emit()
}

export function redo() {
  const next = future.pop()
  if (!next) return
  past.push(state); state = next; lastTag = ''
  emit()
}

export const canUndo = () => past.length > 0
export const canRedo = () => future.length > 0

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useProject = () => useSyncExternalStore(subscribe, getProject)

export function setTimeShape(days: string[], periods: Project['periods']) {
  update(d => {
    const oD = d.days.length, oP = d.periods.length, nD = days.length, nP = periods.length
    if (oD !== nD || oP !== nP) {
      const rs = (g: string) => resizeGrid(g, oD, oP, nD, nP)
      d.avail = rs(d.avail)
      for (const list of [d.subjects, d.teachers, d.rooms, d.classes]) for (const e of list) e.avail = rs(e.avail)
      for (const [k, pl] of Object.entries(d.placements)) if (pl.day >= nD || pl.period >= nP) delete d.placements[k]
    }
    d.days = days
    d.periods = periods
  })
}

export function prunePlacements(d: Draft<Project>) {
  const lessons = new Map(d.lessons.map(l => [l.id, l]))
  for (const k of Object.keys(d.placements)) {
    const i = k.lastIndexOf('#')
    const l = lessons.get(k.slice(0, i))
    if (!l || Number(k.slice(i + 1)) >= l.split.length) delete d.placements[k]
  }
}
