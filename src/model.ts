// Core data model. A project is plain JSON so it can be saved, shared and
// passed to the solver worker without conversion.

/** Availability grid: one char per slot (day-major), '1' = available, '0' = closed. */
export type Grid = string

export interface Entity {
  id: string
  name: string
  short: string
  color: string
  avail: Grid
}

export type Subject = Entity

export interface Teacher extends Entity {
  /** Max lesson hours per day (0 = no limit). */
  maxPerDay: number
  /** Max days per week the teacher comes in (0 = no limit). */
  maxDays: number
  /** Max idle periods ("gaps") per day (-1 = no limit). */
  maxGapsPerDay: number
}

export interface Room extends Entity {
  /** Number of identical rooms of this kind (e.g. 2 gyms). Lessons need any free one. */
  capacity: number
}

export interface ClassGroup {
  id: string
  name: string
}

export interface SchoolClass extends Entity {
  /** Sub-groups (e.g. elective groups). Lessons for different groups may run at the same time. */
  groups: ClassGroup[]
}

export interface ClassRef {
  classId: string
  /** null = whole class */
  groupId: string | null
}

export interface Lesson {
  id: string
  subjectId: string
  teacherIds: string[]
  roomIds: string[]
  classes: ClassRef[]
  /** Block sizes, e.g. [2,2,1] = a double, another double and a single, on different days. */
  split: number[]
  /** Allow two blocks of this lesson on the same day. */
  sameDayOk: boolean
  /** Lessons sharing a non-empty link are always placed at the same time (e.g. parallel electives). */
  link: string
}

export interface Placement {
  day: number
  period: number
  locked: boolean
}

export interface Period {
  label: string
  time: string
}

export interface Weights {
  classGap: number
  teacherGap: number
  classLateStart: number
  spread: number
}

export interface Project {
  version: 1
  school: { name: string; year: string; principal: string }
  days: string[]
  periods: Period[]
  /** School-wide availability. */
  avail: Grid
  subjects: Subject[]
  teachers: Teacher[]
  rooms: Room[]
  classes: SchoolClass[]
  lessons: Lesson[]
  /** key = cardId(lessonId, part) */
  placements: Record<string, Placement>
  weights: Weights
}

export const cardId = (lessonId: string, part: number) => `${lessonId}#${part}`

export const parseCardId = (id: string) => {
  const i = id.lastIndexOf('#')
  return { lessonId: id.slice(0, i), part: Number(id.slice(i + 1)) }
}

let idCounter = 0
export const newId = (prefix = '') =>
  prefix + Date.now().toString(36) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 6)

export const fullGrid = (days: number, periods: number) => '1'.repeat(days * periods)

/** Re-map a grid when the number of days/periods changes, keeping existing cells. */
export function resizeGrid(g: Grid, oldD: number, oldP: number, d: number, p: number): Grid {
  let out = ''
  for (let i = 0; i < d; i++)
    for (let j = 0; j < p; j++) out += i < oldD && j < oldP ? (g[i * oldP + j] ?? '1') : '1'
  return out
}

export const PALETTE = [
  '#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#8e5572', '#2a9d8f', '#e76f51',
  '#457b9d', '#bc6c25', '#6a4c93', '#1982c4', '#8ac926', '#ff595e', '#6d597a', '#b56576',
  '#355070', '#43aa8b', '#f8961e', '#577590', '#90be6d', '#f94144', '#4d908e', '#c08497',
]
export const pickColor = (i: number) => PALETTE[i % PALETTE.length]

export const DEFAULT_WEIGHTS: Weights = { classGap: 300, teacherGap: 10, classLateStart: 40, spread: 3 }

export function emptyProject(): Project {
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma']
  const times = ['08:30-09:10', '09:20-10:00', '10:10-10:50', '11:00-11:40', '11:50-12:30', '13:20-14:00', '14:10-14:50', '15:00-15:40']
  return {
    version: 1,
    school: { name: '', year: '', principal: '' },
    days,
    periods: times.map((t, i) => ({ label: String(i + 1), time: t })),
    avail: fullGrid(days.length, times.length),
    subjects: [],
    teachers: [],
    rooms: [],
    classes: [],
    lessons: [],
    placements: {},
    weights: { ...DEFAULT_WEIGHTS },
  }
}

export const lessonHours = (l: Lesson) => l.split.reduce((a, b) => a + b, 0)

export function parseSplit(s: string): number[] | null {
  const parts = s.split(/[+,\s]+/).filter(Boolean).map(Number)
  if (!parts.length || parts.some(n => !Number.isInteger(n) || n < 1 || n > 12)) return null
  return parts
}

export const splitLabel = (split: number[]) => split.join('+')

/** Suggested split for a weekly hour count (doubles first, like common practice). */
export function defaultSplit(hours: number): number[] {
  if (hours <= 2) return [hours]
  const out: number[] = []
  let h = hours
  while (h >= 2) { out.push(2); h -= 2 }
  if (h) out.push(1)
  return out
}

/** Translucent version of a #rrggbb colour (for tinted cell backgrounds without CSS color-mix). */
export function tint(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 'transparent'
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

/** Inline CSS variables for a coloured card/cell: --c = solid, --cbg = tint. */
export const colorVars = (hex: string | undefined, alpha = 0.16) =>
  (hex ? { '--c': hex, '--cbg': tint(hex, alpha) } : {}) as Record<string, string>
