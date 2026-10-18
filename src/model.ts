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
  maxPerDay: number
  maxDays: number
  maxGapsPerDay: number
}

export interface Room extends Entity {
  capacity: number
}

interface ClassGroup {
  id: string
  name: string
}

export interface SchoolClass extends Entity {
  groups: ClassGroup[]
}

export interface ClassRef {
  classId: string
  groupId: string | null
}

export interface Lesson {
  id: string
  subjectId: string
  teacherIds: string[]
  roomIds: string[]
  classes: ClassRef[]
  split: number[]
  sameDayOk: boolean
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

interface Weights {
  classGap: number
  teacherGap: number
  classLateStart: number
  spread: number
}

export interface Project {
  version: 1
  school: { name: string; year: string; principal: string; vice: string }
  days: string[]
  periods: Period[]
  avail: Grid
  subjects: Subject[]
  teachers: Teacher[]
  rooms: Room[]
  classes: SchoolClass[]
  lessons: Lesson[]
  placements: Record<string, Placement>
  weights: Weights
  strictClasses: boolean
  useRooms: boolean
  schoolType: SchoolType
  duty: Duty
}

export interface DutyPlace {
  id: string
  name: string
  count: number
}

export type DutyRole = 'duty' | 'admin' | 'dutyAdmin' | 'preschool' | 'none'

export interface SpecialDay {
  id: string
  from: string
  to: string
  name: string
}

export interface Duty {
  places: DutyPlace[]
  role: Record<string, DutyRole>
  days: Record<string, boolean[]>
  specials: SpecialDay[]
  month: string
  assign: Record<string, Record<string, string>>
  locked: Record<string, true>
  manual: Record<string, Record<string, number>>
  consecutive: Record<string, boolean>
  prefer: Record<string, boolean[]>
  fixed: Record<string, string>
  hoursWeight: number
}

export type SchoolType = '' | 'ilkokul' | 'ortaokul' | 'lise'
export const SCHOOL_TYPES: [SchoolType, string][] = [['ilkokul', 'İlkokul'], ['ortaokul', 'Ortaokul'], ['lise', 'Lise']]

export const cardId = (lessonId: string, part: number) => `${lessonId}#${part}`

export const parseCardId = (id: string) => {
  const i = id.lastIndexOf('#')
  return { lessonId: id.slice(0, i), part: Number(id.slice(i + 1)) }
}

let idCounter = 0
export const newId = (prefix = '') =>
  prefix + Date.now().toString(36) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 6)

export const fullGrid = (days: number, periods: number) => '1'.repeat(days * periods)

export function resizeGrid(g: Grid, oldD: number, oldP: number, d: number, p: number): Grid {
  let out = ''
  for (let i = 0; i < d; i++)
    for (let j = 0; j < p; j++) out += i < oldD && j < oldP ? (g[i * oldP + j] ?? '1') : '1'
  return out
}

const PALETTE = [
  '#e4572e', '#29335c', '#f3a712', '#669bbc', '#a8c686', '#8e5572', '#2a9d8f', '#e76f51',
  '#457b9d', '#bc6c25', '#6a4c93', '#1982c4', '#8ac926', '#ff595e', '#6d597a', '#b56576',
  '#355070', '#43aa8b', '#f8961e', '#577590', '#90be6d', '#f94144', '#4d908e', '#c08497',
]
export const pickColor = (i: number) => PALETTE[i % PALETTE.length]

const DEFAULT_WEIGHTS: Weights = { classGap: 300, teacherGap: 10, classLateStart: 40, spread: 3 }

export function emptyProject(): Project {
  const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma']
  const times = ['08:30-09:10', '09:20-10:00', '10:10-10:50', '11:00-11:40', '11:50-12:30', '13:20-14:00', '14:10-14:50', '15:00-15:40']
  return {
    version: 1,
    school: { name: '', year: '', principal: '', vice: '' },
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
    strictClasses: true,
    useRooms: false,
    schoolType: '',
    duty: { places: [], role: {}, days: {}, specials: [], month: '', assign: {}, locked: {}, manual: {}, consecutive: {}, prefer: {}, fixed: {}, hoursWeight: 0 },
  }
}

const LANG = ['İngilizce', 'Almanca', 'Fransızca', 'Arapça', '1. Yabancı Dil']

