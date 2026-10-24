import assert from 'node:assert/strict'
import { addMandatorySubjects, emptyProject, fileName, fillTeachers, importStudents, MANDATORY_SUBJECTS, parseStudents } from '../src/model'
import { demoProject } from '../src/demo'
import { migrate } from '../src/store'
import { buildSheet, fillMonth } from '../src/duty'

const p = emptyProject()
assert.equal(addMandatorySubjects(p, 'ortaokul'), MANDATORY_SUBJECTS.ortaokul.length)
assert.equal(addMandatorySubjects(p, 'ortaokul'), 0, 'second run adds nothing')
assert.equal(new Set(p.subjects.map(s => s.name)).size, p.subjects.length)
assert.ok(p.subjects.some(s => s.name === 'BİLİŞİM TEKNOLOJİLERİ VE YAZILIM'), 'names are upper-case with Turkish İ')
assert.equal(migrate({ ...emptyProject(), teachers: [{ ...p.subjects[0], name: 'ayşe yılmaz', maxPerDay: 0, maxGapsPerDay: -1 }] }).teachers[0].name, 'AYŞE YILMAZ')

const q = emptyProject()
q.subjects.push({ ...p.subjects[0], id: 'x', name: ' MATEMATİK ' }, { ...p.subjects[0], id: 'y', name: 'İngilizce' })
assert.equal(addMandatorySubjects(q, 'ortaokul'), MANDATORY_SUBJECTS.ortaokul.length - 2, 'case, spaces and aliases count as present')

const d = demoProject({ classes: 4 })
assert.equal(addMandatorySubjects(d, 'ortaokul'), 1, 'demo only lacks İnkılap Tarihi')

for (const [type, list] of Object.entries(MANDATORY_SUBJECTS)) {
  const short = new Set(list.map(([, s]) => s)), names = new Set(list.map(([n]) => n))
  assert.equal(short.size, list.length, type + ': short names unique')
  assert.equal(names.size, list.length, type + ': names unique')
}
const l = emptyProject()
addMandatorySubjects(l, 'ortaokul')
assert.equal(addMandatorySubjects(l, 'lise'), 8)
assert.equal(addMandatorySubjects(l, ''), 0)

const oldFile = JSON.parse(JSON.stringify(demoProject({ classes: 4 })))
delete oldFile.school.vice
delete oldFile.duty.fixed
delete oldFile.duty.hoursWeight
oldFile.duty.places = [{ id: 'a', name: 'BAHÇE', count: 1 }]
const o = migrate(oldFile)
assert.equal(o.school.vice, '', 'a file from before Müdür Yardımcısı opens with an empty name')
assert.deepEqual([o.duty.fixed, o.duty.hoursWeight], [{}, 0], 'and without fixed places or lesson load balance')
fillMonth(o, '2026-11')
assert.ok(Object.keys(o.duty.assign).length > 0 && buildSheet(o, '2026-11', 'x').rows.length > 0, 'and its duties can be distributed and exported')
const noDuty = JSON.parse(JSON.stringify(demoProject({ classes: 4 })))
delete noDuty.duty
delete noDuty.school
const n = migrate(noDuty)
assert.ok(n.duty.places && n.duty.assign && n.duty.fixed && n.school.name === '', 'a file from before the duty module opens with empty duty data')

const named = (name: string) => ({ ...emptyProject(), school: { name, year: '', principal: '', vice: '' } })
assert.deepEqual([fileName(named(' Atatürk Ortaokulu ')), fileName(named('')), fileName(named('?!'), 'okul')], ['Atatürk_Ortaokulu', 'ders_programi', 'okul'], 'file names are cleaned the same way everywhere')

const gsl = emptyProject()
assert.equal(addMandatorySubjects(gsl, 'guzelsanatlar'), MANDATORY_SUBJECTS.guzelsanatlar.length, 'güzel sanatlar lisesi gets its common, field and elective subjects')

const cls = [{ id: 'a', name: '9-A', short: '9A', color: '', avail: '', groups: [] }]
assert.deepEqual(parseStudents('S.No\tSınıf\tÖğrenci No\tAdı Soyadı\n1\t9/A\t123\tali yılmaz\n2\t10-B\t456\tAyşe  Kaya\n\n', cls), [
  { classId: 'a', className: '9/A', no: '123', name: 'ALİ YILMAZ' },
  { classId: null, className: '10-B', no: '456', name: 'AYŞE KAYA' },
], 'Excel rows: header skipped, class matched or new, last number is the student number')
assert.deepEqual(parseStudents('No;Adı;Soyadı\n7;Can;Demir', cls), [{ classId: null, className: '', no: '7', name: 'CAN DEMİR' }], 'CSV without a class column, name in two columns')

const f = demoProject({ classes: 4 })
const [mat, tur] = [f.subjects[0].id, f.subjects[1].id]
f.lessons.forEach(l => { l.teacherIds = [] })
f.teachers[0].subjectIds = [mat]
f.teachers[1].subjectIds = [tur]
f.teachers[2].subjectIds = [tur]
const filled = fillTeachers(f)
assert.ok(filled > 0 && f.lessons.filter(l => l.subjectId === mat).every(l => l.teacherIds.join() === f.teachers[0].id), 'the only math teacher gets every math lesson without a teacher')
assert.ok(f.lessons.filter(l => l.subjectId === tur).every(l => !l.teacherIds.length), 'a subject with two teachers is left for the user to pick')
f.teachers[0].subjectIds = [mat, tur]
assert.equal(fillTeachers(f), 0, 'lessons that already have a teacher are never changed')

assert.ok(['ÇALGI EĞİTİMİ (KEMAN)', 'TSM ÇALGI EĞİTİMİ (KEMAN)', 'İKİNCİ YABANCI DİL (ALMANCA)', 'KORO', 'ORKESTRA'].every(n => gsl.subjects.some(x => x.name === n)), 'multi-subject entries are separate subjects')

assert.deepEqual(parseStudents('9-A,12,"YILMAZ, ALİ"\n9-A;13;"Ece ""Su"" Kaya"', cls).map(r => r.name), ['YILMAZ, ALİ', 'ECE "SU" KAYA'], 'quoted CSV fields keep their commas and lose their quotes')

const im = emptyProject()
im.classes.push({ id: 'a', name: '9-A', short: '9A', color: '', avail: '', groups: [] })
assert.deepEqual(importStudents(im, '9/A\t1\tAli\n10-B\t2\tCan\n3\tDeniz\n9-A\t1\tAli Tekrar'), { added: 2, skipped: 1 }, 'a row without a class is skipped when no class is chosen; the same number is not added twice')
assert.deepEqual(im.classes.map(c => [c.name, c.students?.map(s => s.name)]), [['9-A', ['ALİ']], ['10-B', ['CAN']]], 'known classes are matched, new ones created')
assert.deepEqual(importStudents(im, '4\tEce', 'a'), { added: 1, skipped: 0 })
assert.equal(im.classes[0].students!.at(-1)!.name, 'ECE', 'inside a class window rows without a class go to that class')

console.log('subjects-check ok')
