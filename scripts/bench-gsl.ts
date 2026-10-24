import { defaultSplit, emptyProject, fullGrid, newId, setStudentTeacher, type Project, type SchoolClass, type Teacher } from '../src/model'
import { solve, type Progress } from '../src/solver/engine'
const partial = process.argv[7] === 'partial'

const [ms, classes, students] = [Number(process.argv[2] ?? 5000), Number(process.argv[3] ?? 8), Number(process.argv[4] ?? 24)]
const CORE: [string, number][] = [['TDE', 6], ['MAT', 6], ['TAR', 4], ['COĞ', 2], ['FİZ', 2], ['KİM', 2], ['BİY', 2], ['İNG', 4], ['DİN', 2], ['FEL', 2], ['BED', 2]]
const PIANO = 4, INSTR = 6, CHOIR = 5

function school(groups: boolean): Project {
  const p = emptyProject()
  const grid = fullGrid(p.days.length, p.periods.length)
  const ent = (name: string) => ({ id: newId('x'), name, short: name, color: '#888', avail: grid })
  const P = p.periods.length
  const teacher = (name: string, dayOff = -1): Teacher => {
    const t = { ...ent(name), avail: grid.split('').map((x, i) => (Math.floor(i / P) === dayOff ? '0' : x)).join(''), maxPerDay: 0, maxDays: 0, maxGapsPerDay: -1 }
    p.teachers.push(t)
    return t
  }
  const subj = (name: string) => { const s = ent(name); p.subjects.push(s); return s }
  const core = CORE.map(([n, h]) => ({ s: subj(n), h, ts: Array.from({ length: Math.ceil((classes * h) / 26) }, (_, i) => teacher(`${n} ${i + 1}`, (p.teachers.length + i) % 5)) }))
  const piy = subj('PİYANO'), cal = subj('ÇALGI'), kor = subj('KORO'), sol = subj('SOLFEJ')
  const sets = Math.ceil(classes / 10)
  const piano = Array.from({ length: PIANO * sets }, (_, i) => teacher(`PİYANO ${i + 1}`))
  const instr = Array.from({ length: INSTR * sets }, (_, i) => teacher(`ÇALGI ${i + 1}`))
  const choir = Array.from({ length: CHOIR * sets }, (_, i) => teacher(`KORO ${i + 1}`))
  const solfej = Array.from({ length: 3 * sets }, (_, i) => teacher(`SOLFEJ ${i + 1}`))
  for (let c = 0; c < classes; c++) {
    const k: SchoolClass = { ...ent(`${9 + (c % 4)}-${String.fromCharCode(65 + Math.floor(c / 4))}`), groups: [], students: [] }
    p.classes.push(k)
    for (const { s, h, ts } of core)
      p.lessons.push({ id: newId('l'), subjectId: s.id, teacherIds: [ts[c % ts.length].id], roomIds: [], classes: [{ classId: k.id, groupId: null }], split: defaultSplit(h), sameDayOk: false, link: '' })
    if (!groups) {
      for (const [s, ts, n] of [[piy, piano, PIANO], [cal, instr, INSTR], [kor, choir, CHOIR]] as const)
        p.lessons.push({ id: newId('l'), subjectId: s.id, teacherIds: [ts[c % n + Math.floor(c / 10) * n].id], roomIds: [], classes: [{ classId: k.id, groupId: null }], split: [2], sameDayOk: false, link: '' })
      continue
    }
    k.students = Array.from({ length: students }, (_, i) => ({ id: `${k.id}s${i}`, no: String(i + 1), name: `Ö${i + 1}` }))
    k.groups.push({ id: 'piy', name: 'Piyano', subjectId: piy.id, split: [2] }, { id: 'cal', name: 'Çalgı', subjectId: cal.id, split: [2] }, { id: 'kor', name: 'Koro', subjectId: kor.id, split: [2] }, { id: 'sol', name: 'Solfej', subjectId: sol.id, split: [2] })
    k.students.forEach((st, i) => {
      setStudentTeacher(p, k.id, 'piy', st.id, piano[i % PIANO + Math.floor(c / 10) * PIANO].id)
      setStudentTeacher(p, k.id, 'cal', st.id, instr[(i * 7 + c) % INSTR + Math.floor(c / 10) * INSTR].id)
      if (partial && i % 3) setStudentTeacher(p, k.id, 'sol', st.id, solfej[(i + c) % 3 + Math.floor(c / 10) * 3].id)
      else setStudentTeacher(p, k.id, 'kor', st.id, choir[(i * 3 + c) % CHOIR + Math.floor(c / 10) * CHOIR].id)
    })
  }
  return p
}

for (const groups of process.argv[6] === "groups" ? [true] : [false, true]) {
  const p = school(groups)
  const cells = groups ? new Set(p.classes[0].students!.map(s => p.classes[0].groups.filter(g => g.parent && g.students!.includes(s.id)).map(g => g.id).join())).size : 1
  console.log(`\n${groups ? 'groups' : 'plain '}: classes ${p.classes.length}, teachers ${p.teachers.length}, lessons ${p.lessons.length}, timetables per class ${cells}`)
  for (const seed of (process.argv[5] ?? "1,2,3").split(",").map(Number)) {
    let first = -1
    const t = performance.now()
    const r = solve(p, { timeLimitMs: ms, seed, keepPlacements: false }, (pr: Progress) => { if (first < 0 && pr.hard === 0) first = pr.elapsed })
    const sec = (performance.now() - t) / 1000
    console.log(`  seed ${seed}: hard=${r.hard} teacher gaps=${r.stats.teacherGaps} class gaps=${r.stats.classGaps} placed ${r.stats.placedCards}/${r.stats.totalCards} | first conflict-free at ${first < 0 ? '–' : (first / 1000).toFixed(2) + 's'}, ${Math.round(r.iterations / sec / 1000)}k steps/s`)
  }
}
