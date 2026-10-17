import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { DOMParser } from '@xmldom/xmldom'
import { dprgXmlToProject } from '../src/io/dprg'
import { solve } from '../src/solver/engine'
const xml = gunzipSync(readFileSync(process.argv[2])).toString('utf16le').replace(/^﻿/, '')
const p = dprgXmlToProject(xml, new DOMParser() as any)
for (let seed = 1; seed <= 8; seed++) {
  const t = performance.now()
  const r = solve(p, { timeLimitMs: 5000, seed, keepPlacements: false })
  console.log(seed, `${(performance.now() - t).toFixed(0)}ms hard=${r.hard} soft=${r.soft}`, r.issues.map(i => i.kind).join(','))
}
