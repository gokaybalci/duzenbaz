import { readFileSync, readdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { DOMParser } from '@xmldom/xmldom'
import { dprgXmlToProject } from '../src/io/dprg'
import { solve } from '../src/solver/engine'
const dir = process.argv[2]
for (const f of readdirSync(dir).filter(f => f.endsWith('.dprg'))) {
  const xml = gunzipSync(readFileSync(dir + '/' + f)).toString('utf16le').replace(/^﻿/, '')
  const p = dprgXmlToProject(xml, new DOMParser() as any)
  const t = performance.now()
  const r = solve(p, { timeLimitMs: 2000, seed: 1, keepPlacements: false })
  console.log(f.padEnd(55), `${(performance.now() - t).toFixed(0)}ms hard=${r.hard} soft=${r.soft}`, JSON.stringify(r.stats), r.issues.map(i => i.kind + ':' + i.who).join(' '))
}
