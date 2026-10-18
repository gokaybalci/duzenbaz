import assert from 'node:assert/strict'
import { addMandatorySubjects, emptyProject, fileName, MANDATORY_SUBJECTS } from '../src/model'
import { demoProject } from '../src/demo'
import { migrate } from '../src/store'
import { buildSheet, fillMonth } from '../src/duty'

const p = emptyProject()
assert.equal(addMandatorySubjects(p, 'ortaokul'), MANDATORY_SUBJECTS.ortaokul.length)
assert.equal(addMandatorySubjects(p, 'ortaokul'), 0, 'second run adds nothing')
assert.equal(new Set(p.subjects.map(s => s.name)).size, p.subjects.length)
assert.ok(p.subjects.some(s => s.name === 'BİLİŞİM TEKNOLOJİLERİ VE YAZILIM'), 'names are upper-case with Turkish İ')
assert.equal(migrate({ ...emptyProject(), teachers: [{ ...p.subjects[0], name: 'ayşe yılmaz', maxPerDay: 0, maxDays: 0, maxGapsPerDay: -1 }] }).teachers[0].name, 'AYŞE YILMAZ')

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

console.log('subjects-check ok')
