// Self-check: Ortaokul mandatory subjects are added once and never duplicated.
import assert from 'node:assert/strict'
import { addMandatorySubjects, emptyProject, ORTAOKUL_SUBJECTS } from '../src/model'
import { demoProject } from '../src/demo'

const p = emptyProject()
assert.equal(addMandatorySubjects(p), ORTAOKUL_SUBJECTS.length)
assert.equal(addMandatorySubjects(p), 0, 'second run adds nothing')
assert.equal(new Set(p.subjects.map(s => s.name)).size, p.subjects.length)

const q = emptyProject()
q.subjects.push({ ...p.subjects[0], id: 'x', name: ' MATEMATİK ' }, { ...p.subjects[0], id: 'y', name: 'İngilizce' })
assert.equal(addMandatorySubjects(q), ORTAOKUL_SUBJECTS.length - 2, 'case, spaces and aliases count as present')

const d = demoProject({ classes: 4 })
assert.equal(addMandatorySubjects(d), 1, 'demo only lacks İnkılap Tarihi')
console.log('subjects-check ok')
