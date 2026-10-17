import { demoProject } from '../src/demo'
import { solve } from '../src/solver/engine'
const p = demoProject(['A', 'B', 'C', 'D', 'E', 'F', 'G'])
// Science lab: give the big school 3 labs worth of capacity by dropping lab requirement for grades 5-6
console.log('classes', p.classes.length, 'teachers', p.teachers.length, 'blocks', p.lessons.reduce((a, l) => a + l.split.length, 0))
const t = performance.now()
const r = solve(p, { timeLimitMs: Number(process.argv[2] ?? 10000), seed: 1, keepPlacements: false }, pr => { if (pr.iter % 5 === 0) {} })
const kinds: Record<string, number> = {}
r.issues.forEach(i => (kinds[i.kind] = (kinds[i.kind] ?? 0) + 1))
console.log(`${(performance.now() - t).toFixed(0)}ms iters=${r.iterations} hard=${r.hard} soft=${r.soft}`, r.stats, kinds, r.issues.filter(i => i.kind === 'overload'))
