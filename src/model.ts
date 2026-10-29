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
  maxGapsPerDay: number
  subjectIds?: string[]
}

export interface Room extends Entity {
  capacity: number
}

export interface Student {
  id: string
  no: string
  name: string
}

interface ClassGroup {
  id: string
  name: string
  students?: string[]
  subjectId?: string
  split?: number[]
  parent?: string
  teacherId?: string
}

export interface SchoolClass extends Entity {
  groups: ClassGroup[]
  students?: Student[]
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
  doubleShift: boolean
  duty: Duty
}

export interface DutyPlace {
  id: string
  name: string
  count: number
}

export type DutyRole = 'duty' | 'admin' | 'dutyAdmin' | 'preschool' | 'none'

export type DutyShift = 'morning' | 'afternoon'

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
  shift: Record<string, DutyShift>
  log: string[]
  hoursWeight: number
  admin: Record<string, string>
  hideAdmin: boolean
}

export type SchoolType = '' | 'ilkokul' | 'ortaokul' | 'lise' | 'guzelsanatlar'
export const SCHOOL_TYPES: [SchoolType, string][] = [['ilkokul', 'İlkokul'], ['ortaokul', 'Ortaokul'], ['lise', 'Lise'], ['guzelsanatlar', 'Güzel Sanatlar Lisesi']]

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
    doubleShift: false,
    duty: { places: [], role: {}, days: {}, specials: [], month: '', assign: {}, locked: {}, manual: {}, consecutive: {}, prefer: {}, fixed: {}, shift: {}, log: [], hoursWeight: 0, admin: {}, hideAdmin: false },
  }
}

const LANG = ['İngilizce', 'Almanca', 'Fransızca', 'Arapça', '1. Yabancı Dil']

