import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '../icons'
import { t } from '../i18n'
import { native } from '../native'
import type { Issue, Progress, SolveResult } from '../solver/engine'
import { evaluate } from '../solver/engine'
import { defaultWorkers, runSolver, type RunHandle } from '../solver/runner'
import { getProject, update, useProject } from '../store'
import { PageTitle, toast } from '../ui'

const ISSUE_TEXT: Record<Issue['kind'], string> = {
  noSlot: 'No possible time slot (availabilities never overlap)',
  teacherClash: 'Teacher double-booked',
  roomClash: 'Room double-booked',
  classClash: 'Class double-booked',
  sameDay: 'Two blocks of the same lesson on one day',
  maxPerDay: 'Too many hours in a day',
  maxDays: 'Too many days in the week',
  maxGaps: 'Too many gaps in a day',
  linkMismatch: 'Parallel-linked lessons have different blocks',
  overload: 'More lesson hours than available slots',
  classGap: 'Blank period in class schedule',
  underload: 'Fewer lesson hours than open periods',
}

function underloadText(detail = '') {
  const [need, open] = detail.split(' < ').map(Number)
  return t('{need} lesson hours, {open} open periods: {n} would stay empty. Add lessons, or close the extra periods for this class (Sınıflar → Koşul) or the whole school.', { need, open, n: open - need })
}

