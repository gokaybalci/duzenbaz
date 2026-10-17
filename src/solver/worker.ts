import { Solver, evaluate, type SolveOptions } from './engine'
import type { Project } from '../model'

export type WorkerIn =
  | { type: 'solve'; project: Project; options: SolveOptions }
  | { type: 'evaluate'; project: Project }
  | { type: 'stop' }

let stopRequested = false

self.onmessage = async (e: MessageEvent<WorkerIn>) => {
  const msg = e.data
  if (msg.type === 'stop') { stopRequested = true; return }
  if (msg.type === 'evaluate') { self.postMessage({ type: 'result', result: evaluate(msg.project) }); return }
  stopRequested = false
  const s = new Solver(msg.project)
  s.start(msg.project, msg.options)
  while (!s.step(100) && !stopRequested) {
    self.postMessage({ type: 'progress', progress: s.progress() })
    await new Promise(r => setTimeout(r, 0))
  }
  self.postMessage({ type: 'result', result: s.finish() })
}
