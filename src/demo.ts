// Örnek okul: uygulamayı denemek ve dağıtım testleri için gerçekçi bir ortaokul.

import { defaultSplit, emptyProject, fullGrid, newId, pickColor, type Lesson, type Project, type Teacher } from './model'

export function demoProject(sections = ['A', 'B', 'C'], withRooms = false): Project {
  const p = emptyProject()
  p.school = { name: 'Örnek Ortaokulu', year: '2026-2027', principal: 'Hasan Yıldız' }
  p.periods = p.periods.slice(0, 7)
  const D = p.days.length, P = p.periods.length
  p.avail = fullGrid(D, P)
  p.useRooms = withRooms

  const curriculum: [string, string, number, string?][] = [
    ['Matematik', 'MAT', 5],
    ['Türkçe', 'TÜR', 5],
    ['Fen Bilimleri', 'FEN', 4, 'Fen Laboratuvarı'],
    ['Sosyal Bilgiler', 'SOS', 3],
    ['İngilizce', 'İNG', 4],
    ['Din Kültürü ve Ahlak Bilgisi', 'DİN', 2],
    ['Beden Eğitimi ve Spor', 'BED', 2, 'Spor Salonu'],
    ['Müzik', 'MÜZ', 1],
    ['Görsel Sanatlar', 'GÖR', 1],
    ['Bilişim Teknolojileri', 'BİL', 2, 'BT Sınıfı'],
    ['Teknoloji ve Tasarım', 'TTS', 2],
    ['Rehberlik ve Yönlendirme', 'REH', 1],
    ['Seçmeli Satranç', 'SAT', 2],
    ['Seçmeli Okuma Becerileri', 'OKU', 2],
  ]
  p.subjects = curriculum.map(([name, short], i) => ({ id: 's' + i, name, short, color: pickColor(i), avail: fullGrid(D, P) }))
  p.rooms = [['Fen Laboratuvarı', 'LAB'], ['Spor Salonu', 'SPOR'], ['BT Sınıfı', 'BT']].map(([name, short], i) => ({ id: 'r' + i, name, short, color: pickColor(i + 5), avail: fullGrid(D, P), capacity: 1 }))
  if (!withRooms) p.rooms = []
  // Büyük okullarda her özel derslikten birden fazla olur.
  const scale = Math.ceil(sections.length / 3)
  for (const r of p.rooms) r.capacity = scale

  const grades = [5, 6, 7, 8]
  p.classes = grades.flatMap(g => sections.map(s => ({ id: `c${g}${s}`, name: `${g}-${s}`, short: `${g}${s}`, color: pickColor(g), avail: fullGrid(D, P), groups: [] })))

  const firstNames = ['Ayşe', 'Mehmet', 'Elif', 'Mustafa', 'Zeynep', 'Emre', 'Fatma', 'Burak', 'Hatice', 'Hakan', 'Gül', 'Murat', 'Esra', 'Osman', 'Derya', 'Kerem', 'Sevgi', 'Tolga', 'Merve', 'Ahmet', 'Pınar', 'Serkan', 'Emine', 'Onur', 'Büşra', 'Barış', 'Ceren', 'Yusuf']
  const lastNames = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Öztürk', 'Aydın', 'Arslan', 'Doğan', 'Koç']
  let ti = 0
  const mkTeacher = (): Teacher => {
    const n = `${firstNames[ti % firstNames.length]} ${lastNames[(ti * 7) % lastNames.length]}`
    ti++
    return { id: 't' + ti, name: n, short: `${n[0]}. ${n.split(' ')[1]}`, color: pickColor(ti), avail: fullGrid(D, P), maxPerDay: 0, maxDays: 0, maxGapsPerDay: -1 }
  }
  // Yalnızca verilen günlerde açık koşul
  const onlyDays = (days: number[]) => Array.from({ length: D * P }, (_, i) => (days.includes(Math.floor(i / P)) ? '1' : '0')).join('')

  const lessons: Lesson[] = []
  curriculum.forEach(([, , hours, room], si) => {
    if (si >= 12) return // seçmeli dersler aşağıda
    // Her öğretmene en fazla ~22 saat düşecek kadar öğretmen
    const total = hours * p.classes.length
    const nT = Math.max(1, Math.ceil(total / 22))
    const ts = Array.from({ length: nT }, mkTeacher)
    p.teachers.push(...ts)
    p.classes.forEach((c, ci) => {
      const t = ts[Math.floor((ci * nT) / p.classes.length)]
      lessons.push({
        // Fen laboratuvarını yalnızca 7. ve 8. sınıflar kullanır.
        id: newId('l'), subjectId: 's' + si, teacherIds: [t.id], roomIds: withRooms && room && (room !== 'Fen Laboratuvarı' || ci >= p.classes.length / 2) ? [p.rooms.find(r => r.name === room)!.id] : [],
        classes: [{ classId: c.id, groupId: null }], split: defaultSplit(hours), sameDayOk: false, link: '',
      })
    })
  })
  // Yarı zamanlı öğretmenler: Müzik Pzt/Salı, Görsel Sanatlar Perş/Cuma gelir.
  const mus = p.teachers.find(t => lessons.some(l => l.subjectId === 's7' && l.teacherIds[0] === t.id))!
  mus.avail = onlyDays([0, 1])
  const art = p.teachers.find(t => lessons.some(l => l.subjectId === 's8' && l.teacherIds[0] === t.id))!
  art.avail = onlyDays([3, 4])
  // İlk saatlere giremeyen, günde en fazla 1 pencere isteyen öğretmen.
  p.teachers[0].avail = p.teachers[0].avail.split('').map((c, i) => (i % P === 0 ? '0' : c)).join('')
  p.teachers[0].maxGapsPerDay = 1

  // 8. sınıflar iki gruba ayrılır; seçmeli dersler aynı saatte yapılır.
  for (const c of p.classes.filter(c => c.name.startsWith('8'))) {
    c.groups = [{ id: 'g1', name: '1. Grup' }, { id: 'g2', name: '2. Grup' }]
  }
  const e1 = mkTeacher(), e2 = mkTeacher()
  e1.maxDays = 3
  p.teachers.push(e1, e2)
  for (const c of p.classes.filter(c => c.name.startsWith('8'))) {
    const link = 'seçmeli-' + c.short
    lessons.push({ id: newId('l'), subjectId: 's12', teacherIds: [e1.id], roomIds: [], classes: [{ classId: c.id, groupId: 'g1' }], split: [2], sameDayOk: false, link })
    lessons.push({ id: newId('l'), subjectId: 's13', teacherIds: [e2.id], roomIds: [], classes: [{ classId: c.id, groupId: 'g2' }], split: [2], sameDayOk: false, link })
  }
  p.lessons = lessons
  return p
}
