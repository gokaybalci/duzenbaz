import { useMemo, useState } from 'react'
import { autoDays, dutyCounts, dutySchedule, dutySlots, schoolDays, teachersByDay, weekDates } from '../duty'
import { Icon } from '../icons'
import { t } from '../i18n'
import { newId } from '../model'
import { update, useProject } from '../store'
import { toast } from '../ui'

const fmt = (d: Date) => d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })

export function DutyPage() {
  const p = useProject()
  const [name, setName] = useState('')
  const [week, setWeek] = useState(0)
  const days = useMemo(() => schoolDays(p), [p])
  const schedule = useMemo(() => dutySchedule(p), [p])
  const counts = useMemo(() => dutyCounts(p, schedule), [p, schedule])
  const byDay = teachersByDay(p)
  const slots = dutySlots(p)
  const placeName = new Map(p.duty.places.map(x => [x.id, x.name]))
  const teacherName = new Map(p.teachers.map(x => [x.id, x.name]))
  const W = Math.max(1, p.duty.weeks)
  const wk = Math.min(week, W - 1)
  const grid = schedule[wk]
  const dates = weekDates(p, wk)

  const addPlace = () => {
    const n = name.trim()
    if (!n) return
    update(d => { d.duty.places.push({ id: newId('n'), name: n, count: 1 }) })
    setName('')
  }
  const distribute = () => {
    update(d => { d.duty.day = autoDays(d) })
    toast(t('Duty days distributed'))
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head"><h2>{t('Duty roster')}</h2></div>

      {!p.teachers.length && <div className="card pad hint">{t('Add teachers in the timetable module first; the duty roster uses the same list.')}</div>}

      <div className="card pad stack">
        <h3>{t('Duty places')}</h3>
        {p.duty.places.length > 0 && (
          <table className="data" style={{ maxWidth: 520 }}>
            <thead><tr><th>{t('Name')}</th><th className="num">{t('Teachers per day')}</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {p.duty.places.map(pl => (
                <tr key={pl.id}>
                  <td><input value={pl.name} onChange={e => update(d => { d.duty.places.find(x => x.id === pl.id)!.name = e.target.value }, 'dp.name')} /></td>
                  <td className="num"><input type="number" min={1} max={9} value={pl.count} style={{ width: 70 }}
                    onChange={e => update(d => { d.duty.places.find(x => x.id === pl.id)!.count = Math.max(1, Math.min(9, +e.target.value || 1)) }, 'dp.count')} /></td>
                  <td><button className="btn ghost small danger" title={t('Delete')} onClick={() => update(d => { d.duty.places = d.duty.places.filter(x => x.id !== pl.id) })}><Icon n="trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="row">
          <input placeholder={t('New duty place…')} value={name} style={{ flex: 1, maxWidth: 360 }}
            onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPlace() }} />
          <button className="btn primary" disabled={!name.trim()} onClick={addPlace}>+ {t('Add')}</button>
          <span className="hint">{t('e.g. Garden, Ground floor, 1st floor, Canteen')}</span>
        </div>
      </div>

      {p.teachers.length > 0 && (
        <div className="card pad stack">
          <div className="row">
            <h3 style={{ marginRight: 'auto' }}>{t('Teachers and duty days')}</h3>
            <button className="btn primary" onClick={distribute}><Icon n="zap" /> {t('Distribute duty days from the timetable')}</button>
          </div>
          <p className="hint" style={{ margin: 0 }}>{t('School days come from the timetable: the days a teacher has lessons, or, before distributing, the days their availability leaves open. Each teacher gets one duty day; places rotate every week so everyone gets each place equally often.')}</p>
          <div className="row">
            {p.days.map((day, d) => (
              <span key={d} className={`badge ${byDay[d].length < slots.length ? 'bad' : 'ok'}`}>{day}: {t('{n} teachers / {m} places', { n: byDay[d].length, m: slots.length })}</span>
            ))}
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('Teacher')}</th><th>{t('At school')}</th><th>{t('Duty day')}</th>
                  {p.duty.places.map(pl => <th key={pl.id} className="num">{pl.name}</th>)}
                  <th className="num">{t('Total')}</th>
                </tr>
              </thead>
              <tbody>
                {p.teachers.map(te => {
                  const at = days.get(te.id)!, day = p.duty.day[te.id] ?? -1, c = counts.get(te.id) ?? {}
                  return (
                    <tr key={te.id}>
                      <td>{te.name}</td>
                      <td>{at.some(Boolean) ? p.days.filter((_, d) => at[d]).map(x => x.slice(0, 3)).join(' ') : <span className="badge warn">{t('none')}</span>}</td>
                      <td>
                        <select value={day} onChange={e => update(d => { d.duty.day[te.id] = +e.target.value })}>
                          <option value={-1}>{t('No duty')}</option>
                          {p.days.map((x, d) => <option key={d} value={d}>{x}{at[d] ? '' : ' ' + t('(not at school)')}</option>)}
                        </select>
                        {day >= 0 && !at[day] && <> <span className="badge warn">{t('not at school')}</span></>}
                      </td>
                      {p.duty.places.map(pl => <td key={pl.id} className="num">{c[pl.id] ?? 0}</td>)}
                      <td className="num"><b>{Object.values(c).reduce((a, b) => a + b, 0)}</b></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {slots.length > 0 && p.teachers.length > 0 && (
        <div className="card pad stack">
          <div className="row" style={{ alignItems: 'end' }}>
            <h3 style={{ marginRight: 'auto' }}>{t('Duty schedule')}</h3>
            <label className="field">{t('First week starts')}
              <input type="date" value={p.duty.start} onChange={e => update(d => { d.duty.start = e.target.value })} />
            </label>
            <label className="field">{t('Number of weeks')}
              <input type="number" min={1} max={60} value={p.duty.weeks} style={{ width: 80 }} onChange={e => update(d => { d.duty.weeks = Math.max(1, Math.min(60, +e.target.value || 1)) }, 'duty.weeks')} />
            </label>
          </div>
          <div className="row">
            <button className="btn small" disabled={wk === 0} onClick={() => setWeek(wk - 1)}>‹</button>
            <b>{t('Week {n} of {w}', { n: wk + 1, w: W })}</b>
            <button className="btn small" disabled={wk >= W - 1} onClick={() => setWeek(wk + 1)}>›</button>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>{t('Place')}</th>{p.days.map((day, d) => <th key={d}>{day}{dates && <span className="hint"> {fmt(dates[d])}</span>}</th>)}</tr>
              </thead>
              <tbody>
                {slots.map((pid, j) => (
                  <tr key={j}>
                    <td><b>{placeName.get(pid)}</b></td>
                    {grid.map((day, d) => <td key={d}>{day[j] ? teacherName.get(day[j]!) : <span className="badge bad">{t('empty')}</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
