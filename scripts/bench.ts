import { demoProject } from '../src/demo'
import { solve } from '../src/solver/engine'
const p = demoProject()
const hours = p.classes.map(c => p.lessons.filter(l => l.classes.some(x => x.classId === c.id && x.groupId === null)).reduce((a, l) => a + l.split.reduce((x, y) => x + y, 0), 0))
console.log('classes', p.classes.length, 'teachers', p.teachers.length, 'lessons', p.lessons.length, 'class hours', hours.join(','))
for (const seed of [1, 2, 3]) {
  const t = performance.now()
  const r = solve(p, { timeLimitMs: Number(process.argv[2] ?? 5000), seed, keepPlacements: false })
  const kinds: Record<string, number> = {}
  r.issues.forEach(i => (kinds[i.kind] = (kinds[i.kind] ?? 0) + 1))
  console.log(`seed ${seed}: ${(performance.now() - t).toFixed(0)}ms iters=${r.iterations} hard=${r.hard} soft=${r.soft}`, r.stats, kinds)
}
