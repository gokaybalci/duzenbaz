import { defaultSplit, emptyProject, fullGrid, newId, pickColor, type ClassRef, type Lesson, type Project, type Teacher } from './model'

const CORE: [string, string, number, string?][] = [
  ['Matematik', 'MAT', 5],
  ['Türkçe', 'TÜR', 6],
  ['Fen Bilimleri', 'FEN', 4, 'Fen Laboratuvarı'],
  ['Sosyal Bilgiler', 'SOS', 3],
  ['İngilizce', 'İNG', 4],
  ['Din Kültürü ve Ahlak Bilgisi', 'DİN', 2],
  ['Beden Eğitimi ve Spor', 'BED', 2, 'Spor Salonu'],
  ['Müzik', 'MÜZ', 1],
  ['Görsel Sanatlar', 'GÖR', 1],
  ['Bilişim Teknolojileri ve Yazılım', 'BİL', 2, 'BT Sınıfı'],
  ['Teknoloji ve Tasarım', 'TTS', 2],
  ['Rehberlik ve Yönlendirme', 'REH', 1],
]
const SAT = CORE.length, OKU = CORE.length + 1
const ELECTIVE_HOURS = 2
const MAX_LOAD = 26
const IDEAL_LOAD = 22

interface DemoOptions { classes: number; teachers?: number; withRooms?: boolean }

const gradesOf = (classes: number) => [5, 6, 7, 8].map((grade, i) => ({ grade, count: Math.floor(classes / 4) + (i < classes % 4 ? 1 : 0) }))

function demand(classes: number) {
  const g8 = gradesOf(classes)[3].count
  const hours = [...CORE.map(([, , h]) => h * classes), ELECTIVE_HOURS * g8, ELECTIVE_HOURS * classes]
  const takers = [...CORE.map(() => classes), g8, classes]
  return { hours, takers }
}

export function demoTeacherRange(classes: number) {
  const { hours, takers } = demand(classes)
  return {
    min: hours.reduce((a, h) => a + (h ? Math.ceil(h / MAX_LOAD) : 0), 0),
    suggested: hours.reduce((a, h) => a + (h ? Math.ceil(h / IDEAL_LOAD) : 0), 0),
    max: takers.reduce((a, n) => a + n, 0),
  }
}

