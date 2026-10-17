import { useState } from 'react'
import { Icon } from '../icons'
import { DAY_NAMES, t, useLang } from '../i18n'
import type { Period } from '../model'
import { setTimeShape, update, useProject } from '../store'
import { AvailabilityEditor } from '../ui'

const pad = (n: number) => String(n).padStart(2, '0')
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) }
const fmt = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`

export function SchoolPage() {
  const p = useProject()
  const lang = useLang()
  const [gen, setGen] = useState({ start: '08:30', len: 40, brk: 10, lunchAfter: 5, lunch: 40 })

  const setDays = (days: string[]) => setTimeShape(days, p.periods)
  const setPeriods = (periods: Period[]) => setTimeShape(p.days, periods)

  const generateTimes = () => {
    let m = toMin(gen.start)
    setPeriods(p.periods.map((per, i) => {
      const s = m
      m += gen.len
      const time = `${fmt(s)}-${fmt(m)}`
      m += i + 1 === gen.lunchAfter ? gen.lunch : gen.brk
      return { ...per, time }
    }))
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head"><h2>{t('School & schedule')}</h2></div>
      <div className="grid2">
        <div className="card pad stack">
          <h3>{t('School')}</h3>
          <label className="field">{t('School name')}
            <input value={p.school.name} onChange={e => update(d => { d.school.name = e.target.value }, 'school.name')} />
          </label>
          <div className="row">
            <label className="field" style={{ flex: 1 }}>{t('School year')}
              <input value={p.school.year} placeholder="2026-2027" onChange={e => update(d => { d.school.year = e.target.value }, 'school.year')} />
            </label>
            <label className="field" style={{ flex: 1 }}>{t('Principal')}
              <input value={p.school.principal} onChange={e => update(d => { d.school.principal = e.target.value }, 'school.principal')} />
            </label>
          </div>
          <h3 style={{ marginTop: 8 }}>{t('Days')}</h3>
          <div className="row">
            {p.days.map((day, i) => (
              <input key={i} value={day} style={{ width: 110 }} onChange={e => { const a = [...p.days]; a[i] = e.target.value; setDays(a) }} />
            ))}
          </div>
          <div className="row">
            <button className="btn small" disabled={p.days.length >= 7} onClick={() => setDays([...p.days, DAY_NAMES[lang][p.days.length] ?? `${t('Day')} ${p.days.length + 1}`])}>+ {t('Add day')}</button>
            <button className="btn small" disabled={p.days.length <= 1} onClick={() => setDays(p.days.slice(0, -1))}><Icon n="minus" /> {t('Remove last day')}</button>
            <button className="btn small ghost" onClick={() => setDays(DAY_NAMES[lang].slice(0, p.days.length))}>{t('Use default day names')}</button>
          </div>
        </div>

        <div className="card pad stack">
          <h3>{t('Periods (lesson hours per day)')}</h3>
          <table className="data">
            <thead><tr><th>#</th><th>{t('Label')}</th><th>{t('Time')}</th></tr></thead>
            <tbody>
              {p.periods.map((per, i) => (
                <tr key={i}>
                  <td style={{ width: 30 }}>{i + 1}</td>
                  <td><input value={per.label} onChange={e => setPeriods(p.periods.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></td>
                  <td><input value={per.time} placeholder="08:30-09:10" onChange={e => setPeriods(p.periods.map((x, j) => (j === i ? { ...x, time: e.target.value } : x)))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row">
            <button className="btn small" disabled={p.periods.length >= 16} onClick={() => setPeriods([...p.periods, { label: String(p.periods.length + 1), time: '' }])}>+ {t('Add period')}</button>
            <button className="btn small" disabled={p.periods.length <= 1} onClick={() => setPeriods(p.periods.slice(0, -1))}><Icon n="minus" /> {t('Remove last period')}</button>
          </div>
          <details>
            <summary className="hint" style={{ cursor: 'pointer' }}>{t('Generate times automatically')}</summary>
            <div className="row" style={{ marginTop: 8, alignItems: 'end' }}>
              <label className="field">{t('First lesson starts')}<input value={gen.start} style={{ width: 80 }} onChange={e => setGen({ ...gen, start: e.target.value })} /></label>
              <label className="field">{t('Lesson (min)')}<input type="number" value={gen.len} onChange={e => setGen({ ...gen, len: +e.target.value })} style={{ width: 70 }} /></label>
              <label className="field">{t('Break (min)')}<input type="number" value={gen.brk} onChange={e => setGen({ ...gen, brk: +e.target.value })} style={{ width: 70 }} /></label>
              <label className="field">{t('Lunch after period')}<input type="number" value={gen.lunchAfter} onChange={e => setGen({ ...gen, lunchAfter: +e.target.value })} style={{ width: 70 }} /></label>
              <label className="field">{t('Lunch (min)')}<input type="number" value={gen.lunch} onChange={e => setGen({ ...gen, lunch: +e.target.value })} style={{ width: 70 }} /></label>
              <button className="btn" onClick={generateTimes}>{t('Apply')}</button>
            </div>
          </details>
        </div>
      </div>

      <div className="card pad stack">
        <h3>{t('School-wide availability')}</h3>
        <p className="hint" style={{ margin: 0 }}>{t('Close slots when no lessons may happen at all (e.g. Friday afternoon).')}</p>
        <AvailabilityEditor days={p.days} periods={p.periods} value={p.avail} onChange={g => update(d => { d.avail = g })} />
      </div>

      <div className="card pad stack">
        <h3>{t('Distribution preferences')}</h3>
        <p className="hint" style={{ margin: 0 }}>{t('Higher numbers mean the generator tries harder to avoid it. Conflicts and availability are always respected.')}</p>
        <div className="row" style={{ alignItems: 'end', gap: 16 }}>
          {([
            ['classGap', 'Gaps in class schedules'],
            ['teacherGap', 'Gaps in teacher schedules'],
            ['classLateStart', 'Classes starting late'],
            ['spread', 'Same lesson on consecutive days'],
          ] as const).map(([k, label]) => (
            <label key={k} className="field">{t(label)}
              <input type="number" min={0} value={p.weights[k]} style={{ width: 110 }} onChange={e => update(d => { d.weights[k] = Math.max(0, +e.target.value || 0) }, 'w.' + k)} />
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
