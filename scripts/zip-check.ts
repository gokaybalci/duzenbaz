import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zip } from '../src/xlsx'

// Read the backup ZIP with another program (Python's zipfile) to check names and contents survive.
const name = 'BAYRAMOĞLU_çşıöü.duzenbaz', text = '{"school":{"name":"Ğİ"}}'
const f = join(mkdtempSync(join(tmpdir(), 'zip-check-')), 'b.zip')
writeFileSync(f, zip([[name, text]]))
const out = execFileSync('python3', ['-I', '-c', 'import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; n=z.namelist()[0]; print(json.dumps([n, z.read(n).decode()]))', f]).toString()
assert.deepEqual(JSON.parse(out), [name, text])
console.log('zip-check ok')
