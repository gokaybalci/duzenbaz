import type { Project } from '../model'
import type { Progress, SolveResult } from './engine'
import type { WorkerIn } from './worker'

export interface RunHandle {
  stop(): void
  done: Promise<SolveResult>
}

const better = (a: { hard: number; soft: number }, b: { hard: number; soft: number }) =>
  a.hard < b.hard || (a.hard === b.hard && a.soft < b.soft)

export function runSolver(project: Project, opts: { timeLimitMs: number; workers: number; keepPlacements: boolean }, onProgress: (best: Progress, perWorker: Progress[]) => void): RunHandle {
  const n = Math.max(1, opts.workers)
  const workers: Worker[] = []
  const progress: Progress[] = []
  const base = (Date.now() ^ (Math.random() * 1e9)) >>> 0
  const done = new Promise<SolveResult>((resolve, reject) => {
    const results: SolveResult[] = []
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      workers.push(w)
      w.onmessage = e => {
        const m = e.data
        if (m.type === 'progress') {
          progress[i] = m.progress
          const best = progress.filter(Boolean).reduce((a, b) => (better(b, a) ? b : a))
          onProgress(best, progress)
        } else if (m.type === 'result') {
          results.push(m.result)
          w.terminate()
          if (results.length === n) resolve(results.reduce((a, b) => (better(b, a) ? b : a)))
        }
      }
      w.onerror = err => { workers.forEach(x => x.terminate()); reject(err) }
      const msg: WorkerIn = {
        type: 'solve', project,
        options: { timeLimitMs: opts.timeLimitMs, seed: (base + i * 7919) >>> 0, keepPlacements: opts.keepPlacements && i === 0 },
      }
      w.postMessage(msg)
    }
  })
  return { stop: () => workers.forEach(w => w.postMessage({ type: 'stop' } satisfies WorkerIn)), done }
}

export const defaultWorkers = () => [1, 2, 3, 4, 6, 8].filter(x => x <= (navigator.hardwareConcurrency || 4) - 1).pop() ?? 1