const LISE: [string, string, string[]][] = [
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
]

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
  lise: LISE,
  guzelsanatlar: [
    ['Türk Dili ve Edebiyatı', 'TDE', ['Edebiyat', 'Türk Edebiyatı']],
    ['Tarih', 'TAR', []],
    ['T.C. İnkılap Tarihi ve Atatürkçülük', 'İNK', ['İnkılap Tarihi', 'İnkılap Tarihi ve Atatürkçülük']],
    ['Coğrafya', 'COĞ', []],
    ['Matematik', 'MAT', []],
    ['Fizik', 'FİZ', []],
    ['Kimya', 'KİM', []],
    ['Biyoloji', 'BİY', []],
    ['Yabancı Dil (İngilizce)', 'İNG', ['İngilizce', 'Yabancı Dil']],
    ['İkinci Yabancı Dil (Almanca)', 'ALM', ['Almanca']],
    ['İkinci Yabancı Dil (Fransızca)', 'FRA', ['Fransızca']],
    ['Din Kültürü ve Ahlak Bilgisi', 'DİN', ['Din Kültürü']],
    ['Felsefe', 'FEL', []],
    ['Beden Eğitimi ve Spor', 'BED', ['Beden Eğitimi']],
    ['Görsel Sanatlar', 'GÖR', ['Resim']],
    ['Müzik', 'MÜZ', []],
    ['Sağlık Bilgisi ve Trafik Kültürü', 'SBT', []],
    ['Desen', 'DES', []],
    ['İki Boyutlu Sanat Tasarım', 'İBT', []],
    ['Üç Boyutlu Sanat Tasarım', 'ÜBT', []],
    ['Sanat Tarihi', 'STA', []],
    ['Müze Eğitimi', 'MÜE', []],
    ['Grafik Tasarım', 'GRT', ['Grafik']],
    ['Heykel', 'HEY', []],
    ['Estetik', 'EST', []],
    ['Çağdaş Dünya Sanatı Tarihi', 'ÇDS', []],
    ['Türk Sanat Tarihi', 'TST', []],
    ['Batı Müziği Teori ve Uygulaması', 'BMT', []],
    ['Müziksel İşitme, Okuma ve Yazma', 'MİO', ['Solfej', 'Dikte']],
    ['Piyano', 'PİY', ['Piyano Eğitimi']],
    ['Çalgı Eğitimi (Keman)', 'KEM', ['Keman']],
    ['Çalgı Eğitimi (Viyola)', 'VİY', ['Viyola']],
    ['Çalgı Eğitimi (Çello)', 'ÇEL', ['Çello']],
    ['Çalgı Eğitimi (Kontrbas)', 'KBS', ['Kontrbas']],
    ['Çalgı Eğitimi (Yan Flüt)', 'FLT', ['Yan Flüt']],
    ['Çalgı Eğitimi (Klarnet)', 'KLR', ['Klarnet']],
    ['Çalgı Eğitimi (Bağlama)', 'BĞL', ['Bağlama']],
    ['Çalgı Eğitimi (Gitar)', 'GİT', ['Gitar']],
    ['Çalgı Toplulukları', 'ÇTO', []],
    ['Orkestra', 'ORK', []],
    ['Koro', 'KOR', []],
    ['Türk Halk Müziği Teori ve Uygulaması', 'THU', ['THM Teori ve Uygulaması']],
    ['Türk Sanat Müziği Teori ve Uygulaması', 'TSU', ['TSM Teori ve Uygulaması']],
    ['Müzik Tarihi', 'MTA', []],
    ['Bilişim Destekli Müzik', 'BDM', []],
    ['THM Müziksel İşitme, Okuma ve Yazma', 'THİ', []],
    ['Yöresel Çalgı Eğitimi', 'YÇE', []],
    ['THM Koro', 'THK', []],
    ['THM Çalgı Topluluğu', 'THÇ', []],
    ['Türk Müzik Tarihi', 'TMT', []],
    ['Halk Oyunları', 'HOY', []],
    ['TSM Müziksel İşitme, Okuma ve Yazma', 'TSİ', []],
    ['TSM Çalgı Eğitimi (Kanun)', 'KAN', []],
    ['TSM Çalgı Eğitimi (Ud)', 'UD', []],
    ['TSM Çalgı Eğitimi (Ney)', 'NEY', []],
    ['TSM Çalgı Eğitimi (Tanbur)', 'TNB', []],
    ['TSM Çalgı Eğitimi (Keman)', 'TKM', []],
    ['TSM Koro', 'TSK', []],
    ['TSM Çalgı Topluluğu', 'TSÇ', []],
    ['Oyunculuk', 'OYN', []],
    ['Diksiyon ve Doğaçlama', 'DDO', []],
    ['Hareket ve Mimik', 'HAM', []],
    ['Tiyatro Tarihi ve Dramaturgi', 'TTD', []],
    ['Sahne Uygulaması', 'SAH', []],
    ['Ses ve Nefes Eğitimi', 'SNE', []],
    ['İleri Matematik', 'İMA', []],
    ['İleri Fen Bilimleri', 'İFB', []],
    ['Diksiyon ve Hitabet', 'DHİ', []],
    ['Sanat Metinleri İnceleme', 'SMİ', []],
    ['Dijital Sanat', 'DİJ', []],
    ['Fotoğrafçılık', 'FOT', []],
    ['Sosyoloji', 'SOS', []],
    ['Psikoloji', 'PSİ', []],
    ['Osmanlı Türkçesi', 'OSM', []],
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

export const fileName = (p: Project, fallback = 'ders_programi') => p.school.name.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || fallback

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

export function classCells(c: SchoolClass): { key: string; groups: string[] }[] {
  const withStudents = c.groups.filter(g => g.students?.length)
  if (!withStudents.length) return c.groups.length ? c.groups.map(g => ({ key: g.id, groups: [g.id] })) : [{ key: '', groups: [] }]
  const cells = new Map<string, string[]>()
  for (const g of c.groups) if (!g.students?.length) cells.set(g.id, [g.id])
  for (const s of c.students ?? []) {
    const gs = withStudents.filter(g => g.students!.includes(s.id)).map(g => g.id)
    cells.set(gs.join('+') || '-', gs)
  }
  return [...cells].map(([key, groups]) => ({ key, groups }))
}

export const groupsOverlap = (c: SchoolClass | undefined, a: string | null, b: string | null) =>
  a === null || b === null || a === b || !c || classCells(c).some(x => x.groups.includes(a) && x.groups.includes(b))

const classKey = (s: string) => s.toLocaleUpperCase('tr').replace(/SINIFI?|ŞUBESİ?/g, '').replace(/[^\p{L}\p{N}]/gu, '')
const HEADER = /^(S\.?\s*NO|SIRA( NO)?|NO|NUMARA(SI)?|ÖĞRENCİ( NO| NUMARASI| ADI)?|OKUL NO|ADI?|SOYADI?|ADI? SOYADI?|ADI VE SOYADI|SINIFI?|ŞUBESİ?|CİNSİYETİ?)$/

export function parseStudents(text: string, classes: SchoolClass[]) {
  const byKey = new Map(classes.flatMap(c => [[classKey(c.name), c.id], [classKey(c.short), c.id]] as [string, string][]))
  const out: { classId: string | null; className: string; no: string; name: string }[] = []
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(line.includes('\t') ? '\t' : /[;,](?=(?:[^"]*"[^"]*")*[^"]*$)/).map(x => x.trim().replace(/^"([\s\S]*)"$/, '$1').replace(/""/g, '"').trim()).filter(Boolean)
    if (!cells.length || cells.some(x => HEADER.test(x.toLocaleUpperCase('tr')))) continue
    let classId: string | null = null, className = '', no = ''
    const rest: string[] = []
    for (const x of cells) {
      const k = classKey(x)
      if (!className && (byKey.has(k) || /^\d{1,2}[A-ZÇĞİÖŞÜ]{1,2}$/.test(k))) { className = x; classId = byKey.get(k) ?? null }
      else if (/^\d+\.?$/.test(x)) no = x.replace('.', '')
      else rest.push(x)
    }
    const name = upperName(rest.join(' ').replace(/\s+/g, ' '))
    if (name) out.push({ classId, className, no, name })
  }
  return out
}

export function importStudents(p: Project, text: string, intoClassId?: string) {
  let added = 0, skipped = 0
  for (const r of parseStudents(text, p.classes)) {
    let c = r.classId ? p.classes.find(x => x.id === r.classId) : r.className ? p.classes.find(x => x.name === r.className) : p.classes.find(x => x.id === intoClassId)
    if (!c && r.className) {
      p.classes.push({ id: newId('c'), name: r.className, short: r.className.slice(0, 4).toLocaleUpperCase('tr'), color: pickColor(p.classes.length), avail: fullGrid(p.days.length, p.periods.length), groups: [] })
      c = p.classes[p.classes.length - 1]
    }
    if (!c) { skipped++; continue }
    const list = (c.students ??= [])
    if (list.some(s => (r.no ? s.no === r.no : s.name === r.name))) continue
    list.push({ id: newId('st'), no: r.no, name: r.name })
    added++
  }
  return { added, skipped }
}

export function syncGroupLessons(p: Project, classId: string, groupId: string) {
  const c = p.classes.find(x => x.id === classId)
  const g = c?.groups.find(x => x.id === groupId)
  if (!c || !g) return
  const kids = c.groups.filter(k => k.parent === g.id)
  const empty = new Set(kids.filter(k => !k.students?.length).map(k => k.id))
  c.groups = c.groups.filter(k => !empty.has(k.id))
  p.lessons = p.lessons.filter(l => !l.classes.some(r => r.classId === classId && r.groupId && empty.has(r.groupId)))
  const live = kids.filter(k => !empty.has(k.id))
  g.students = live.flatMap(k => k.students!)
  for (const k of live) {
    let l = p.lessons.find(x => x.classes.length === 1 && x.classes[0].classId === classId && x.classes[0].groupId === k.id)
    if (!g.subjectId) { if (l) p.lessons = p.lessons.filter(x => x !== l); continue }
    if (!l) p.lessons.push(l = { id: newId('l'), subjectId: '', teacherIds: [], roomIds: [], classes: [{ classId, groupId: k.id }], split: [], sameDayOk: false, link: '' })
    Object.assign(l, { subjectId: g.subjectId, teacherIds: [k.teacherId!], split: [...(g.split ?? [2])], link: live.length > 1 ? `${c.name} ${g.name}` : '' })
  }
}

export const isGroupLesson = (p: Project, l: Lesson) =>
  l.classes.length === 1 && !!p.classes.find(c => c.id === l.classes[0].classId)?.groups.find(g => g.id === l.classes[0].groupId)?.parent

export function syncClassGroups(p: Project, classId: string) {
  const c = p.classes.find(x => x.id === classId)
  for (const g of c?.groups.filter(x => !x.parent && c.groups.some(k => k.parent === x.id)) ?? []) syncGroupLessons(p, classId, g.id)
}

export function removeStudent(p: Project, classId: string, studentId: string) {
  const c = p.classes.find(x => x.id === classId)
  if (!c) return
  c.students = c.students?.filter(s => s.id !== studentId)
  for (const g of c.groups) if (g.students) g.students = g.students.filter(s => s !== studentId)
  syncClassGroups(p, classId)
}

export function setStudentTeacher(p: Project, classId: string, groupId: string, studentId: string, teacherId: string) {
  const c = p.classes.find(x => x.id === classId)
  const g = c?.groups.find(x => x.id === groupId)
  const t = p.teachers.find(x => x.id === teacherId)
  if (!c || !g) return
  for (const k of c.groups) if (k.parent === g.id && k.students) k.students = k.students.filter(s => s !== studentId)
  if (t) {
    let k = c.groups.find(x => x.parent === g.id && x.teacherId === t.id)
    if (!k) c.groups.push(k = { id: newId('g'), name: `${g.name} · ${t.short || t.name}`, parent: g.id, teacherId: t.id, students: [] })
    k.students!.push(studentId)
  }
  syncGroupLessons(p, classId, groupId)
}

export const teachersOf = (p: Project, subjectId: string) => p.teachers.filter(t => t.subjectIds?.includes(subjectId))

export function fillTeachers(p: Project) {
  let n = 0
  for (const l of p.lessons) {
    const ts = l.teacherIds.length ? [] : teachersOf(p, l.subjectId)
    if (ts.length === 1) { l.teacherIds = [ts[0].id]; n++ }
  }
  return n
}
