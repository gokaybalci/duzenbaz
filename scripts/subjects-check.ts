// Self-check: Ortaokul mandatory subjects are added once and never duplicated.
import assert from 'node:assert/strict'
import { addMandatorySubjects, emptyProject, MANDATORY_SUBJECTS } from '../src/model'
import { demoProject } from '../src/demo'

const p = emptyProject()
assert.equal(addMandatorySubjects(p, 'ortaokul'), MANDATORY_SUBJECTS.ortaokul.length)
assert.equal(addMandatorySubjects(p, 'ortaokul'), 0, 'second run adds nothing')
assert.equal(new Set(p.subjects.map(s => s.name)).size, p.subjects.length)

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
// Ortaokul → Lise adds only the lise subjects that are new.
const l = emptyProject()
addMandatorySubjects(l, 'ortaokul')
assert.equal(addMandatorySubjects(l, 'lise'), 8)
assert.equal(addMandatorySubjects(l, ''), 0)

console.log('subjects-check ok')