export const MANDATORY_SUBJECTS: Record<Exclude<SchoolType, ''>, [string, string, string[]][]> = {
  ilkokul: [
    ['Türkçe', 'TÜR', []],
    ['Matematik', 'MAT', []],
    ['Hayat Bilgisi', 'HAY', []],
    ['Fen Bilimleri', 'FEN', []],
    ['Sosyal Bilgiler', 'SOS', []],
    ['Yabancı Dil', 'YDL', LANG],
    ['Din Kültürü ve Ahlak Bilgisi', 'DİN', ['Din Kültürü']],
    ['Görsel Sanatlar', 'GÖR', ['Resim']],
    ['Müzik', 'MÜZ', []],
    ['Beden Eğitimi ve Oyun', 'BEO', []],
    ['Beden Eğitimi ve Spor', 'BES', []],
    ['Trafik Güvenliği', 'TRF', []],
    ['İnsan Hakları, Yurttaşlık ve Demokrasi', 'İHY', ['İnsan Hakları Yurttaşlık ve Demokrasi']],
  ],
  ortaokul: [
    ['Türkçe', 'TÜR', []],
    ['Matematik', 'MAT', []],
    ['Fen Bilimleri', 'FEN', []],
    ['Sosyal Bilgiler', 'SOS', []],
    ['T.C. İnkılap Tarihi ve Atatürkçülük', 'İNK', ['İnkılap Tarihi', 'İnkılap Tarihi ve Atatürkçülük']],
    ['Yabancı Dil', 'YDL', LANG],
    ['Din Kültürü ve Ahlak Bilgisi', 'DİN', ['Din Kültürü']],
    ['Görsel Sanatlar', 'GÖR', ['Resim']],
    ['Müzik', 'MÜZ', []],
    ['Beden Eğitimi ve Spor', 'BED', ['Beden Eğitimi']],
    ['Bilişim Teknolojileri ve Yazılım', 'BİL', ['Bilişim Teknolojileri']],
    ['Teknoloji ve Tasarım', 'TTS', []],
  ],
  lise: [
    ['Türk Dili ve Edebiyatı', 'TDE', ['Edebiyat', 'Türk Edebiyatı']],
    ['Matematik', 'MAT', []],
    ['Tarih', 'TAR', []],
    ['T.C. İnkılap Tarihi ve Atatürkçülük', 'İNK', ['İnkılap Tarihi', 'İnkılap Tarihi ve Atatürkçülük']],
    ['Coğrafya', 'COĞ', []],
    ['Fizik', 'FİZ', []],
    ['Kimya', 'KİM', []],
    ['Biyoloji', 'BİY', []],
    ['Din Kültürü ve Ahlak Bilgisi', 'DİN', ['Din Kültürü']],
    ['Yabancı Dil', 'YDL', LANG],
    ['Felsefe', 'FEL', []],
    ['Beden Eğitimi ve Spor', 'BED', ['Beden Eğitimi']],
    ['Görsel Sanatlar', 'GÖR', ['Resim']],
    ['Müzik', 'MÜZ', []],
    ['Sağlık Bilgisi ve Trafik Kültürü', 'SBT', []],
  ],
}

const subjectKey = (name: string) => name.toLocaleLowerCase('tr').replace(/[^\p{L}\p{N}]/gu, '')

export function addMandatorySubjects(p: Project, type: SchoolType): number {
  const list = type ? MANDATORY_SUBJECTS[type] : []
  const have = new Set(p.subjects.map(s => subjectKey(s.name)))
  const missing = list.filter(([name, , alt]) => ![name, ...alt].some(n => have.has(subjectKey(n))))
  for (const [name, short] of missing)
    p.subjects.push({ id: newId('s'), name: upperName(name), short, color: pickColor(p.subjects.length), avail: fullGrid(p.days.length, p.periods.length) })
  return missing.length
}

export const upperName = (s: string) => s.toLocaleUpperCase('tr')

export const lessonHours = (l: Lesson) => l.split.reduce((a, b) => a + b, 0)

export function parseSplit(s: string): number[] | null {
  const parts = s.split(/[+,\s]+/).filter(Boolean).map(Number)
  if (!parts.length || parts.some(n => !Number.isInteger(n) || n < 1 || n > 12)) return null
  return parts
}

export const splitLabel = (split: number[]) => split.join('+')

export function defaultSplit(hours: number): number[] {
  if (hours <= 2) return [hours]
  const out: number[] = []
  let h = hours
  while (h >= 2) { out.push(2); h -= 2 }
  if (h) out.push(1)
  return out
}

function tint(hex: string, alpha: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 'transparent'
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

export const colorVars = (hex: string | undefined, alpha = 0.16) =>
  (hex ? { '--c': hex, '--cbg': tint(hex, alpha) } : {}) as Record<string, string>