function IssueList({ issues, days, periods }: { issues: Issue[]; days: string[]; periods: { label: string }[] }) {
  if (!issues.length) return <div className="hint row" style={{ gap: 6 }}><Icon n="check" /> {t('No problems found.')}</div>
  return (
    <div className="issues">
      {issues.map((i, k) => (
        <div key={k} className="issue">
          <span className={`badge ${i.kind === 'maxGaps' || i.kind === 'linkMismatch' ? 'warn' : 'bad'}`}>{t(ISSUE_TEXT[i.kind])}</span>
          <b>{i.who}</b>
          <span className="hint">
            {i.day !== undefined ? days[i.day] : ''}{i.period !== undefined ? ` · ${periods[i.period]?.label}` : ''}{i.kind === 'underload' ? ` · ${underloadText(i.detail)}` : i.detail ? ` · ${i.detail}` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

const WORKER_CHOICES = [1, 2, 3, 4, 6, 8]

export function GeneratePage({ goTo }: { goTo: (page: string) => void }) {
  const p = useProject()
  const [seconds, setSeconds] = useState(20)
  const [workers, setWorkers] = useState(defaultWorkers())
  const [running, setRunning] = useState(false)
  const [prog, setProg] = useState<Progress | null>(null)
  const [result, setResult] = useState<SolveResult | null>(null)
  const handle = useRef<RunHandle | null>(null)

  const totalCards = p.lessons.reduce((a, l) => a + l.split.length, 0)
  const placedCards = Object.keys(p.placements).length
  const locked = Object.values(p.placements).filter(x => x.locked).length
  const current = useMemo(() => evaluate(p), [p])
  const structural = current.issues.filter(i => i.kind === 'noSlot' || i.kind === 'overload' || i.kind === 'linkMismatch' || i.kind === 'underload')

  useEffect(() => () => handle.current?.stop(), [])
  useEffect(() => { native?.cpuCount().then(n => setWorkers(w => Math.max(w, WORKER_CHOICES.filter(x => x <= n - 1).pop() ?? 1))).catch(() => {}) }, [])

  const start = (keep: boolean) => {
    setRunning(true); setProg(null); setResult(null)
    const h = runSolver(p, { timeLimitMs: seconds * 1000, workers, keepPlacements: keep }, best => setProg(best))
    handle.current = h
    h.done.then(r => {
      if (getProject().lessons !== p.lessons) { toast(t('The lessons changed while generating, so the result was discarded. Generate again.')); return }
      setResult(r)
      update(d => {
        const keepLocked = Object.fromEntries(Object.entries(d.placements).filter(([, v]) => v.locked))
        d.placements = { ...r.placements, ...keepLocked }
      })
      toast(r.hard === 0 ? t('Timetable ready — no conflicts!') : t('Finished with {n} problems', { n: r.hard }))
    }).catch(err => { console.error(err); toast(t('Generator error: {e}', { e: String(err.message ?? err) })) })
      .finally(() => { setRunning(false); handle.current = null })
  }

  const pct = prog ? Math.min(100, (prog.elapsed / (seconds * 1000)) * 100) : 0
  const shown = result ?? current

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head"><PageTitle title={t('Generate timetable')} sub={t('Distribute all lessons automatically')} /></div>

      <div className="card pad stack">
        <div className="stats">
          <div className="stat"><b>{p.classes.length}</b><span>{t('Classes')}</span></div>
          <div className="stat"><b>{p.teachers.length}</b><span>{t('Teachers')}</span></div>
          <div className="stat"><b>{p.lessons.length}</b><span>{t('Lessons')}</span></div>
          <div className="stat"><b>{totalCards}</b><span>{t('Blocks to place')}</span></div>
          <div className="stat"><b>{placedCards}</b><span>{t('Placed')}</span></div>
          <div className="stat"><b>{locked}</b><span>{t('Locked')}</span></div>
        </div>
      </div>

      {structural.length > 0 && (
        <div className="card pad stack" style={{ borderColor: 'var(--danger)' }}>
          <h3 className="row" style={{ gap: 6 }}><Icon n="alert" /> {t('Fix these before generating')}</h3>
          <IssueList issues={structural} days={p.days} periods={p.periods} />
        </div>
      )}

      <div className="card pad stack">
        <div className="row" style={{ alignItems: 'end', gap: 16 }}>
          <label className="field">{t('Max time')}
            <select value={seconds} onChange={e => setSeconds(+e.target.value)} disabled={running}>
              {[5, 10, 20, 30, 60, 120, 300].map(s => <option key={s} value={s}>{s < 60 ? `${s} ${t('sec')}` : `${s / 60} ${t('min')}`}</option>)}
            </select>
          </label>
          <label className="field" title={t('Several independent searches run in parallel; the best one wins.')}>{t('Parallel searches')}
            <select value={workers} onChange={e => setWorkers(+e.target.value)} disabled={running}>
              {WORKER_CHOICES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {!running ? <>
            <button className="btn primary" disabled={!totalCards} onClick={() => start(false)}><Icon n="play" /> {t('Generate')}</button>
            <button className="btn" disabled={!placedCards} onClick={() => start(true)} title={t('Continue from the current timetable and try to make it better.')}><Icon n="sparkle" /> {t('Improve current')}</button>
          </> : <button className="btn danger" onClick={() => handle.current?.stop()}><Icon n="stop" /> {t('Stop & keep best')}</button>}
        </div>
        <p className="hint" style={{ margin: 0 }}>
          {t('Locked blocks stay where they are. Availability rules are never broken. The search stops early once it can no longer improve.')}
        </p>
        {(running || prog) && (
          <div className="stack">
            <div className="progress"><div style={{ width: `${running ? pct : 100}%` }} /></div>
            {prog && (
              <div className="row hint">
                <span>{t('Problems')}: <b className={prog.hard ? '' : ''} style={{ color: prog.hard ? 'var(--danger)' : 'var(--ok)' }}>{prog.hard}</b></span>
                <span>· {t('Quality penalty')}: <b>{Math.round(prog.soft)}</b></span>
                <span>· {(prog.elapsed / 1000).toFixed(1)}s</span>
                <span>· {(prog.iter / 1e6).toFixed(1)}M {t('moves')}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {placedCards > 0 && (
        <div className="card pad stack">
          <div className="row">
            <h3 style={{ marginRight: 'auto' }}>{result ? t('Result') : t('Current timetable')}</h3>
            <button className="btn" onClick={() => goTo('timetable')}>{t('Open timetable')} <Icon n="right" /></button>
            <button className="btn" onClick={() => goTo('print')}>{t('Print & share')} <Icon n="right" /></button>
          </div>
          <div className="stats">
            <div className="stat"><b style={{ color: shown.hard ? 'var(--danger)' : 'var(--ok)' }}>{shown.hard}</b><span>{t('Problems')}</span></div>
            <div className="stat"><b>{shown.stats.placedCards}/{shown.stats.totalCards}</b><span>{t('Blocks placed')}</span></div>
            <div className="stat"><b>{shown.stats.classGaps}</b><span>{t('Class gaps')}</span></div>
            <div className="stat"><b>{shown.stats.teacherGaps}</b><span>{t('Teacher gaps')}</span></div>
          </div>
          <IssueList issues={shown.issues} days={p.days} periods={p.periods} />
        </div>
      )}
    </div>
  )
}
