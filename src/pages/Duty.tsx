import { useMemo, useState } from 'react'
import { DUTY_ROLES, buildSheet, currentMonth, dutyDays, heat, monthPlan, roleOf, schoolDays, totalOf, trDate } from '../duty'
import { Icon } from '../icons'
import { t } from '../i18n'
import { newId, type DutyRole, type Project } from '../model'
import { native } from '../native'
import { update, useProject } from '../store'
import { download, toast } from '../ui'
import { xlsx } from '../xlsx'

const monthName = (month: string) => { const [y, m] = month.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) }
const fileName = (p: Project, month: string) => `${(p.school.name || 'okul').replace(/[^\p{L}\p{N}]+/gu, '_')}_nobet_${month}.xlsx`

export function DutyTeachersPage() {
  const p = useProject()
  const school = useMemo(() => schoolDays(p), [p])
  const days = dutyDays(p, school)
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <h2>{t('Teachers')}</h2>
        <button className="btn" disabled={!Object.keys(p.duty.days).length} onClick={() => { update(d => { d.duty.days = {} }); toast(t('Days taken from the timetable')) }}>
          <Icon n="undo" /> {t('Take days from the timetable again')}
        </button>
      </div>
      {!p.teachers.length ? <div className="card pad hint">{t('Add teachers in the timetable module first; the duty module uses the same list.')}</div> : (
        <div className="card table-wrap">
          <p className="hint" style={{ margin: 12 }}>{t('Ticked days come from the timetable (the days a teacher has lessons, or before distributing, the open days of their availability). Duty can be given on every ticked day. Only teachers marked "On duty" get duties.')}</p>
          <table className="data">
            <thead><tr><th>{t('Teacher')}</th><th>{t('Role')}</th>{p.days.map((d, i) => <th key={i} style={{ textAlign: 'center' }}>{d}</th>)}</tr></thead>
            <tbody>
              {p.teachers.map(te => {
                const role = roleOf(p, te.id), on = days.get(te.id)!
                return (
                  <tr key={te.id} style={{ opacity: role === 'duty' ? 1 : 0.55 }}>
                    <td>{te.name}</td>
                    <td>
                      <select value={role} onChange={e => update(d => { d.duty.role[te.id] = e.target.value as DutyRole })}>
                        {DUTY_ROLES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
                      </select>
                    </td>
                    {p.days.map((_, i) => (
                      <td key={i} style={{ textAlign: 'center' }}>
                        <input type="checkbox" aria-label={p.days[i]} checked={on[i]} onChange={e => update(d => { const a = [...on]; a[i] = e.target.checked; d.duty.days[te.id] = a })} />
                        {on[i] !== school.get(te.id)![i] && <span className="hint" title={t('Changed by hand')}> *</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function DutyPlacesPage() {
  const p = useProject()
  const [name, setName] = useState('')
  const add = () => {
    const n = name.trim()
    if (!n) return
    update(d => { d.duty.places.push({ id: newId('n'), name: n, count: 1 }) })
    setName('')
  }
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head"><h2>{t('Duty places')}</h2></div>
      <div className="card pad row">
        <input placeholder={t('New duty place…')} value={name} style={{ flex: 1, maxWidth: 360 }} autoFocus
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
        <button className="btn primary" disabled={!name.trim()} onClick={add}>+ {t('Add')}</button>
        <span className="hint">{t('e.g. Garden, Ground floor, 1st floor, Canteen')}</span>
      </div>
      <div className="card table-wrap">
        {!p.duty.places.length ? <div className="empty">{t('Nothing here yet. Add the first one above.')}</div> : (
          <table className="data">
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
      </div>
    </div>
  )
}

export function DutySpecialsPage() {
  const p = useProject()
  const [f, setF] = useState({ from: '', to: '', name: '' })
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(f.from) && f.name.trim() && (!f.to || f.to >= f.from)
  const add = () => {
    if (!ok) return
    update(d => { d.duty.specials.push({ id: newId('h'), from: f.from, to: f.to, name: f.name.trim() }) })
    setF({ from: '', to: '', name: '' })
  }
  const list = [...p.duty.specials].sort((a, b) => a.from.localeCompare(b.from))
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head"><h2>{t('Special days')}</h2></div>
      <div className="card pad stack">
        <p className="hint" style={{ margin: 0 }}>{t('No duty is given on these days (holidays, bayram). In the Excel table the description is written struck through on those days.')}</p>
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="field">{t('From')}<input type="date" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></label>
          <label className="field">{t('To (optional)')}<input type="date" value={f.to} min={f.from} onChange={e => setF({ ...f, to: e.target.value })} /></label>
          <label className="field" style={{ flex: 1, maxWidth: 360 }}>{t('Description')}
            <input value={f.name} placeholder={t('e.g. Republic Day')} onChange={e => setF({ ...f, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') add() }} />
          </label>
          <button className="btn primary" disabled={!ok} onClick={add}>+ {t('Add')}</button>
        </div>
      </div>
      <div className="card table-wrap">
        {!list.length ? <div className="empty">{t('Nothing here yet. Add the first one above.')}</div> : (
          <table className="data">
            <thead><tr><th>{t('From')}</th><th>{t('To')}</th><th>{t('Description')}</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id}>
                  <td>{trDate(s.from)}</td>
                  <td>{s.to && s.to !== s.from ? trDate(s.to) : ''}</td>
                  <td><input value={s.name} onChange={e => update(d => { d.duty.specials.find(x => x.id === s.id)!.name = e.target.value }, 'sp.name')} /></td>
                  <td><button className="btn ghost small danger" title={t('Delete')} onClick={() => update(d => { d.duty.specials = d.duty.specials.filter(x => x.id !== s.id) })}><Icon n="trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

export function DutyPlanPage() {
  const p = useProject()
  const month = currentMonth(p)
  const mp = useMemo(() => monthPlan(p, month), [p, month])
  const places = p.duty.places, teacher = new Map(p.teachers.map(x => [x.id, x.name]))
  const slots = places.flatMap(pl => Array<string>(pl.count).fill(pl.id))
  const totals = [...mp.counts.values()].map(totalOf), min = Math.min(...totals), max = Math.max(...totals)
  const title = `${p.school.name || t('School')} – ${t('Duty roster')} – ${monthName(month)}`
  const early = /^\d{4}-\d{2}-\d{2}$/.test(p.duty.start) && p.duty.start.slice(0, 7) > month
  const ready = slots.length > 0 && mp.counts.size > 0 && !early

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head no-print">
        <h2>{t('Distribute duties')}</h2>
        <button className="btn primary" disabled={!ready} onClick={() => window.print()}><Icon n="printer" /> {t('Print / Save as PDF')}</button>
        <button className="btn" disabled={!ready} onClick={() => download(fileName(p, month), xlsx(buildSheet(p, mp, title)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}>
          <Icon n="download" /> {native ? t('Save Excel') : t('Download Excel')}
        </button>
      </div>
      <div className="card pad row no-print" style={{ alignItems: 'end' }}>
        <label className="field">{t('Month')}<input type="month" value={month} onChange={e => update(d => { d.duty.month = e.target.value })} /></label>
        <label className="field">{t('Term start (counters start here)')}<input type="date" value={p.duty.start} onChange={e => update(d => { d.duty.start = e.target.value })} /></label>
        <span className="hint" style={{ flex: 1 }}>{t('Duties are shared out from the term start, so every month continues the counts of the months before it.')}</span>
      </div>
      {!ready ? <div className="card empty">{!slots.length ? t('Add duty places first.') : early ? t('This month is before the term start.') : t('No teacher is marked "On duty".')}</div> : (
        <div className="sheet"><div className="ts">
          <div className="ts-head"><h1>{title}</h1></div>
          <table className="dt">
            <thead><tr><th>{t('Date')}</th>{slots.map((id, j) => <th key={j}>{places.find(x => x.id === id)!.name}</th>)}</tr></thead>
            <tbody>
              {mp.days.map(d => (
                <tr key={d.date}>
                  <td className="dd">{trDate(d.date)} <span>{p.days[d.weekday]}</span></td>
                  {d.special ? <td colSpan={slots.length} className="sp"><s>{d.special}</s></td>
                    : d.row.map((id, j) => <td key={j}>{id ? teacher.get(id) : <span className="badge bad">{t('empty')}</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <h2 className="dt-title">{t('DUTY COUNTERS')}</h2>
          <table className="dt">
            <thead><tr><th>{t('Teacher')}</th>{places.map(pl => <th key={pl.id}>{pl.name}</th>)}<th>{t('Total duties')}</th></tr></thead>
            <tbody>
              {[...mp.counts].map(([id, c]) => (
                <tr key={id}>
                  <td className="dd">{teacher.get(id)}</td>
                  {places.map(pl => <td key={pl.id}>{c[pl.id] ?? 0}</td>)}
                  <td className={`heat-${heat(totalOf(c), min, max)}`}>{totalOf(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div></div>
      )}
    </div>
  )
}