export function demoProject({ classes, teachers, withRooms = false }: DemoOptions = { classes: 12 }): Project {
  const p = emptyProject()
  p.schoolType = 'ortaokul'
  p.school = { name: 'Örnek Ortaokulu', year: '2026-2027', principal: 'Hasan Yıldız', vice: 'Ayten Kaya' }
  p.periods = p.periods.slice(0, 7)
  const D = p.days.length, P = p.periods.length
  p.avail = fullGrid(D, P)
  p.useRooms = withRooms

  const subjects: [string, string][] = [...CORE.map(([n, s]): [string, string] => [n, s]), ['Seçmeli Satranç', 'SAT'], ['Seçmeli Okuma Becerileri', 'OKU']]
  p.subjects = subjects.map(([name, short], i) => ({ id: 's' + i, name, short, color: pickColor(i), avail: fullGrid(D, P) }))

  const grades = gradesOf(classes)
  const sectionsMax = Math.max(...grades.map(g => g.count))
  p.rooms = withRooms
    ? [['Fen Laboratuvarı', 'LAB'], ['Spor Salonu', 'SPOR'], ['BT Sınıfı', 'BT']].map(([name, short], i) =>
      ({ id: 'r' + i, name, short, color: pickColor(i + 5), avail: fullGrid(D, P), capacity: Math.ceil(sectionsMax / 3) }))
    : []
  p.classes = grades.flatMap(({ grade, count }) => Array.from({ length: count }, (_, i) => {
    const sec = String.fromCharCode(65 + i)
    return {
      id: `c${grade}${sec}`, name: `${grade}-${sec}`, short: `${grade}${sec}`, color: pickColor(grade), avail: fullGrid(D, P),
      groups: grade === 8 ? [{ id: 'g1', name: '1. Grup' }, { id: 'g2', name: '2. Grup' }] : [],
    }
  }))

  const takersOf = (si: number): ClassRef[] =>
    si === SAT ? p.classes.filter(c => c.groups.length).map(c => ({ classId: c.id, groupId: 'g1' }))
      : si === OKU ? p.classes.map(c => ({ classId: c.id, groupId: c.groups.length ? 'g2' : null }))
        : p.classes.map(c => ({ classId: c.id, groupId: null }))

  const { hours } = demand(classes)
  const range = demoTeacherRange(classes)
  const total = Math.min(range.max, Math.max(range.min, teachers ?? range.suggested))
  const perSubject = hours.map(h => (h ? Math.ceil(h / MAX_LOAD) : 0))
  for (let n = perSubject.reduce((a, b) => a + b, 0); n < total; n++) {
    let best = -1
    perSubject.forEach((k, i) => { if (k && k < takersOf(i).length && (best < 0 || hours[i] / k > hours[best] / perSubject[best])) best = i })
    if (best < 0) break
    perSubject[best]++
  }

  const firstNames = ['Ayşe', 'Mehmet', 'Elif', 'Mustafa', 'Zeynep', 'Emre', 'Fatma', 'Burak', 'Hatice', 'Hakan', 'Gül', 'Murat', 'Esra', 'Osman', 'Derya', 'Kerem', 'Sevgi', 'Tolga', 'Merve', 'Ahmet', 'Pınar', 'Serkan', 'Emine', 'Onur', 'Büşra', 'Barış', 'Ceren', 'Yusuf']
  const lastNames = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Öztürk', 'Aydın', 'Arslan', 'Doğan', 'Koç']
  const shorts = new Set<string>()
  const mkTeacher = (): Teacher => {
    const i = p.teachers.length
    const first = firstNames[i % firstNames.length], last = lastNames[(i + Math.floor(i / firstNames.length)) % lastNames.length]
    let short = `${first[0]}. ${last}`
    if (shorts.has(short)) short = `${first.slice(0, 2)}. ${last}`
    shorts.add(short)
    const t = { id: 't' + i, name: `${first} ${last}`, short, color: pickColor(i), avail: fullGrid(D, P), maxPerDay: 0, maxDays: 0, maxGapsPerDay: -1 }
    p.teachers.push(t)
    return t
  }

  const lessons: Lesson[] = []
  const firstOf: Teacher[] = []
  perSubject.forEach((k, si) => {
    if (!k) return
    const takers = takersOf(si)
    const ts = Array.from({ length: k }, mkTeacher)
    firstOf[si] = ts[0]
    const room = si < CORE.length ? CORE[si][3] : undefined
    const roomId = withRooms && room ? p.rooms.find(r => r.name === room)?.id : undefined
    const h = si < CORE.length ? CORE[si][2] : ELECTIVE_HOURS
    takers.forEach((ref, ci) => {
      lessons.push({
        id: newId('l'), subjectId: 's' + si, teacherIds: [ts[Math.floor((ci * k) / takers.length)].id], roomIds: roomId ? [roomId] : [],
        classes: [ref], split: defaultSplit(h), sameDayOk: false,
        link: (si === SAT || si === OKU) && ref.groupId ? 'seçmeli-' + ref.classId : '',
      })
    })
  })
  p.lessons = lessons

  const load = (t: Teacher) => lessons.filter(l => l.teacherIds.includes(t.id)).reduce((a, l) => a + l.split.reduce((x, y) => x + y, 0), 0)
  const onlyDays = (days: number[]) => Array.from({ length: D * P }, (_, i) => (days.includes(Math.floor(i / P)) ? '1' : '0')).join('')
  const [math, mus, art] = [firstOf[0], firstOf[7], firstOf[8]]
  if (mus && load(mus) <= 10) mus.avail = onlyDays([0, 1])
  if (art && load(art) <= 10) art.avail = onlyDays([3, 4])
  if (math && load(math) <= 24) { math.avail = math.avail.split('').map((c, i) => (i % P === 0 ? '0' : c)).join(''); math.maxGapsPerDay = 1 }
  return p
}
