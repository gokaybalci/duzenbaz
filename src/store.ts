import { useSyncExternalStore } from 'react'
import { produce, type Draft } from 'immer'
import { emptyProject, resizeGrid, upperName, type Project } from './model'
import { native } from './native'

const KEY = 'duzenbaz.project.v1'
const SAVED_KEY = 'duzenbaz.saved'
const PATH_KEY = 'duzenbaz.file'
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
  out.duty = { ...base.duty, ...p.duty }
  out.school = { ...base.school, ...p.school }
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
let saved: Project | null = null
let filePath: string | null = null
try { if (localStorage.getItem(SAVED_KEY) === '1') saved = state; filePath = localStorage.getItem(PATH_KEY) } catch {}

// Written at once (about 1 ms for 40 classes) and together, so the working copy and its file path never drift apart.
function emit() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
    localStorage.setItem(SAVED_KEY, state === saved ? '1' : '0')
    if (filePath) localStorage.setItem(PATH_KEY, filePath)
    else localStorage.removeItem(PATH_KEY)
  } catch {}
  listeners.forEach(l => l())
}

export const getProject = () => state
export const getFilePath = () => filePath

// The .duzenbaz file the working copy belongs to; null = the next Save writes a new file.
export function setFilePath(path: string | null) {
  filePath = path
  if (!path) native?.forgetProjectPath()
  emit()
}

export function markSaved(p: Project) {
  saved = p
  emit()
}

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

const loaded = new WeakSet<Project>()

export function replaceProject(p: Project) {
  past.push(state); future = []
  state = migrate(p)
  loaded.add(state)
  lastTag = ''
  emit()
}

export function undo() {
  const prev = past.pop()
  if (!prev) return
  const leavingFile = loaded.has(state)
  future.push(state); state = prev; lastTag = ''
  if (leavingFile) setFilePath(null)
  else emit()
}

export function redo() {
  const next = future.pop()
  if (!next) return
  past.push(state); state = next; lastTag = ''
  if (loaded.has(next)) setFilePath(null)
  else emit()
}

export const canUndo = () => past.length > 0
export const canRedo = () => future.length > 0

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
export const useProject = () => useSyncExternalStore(subscribe, getProject)
export const useSaved = () => useSyncExternalStore(subscribe, () => state === saved)

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

export function removeTeacher(d: Draft<Project>, id: string) {
  d.teachers = d.teachers.filter(x => x.id !== id)
  d.lessons.forEach(l => { l.teacherIds = l.teacherIds.filter(x => x !== id) })
  prunePlacements(d)
  for (const m of [d.duty.role, d.duty.days, d.duty.manual, d.duty.consecutive, d.duty.prefer, d.duty.fixed]) delete m[id]
  for (const [date, row] of Object.entries(d.duty.assign))
    for (const [key, t] of Object.entries(row)) if (t === id) { delete row[key]; delete d.duty.locked[`${date}|${key}`] }
}

export function prunePlacements(d: Draft<Project>) {
  const lessons = new Map(d.lessons.map(l => [l.id, l]))
  for (const k of Object.keys(d.placements)) {
    const i = k.lastIndexOf('#')
    const l = lessons.get(k.slice(0, i))
    if (!l || Number(k.slice(i + 1)) >= l.split.length) delete d.placements[k]
  }
}
