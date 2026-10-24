import { useEffect, useMemo, useState } from 'react'
import {
  DUTY_ROLES, HOURS_WEIGHTS, MONTHS, MONTHS_ACC, allowsRun, cancelDay, logFill, replaceOnLeave, DUTY_SHIFTS, fitsSlot, isDoubleShift, shiftDate, WEEKDAYS, WEEKDAYS_SHORT, buildCsv, buildSheet, currentMonth, dutyDays, dutySlots, fillMonth, hasPlan, heat, monthLabel, monthView,
  roleOf, schoolDays, uncoveredWeeks, schoolYear, shiftMonth, trDate, validDate,
} from '../duty'
import { Icon } from '../icons'
import { PasteList } from './Entities'
import { getLang, t } from '../i18n'
import { colorVars, fileName, newId, pickColor, upperName, type DutyRole, type DutyShift, type Project } from '../model'
import { native } from '../native'
import { removeTeacher, update, useProject } from '../store'
import { navigate } from '../nav'
import { download, Empty, Menu, Modal, PageTitle, toast } from '../ui'
import { loadOf } from '../timetable'
import { xlsx } from '../xlsx'

const fileBase = (p: Project, month: string) => `${fileName(p, 'okul')}_nobet_${month}`
const setMonth = (m: string) => update(d => { d.duty.month = m })
const DMY = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/
const toIso = (s: string) => { const m = DMY.exec(s.trim()); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '' }

function DateInput({ value, onChange }: { value: string; onChange: (iso: string) => void }) {
  const [text, setText] = useState(validDate(value) ? trDate(value) : '')
  const [prev, setPrev] = useState(value)
  if (value !== prev) { setPrev(value); setText(validDate(value) ? trDate(value) : '') }
  const bad = text.trim() !== '' && !validDate(toIso(text))
  return (
    <input value={text} placeholder="gg.aa.yyyy" style={{ width: 120, borderColor: bad ? 'var(--danger)' : undefined }}
      onChange={e => {
        setText(e.target.value)
        const iso = toIso(e.target.value)
        if (validDate(iso)) onChange(iso)
        else if (!e.target.value.trim()) onChange('')
      }} />
  )
}

function MonthPicker({ month }: { month: string }) {
  const [y, m] = month.split('-').map(Number)
  const years = Array.from({ length: 7 }, (_, i) => y - 3 + i)
  return (
    <div className="month-picker">
      <button className="btn" title={t('Previous month')} onClick={() => setMonth(shiftMonth(month, -1))}>‹</button>
      <select value={m} aria-label={t('Month')} onChange={e => setMonth(`${y}-${String(+e.target.value).padStart(2, '0')}`)}>
        {MONTHS.map((n, i) => <option key={i} value={i + 1}>{n}</option>)}
      </select>
      <select value={y} aria-label={t('Year')} onChange={e => setMonth(`${e.target.value}-${String(m).padStart(2, '0')}`)}>
        {years.map(x => <option key={x} value={x}>{x}</option>)}
      </select>
      <button className="btn" title={t('Next month')} onClick={() => setMonth(shiftMonth(month, 1))}>›</button>
    </div>
  )
}

function TeacherStats({ p, id, onClose }: { p: Project; id: string; onClose: () => void }) {
  const te = p.teachers.find(x => x.id === id)!
  const months = schoolYear(currentMonth(p))
  const stored = (month: string) => {
    const c: Record<string, number> = {}
    for (const [date, row] of Object.entries(p.duty.assign)) if (date.startsWith(month))
      for (const [key, tid] of Object.entries(row)) if (tid === id) { const pl = key.split('#')[0]; c[pl] = (c[pl] ?? 0) + 1 }
    return c
  }
  const rows = months.map(m => {
    const auto = hasPlan(p, m), c = stored(m)
    return { m, auto, c, n: auto ? Object.values(c).reduce((a, b) => a + b, 0) : p.duty.manual[id]?.[m] ?? 0 }
  })
  const sum = rows.reduce((a, r) => a + r.n, 0)
  return (
    <Modal title={<>{te.name} – {t('Duty statistics')}</>} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>{t('Done')}</button>}>
      <p className="hint" style={{ marginTop: 0 }}>{t('Months distributed in the program are counted automatically. For earlier months you can type the number of duties by hand.')}</p>
      <table className="data">
        <thead><tr><th>{t('Month')}</th>{p.duty.places.map(pl => <th key={pl.id} className="num">{pl.name}</th>)}<th className="num">{t('Total duties')}</th></tr></thead>
        <tbody>
          {rows.map(({ m, auto, c, n }) => {
            return (
              <tr key={m}>
                <td>{monthLabel(m)}</td>
                {p.duty.places.map(pl => <td key={pl.id} className="num">{auto ? c[pl.id] ?? 0 : ''}</td>)}
                <td className="num">{auto ? <b>{n}</b> : (
                  <input type="number" min={0} max={60} value={n} style={{ width: 70 }} aria-label={monthLabel(m)}
                    onChange={e => update(d => { (d.duty.manual[id] ??= {})[m] = Math.max(0, Math.min(60, +e.target.value || 0)) }, 'manual.' + id + m)} />
                )}</td>
              </tr>
            )
          })}
          <tr><td><b>{t('Total')}</b></td>{p.duty.places.map(pl => <td key={pl.id} />)}<td className="num"><b>{sum}</b></td></tr>
        </tbody>
      </table>
    </Modal>
  )
}

export function DutyTeachersPage() {
  const p = useProject()
  const school = useMemo(() => schoolDays(p), [p])
  const days = dutyDays(p, school)
  const [name, setName] = useState('')
  const [stats, setStats] = useState<string | null>(null)
  const [pasting, setPasting] = useState(false)
  const remove = (id: string, n: string) => {
    const lessons = p.lessons.filter(l => l.teacherIds.includes(id)).length
    const duties = Object.values(p.duty.assign).reduce((a, row) => a + Object.values(row).filter(x => x === id).length, 0)
    if (lessons && !confirm(t('"{name}" is used in {n} lessons. Delete anyway?', { name: n, n: lessons }))) return
    if (!lessons && duties && !confirm(t('"{name}" has {n} duties. Delete anyway?', { name: n, n: duties }))) return
    if (!lessons && !duties && !confirm(t('Delete "{name}"?', { name: n }))) return
    update(d => removeTeacher(d, id))
  }
  const add = () => {
    const n = upperName(name.trim())
    if (!n) return
    update(d => {
      d.teachers.push({
        id: newId('t'), name: n, short: n.split(/\s+/).map(w => w[0]).join(''), color: pickColor(d.teachers.length + 3),
        avail: '1'.repeat(d.days.length * d.periods.length), maxPerDay: 0, maxGapsPerDay: -1,
      })
    })
    setName('')
  }
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <PageTitle title={t('Teachers')} count={p.teachers.length} sub={<>{t('Ticked days come from the timetable (the days a teacher has lessons, or before distributing, the open days of their availability). Duty can be given on every ticked day. Only teachers marked "On duty" get duties. Click a name to see its duty statistics. Preferred days are used whenever possible; with Back-to-back duty unticked, a teacher never gets duty on two days in a row.')} {t('A teacher with a fixed place only gets duty at that place.')}</>} />
        <span className="hint">{t('Back-to-back duty')}:</span>
        <button className="btn small" onClick={() => update(d => { d.duty.consecutive = {} })}><Icon n="check" /> {t('Tick all')}</button>
        <button className="btn small" onClick={() => update(d => { d.duty.consecutive = Object.fromEntries(d.teachers.map(x => [x.id, false])) })}><Icon n="x" /> {t('Untick all')}</button>
        <button className="btn" disabled={!Object.keys(p.duty.days).length} onClick={() => { update(d => { d.duty.days = {} }); toast(t('Days taken from the timetable')) }}>
          <Icon n="undo" /> {t('Take days from the timetable again')}
        </button>
      </div>
      <div className="card pad row">
        <input placeholder={t('New teacher name…')} value={name} style={{ flex: 1, maxWidth: 360 }}
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
        <button className="btn primary" disabled={!name.trim()} onClick={add}>+ {t('Add teacher')}</button>
        <button className="btn" onClick={() => setPasting(true)}>{t('Paste list')}</button>
        <span className="hint">{t('Teachers added or deleted here are also added to or deleted from the timetable module.')}</span>
      </div>
      {p.teachers.length > 0 && (
        <div className="card table-wrap">
          <table className="data">
            <thead><tr><th>{t('Teacher')}</th><th>{t('Role')}</th>{WEEKDAYS_SHORT.map((d, i) => <th key={i} style={{ textAlign: 'center' }} title={WEEKDAYS[i]}>{d}</th>)}<th>{t('Duty preference')}</th>{isDoubleShift(p) && <th>{t('Shift')}</th>}{p.duty.places.length > 0 && <th>{t('Fixed place')}</th>}<th className="num">{t('Lesson hours')}</th><th style={{ textAlign: 'center' }}>{t('Back-to-back duty')}</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {p.teachers.map(te => {
                const role = roleOf(p, te.id), on = days.get(te.id)!, base = school.get(te.id)!
                return (
                  <tr key={te.id} style={{ opacity: role === 'duty' ? 1 : 0.55 }}>
                    <td><button className="link" onClick={() => setStats(te.id)}>{te.name}</button></td>
                    <td>
                      <select value={role} onChange={e => update(d => { d.duty.role[te.id] = e.target.value as DutyRole })}>
                        {DUTY_ROLES.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
                      </select>
                    </td>
                    {WEEKDAYS.map((w, i) => (
                      <td key={i} style={{ textAlign: 'center' }}>
                        <input type="checkbox" aria-label={w} checked={on[i]} onChange={e => update(d => { const a = [...on]; a[i] = e.target.checked; d.duty.days[te.id] = a })} />
                        {on[i] !== !!base[i] && <span className="hint" title={t('Changed by hand')}> *</span>}
                      </td>
                    ))}
                    <td>
                      <div className="pref-days">
                        {WEEKDAYS_SHORT.map((w, i) => {
                          const pick = !!p.duty.prefer[te.id]?.[i] && on[i]
                          return (
                            <button key={i} className={pick ? 'on' : ''} disabled={!on[i]} aria-pressed={pick} title={WEEKDAYS[i]}
                              onClick={() => update(d => { const a = WEEKDAYS.map((_, k) => !!d.duty.prefer[te.id]?.[k] && on[k]); a[i] = !pick; d.duty.prefer[te.id] = a })}>{w}</button>
                          )
                        })}
                      </div>
                    </td>
                    {isDoubleShift(p) && (
                      <td>
                        <select value={p.duty.shift[te.id] ?? ''} aria-label={t('Shift')}
                          onChange={e => update(d => { if (e.target.value) d.duty.shift[te.id] = e.target.value as DutyShift; else delete d.duty.shift[te.id] })}>
                          <option value="">{t('Both shifts')}</option>
                          {DUTY_SHIFTS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
                        </select>
                      </td>
                    )}
                    {p.duty.places.length > 0 && (
                      <td>
                        <select value={p.duty.places.some(x => x.id === p.duty.fixed[te.id]) ? p.duty.fixed[te.id] : ''} aria-label={t('Fixed place')}
                          onChange={e => update(d => { if (e.target.value) d.duty.fixed[te.id] = e.target.value; else delete d.duty.fixed[te.id] })}>
                          <option value="">—</option>
                          {p.duty.places.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
                        </select>
                      </td>
                    )}
                    <td className="num">{loadOf(p, 'teacher', te.id) || ''}</td>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" aria-label={t('Back-to-back duty')} checked={p.duty.consecutive[te.id] !== false}
                        onChange={e => update(d => { if (e.target.checked) delete d.duty.consecutive[te.id]; else d.duty.consecutive[te.id] = false })} />
                    </td>
                    <td><button className="btn ghost small danger" title={t('Delete')} onClick={() => remove(te.id, te.name)}><Icon n="trash" /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {stats && p.teachers.some(x => x.id === stats) && <TeacherStats p={p} id={stats} onClose={() => setStats(null)} />}
      {pasting && <PasteList entity="teachers" onClose={() => setPasting(false)} />}
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
      <div className="page-head"><PageTitle title={t('Duty places')} count={p.duty.places.length} sub={t('Where teachers stand duty, and how many teachers each place needs per day')} /></div>
      <div className="card pad row">
        <input placeholder={t('New duty place…')} value={name} style={{ flex: 1, maxWidth: 360 }} autoFocus
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
        <button className="btn primary" disabled={!name.trim()} onClick={add}>+ {t('Add')}</button>
        <span className="hint">{t('e.g. Garden, Ground floor, 1st floor, Canteen')}</span>
      </div>
      <div className="card table-wrap">
        {!p.duty.places.length ? <Empty icon="door">{t('Nothing here yet. Add the first one above.')}</Empty> : (
          <table className="data">
            <thead><tr><th>{t('Name')}</th><th className="num">{t('Teachers per day')}</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {p.duty.places.map(pl => (
                <tr key={pl.id}>
                  <td><input value={pl.name} onChange={e => update(d => { d.duty.places.find(x => x.id === pl.id)!.name = e.target.value }, 'dp.name')} /></td>
                  <td className="num"><input type="number" min={1} max={9} value={pl.count} style={{ width: 70 }}
                    onChange={e => update(d => { d.duty.places.find(x => x.id === pl.id)!.count = Math.max(1, Math.min(9, +e.target.value || 1)) }, 'dp.count')} /></td>
                  <td><button className="btn ghost small danger" title={t('Delete')} onClick={() => { if (confirm(t('Delete "{name}"?', { name: pl.name }))) update(d => { d.duty.places = d.duty.places.filter(x => x.id !== pl.id); for (const [k, v] of Object.entries(d.duty.fixed)) if (v === pl.id) delete d.duty.fixed[k] }) }}><Icon n="trash" /></button></td>
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
  const ok = validDate(f.from) && f.name.trim() && (!f.to || f.to >= f.from)
  const add = () => {
    if (!ok) return
    update(d => { d.duty.specials.push({ id: newId('h'), from: f.from, to: f.to, name: f.name.trim() }) })
    setF({ from: '', to: '', name: '' })
  }
  const list = [...p.duty.specials].sort((a, b) => a.from.localeCompare(b.from))
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head"><PageTitle title={t('Special days')} count={list.length} sub={t('No duty is given on these days (holidays, bayram). In the Excel table the description is written struck through on those days.')} /></div>
      <div className="card pad stack">
        <div className="row" style={{ alignItems: 'end' }}>
          <label className="field">{t('From')}<DateInput value={f.from} onChange={v => setF(x => ({ ...x, from: v }))} /></label>
          <label className="field">{t('To (optional)')}<DateInput value={f.to} onChange={v => setF(x => ({ ...x, to: v }))} /></label>
          <label className="field" style={{ flex: 1, maxWidth: 360 }}>{t('Description')}
            <input value={f.name} placeholder={t('e.g. Republic Day')} onChange={e => setF({ ...f, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') add() }} />
          </label>
          <button className="btn primary" disabled={!ok} onClick={add}>+ {t('Add')}</button>
        </div>
      </div>
      <div className="card table-wrap">
        {!list.length ? <Empty icon="calendar">{t('Nothing here yet. Add the first one above.')}</Empty> : (
          <table className="data">
            <thead><tr><th>{t('From')}</th><th>{t('To')}</th><th>{t('Description')}</th><th style={{ width: 40 }}></th></tr></thead>
            <tbody>
              {list.map(s => (
                <tr key={s.id}>
                  <td>{trDate(s.from)}</td>
                  <td>{s.to && s.to !== s.from ? trDate(s.to) : ''}</td>
                  <td><input value={s.name} onChange={e => update(d => { d.duty.specials.find(x => x.id === s.id)!.name = e.target.value }, 'sp.name')} /></td>
                  <td><button className="btn ghost small danger" title={t('Delete')} onClick={() => { if (confirm(t('Delete "{name}"?', { name: s.name }))) update(d => { d.duty.specials = d.duty.specials.filter(x => x.id !== s.id) }) }}><Icon n="trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function Counters({ p, v, hl, onPick }: { p: Project; v: ReturnType<typeof monthView>; hl?: string; onPick?: (id: string) => void }) {
  return (
    <>
      <h2 className="dt-title">{t('DUTY COUNTERS')}</h2>
      <table className="dt">
        <thead><tr><th>{t('Teacher')}</th>{p.duty.places.map(pl => <th key={pl.id}>{pl.name}</th>)}<th>{t('Total duties')}</th></tr></thead>
        <tbody>
          {v.duty.map(te => {
            const c = v.counts.get(te.id)!
            return (
              <tr key={te.id}>
                <td className="dd">{onPick ? <button className={`link ${hl === te.id ? 'hl' : ''}`} title={t('Highlight')} onClick={() => onPick(te.id)}>{te.name}</button> : te.name}</td>
                {p.duty.places.map(pl => <td key={pl.id}>{c.places[pl.id] ?? 0}</td>)}
                <td className={`heat-${heat(c.total, v.min, v.max)}`}>{c.total}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

function Signatures({ p, v }: { p: Project; v: ReturnType<typeof monthView> }) {
  const pairs = Array.from({ length: Math.ceil(v.duty.length / 2) }, (_, i) => [v.duty[2 * i], v.duty[2 * i + 1]] as const)
  return (
    <>
      <h2 className="dt-title">{t('NOTIFIED TO')}</h2>
      <table className="dt sig-list">
        <thead><tr>{[0, 1].flatMap(k => [<th key={`n${k}`}>#</th>, <th key={`t${k}`}>{t('Teacher')}</th>, <th key={`s${k}`}>{t('Signature')}</th>])}</tr></thead>
        <tbody>
          {pairs.map(([a, b], i) => (
            <tr key={a.id}>
              <td>{2 * i + 1}</td><td className="dd">{a.name}</td><td />
              {b ? <><td>{2 * i + 2}</td><td className="dd">{b.name}</td><td /></> : <><td /><td /><td /></>}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="signs">
        <div className="sign"><div>{p.school.vice}<br />{t('Vice principal')}</div></div>
        <div className="sign"><div>{p.school.principal}<br />{t('Principal')}</div></div>
      </div>
    </>
  )
}

function Problem({ p }: { p: Project }) {
  if (!p.duty.places.length) return <div className="card"><Empty icon="door" action={<button className="btn primary" onClick={() => navigate('duty-places')}>{t('Add duty places')} <Icon n="right" /></button>}>{t('Add duty places first.')}</Empty></div>
  if (!p.teachers.some(x => roleOf(p, x.id) === 'duty')) return <div className="card"><Empty icon="teacher" action={<button className="btn primary" onClick={() => navigate('duty-teachers')}>{t('Go to Teachers')} <Icon n="right" /></button>}>{t('No teacher is marked "On duty".')}</Empty></div>
  return null
}

export function DutyPlanPage() {
  const p = useProject()
  const month = currentMonth(p)
  const v = useMemo(() => monthView(p, month), [p, month])
  const slots = dutySlots(p)
  const days = useMemo(() => dutyDays(p), [p])
  const duty = v.duty
  const teachers = new Map(p.teachers.map(x => [x.id, x]))
  const locks = Object.keys(p.duty.locked).filter(k => k.startsWith(month)).length
  const filled = v.rows.reduce((n, d) => n + Object.keys(d.row).length, 0) > locks
  const uncovered = useMemo(() => uncoveredWeeks(p, month), [p, month])
  const [hl, setHl] = useState('')
  const [swapFrom, setSwapFrom] = useState<{ date: string; key: string } | null>(null)
  useEffect(() => {
    if (!swapFrom) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSwapFrom(null) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [swapFrom])
  const runs = new Set<string>()
  let empty = 0
  for (const d of v.rows) {
    if (d.special || !duty.some(x => days.get(x.id)![d.weekday])) continue
    for (const s of slots) {
      const id = d.row[s.key]
      if (!id) { if (Object.keys(d.row).length || hasPlan(p, month)) empty++; continue }
      if (!allowsRun(p, id)) for (const n of [shiftDate(d.date, -1), shiftDate(d.date, 1)]) if (Object.values(p.duty.assign[n] ?? {}).includes(id)) runs.add(`${d.date}|${s.key}`)
    }
  }

  const setCell = (date: string, key: string, tid: string) => update(d => {
    const row = (d.duty.assign[date] ??= {})
    if (tid) { row[key] = tid; d.duty.locked[`${date}|${key}`] = true }
    else { delete row[key]; delete d.duty.locked[`${date}|${key}`]; if (!Object.keys(row).length) delete d.duty.assign[date] }
  })
  const swapTo = (date: string, key: string) => {
    const a = swapFrom!
    setSwapFrom(null)
    if (a.date === date && a.key === key) return
    update(d => {
      const ra = (d.duty.assign[a.date] ??= {}), rb = (d.duty.assign[date] ??= {})
      const x = ra[a.key], y = rb[key]
      for (const [row, k, dt, v] of [[ra, a.key, a.date, y], [rb, key, date, x]] as const) {
        if (v) { row[k] = v; d.duty.locked[`${dt}|${k}`] = true } else { delete row[k]; delete d.duty.locked[`${dt}|${k}`] }
      }
      for (const dt of [a.date, date]) if (!Object.keys(d.duty.assign[dt]).length) delete d.duty.assign[dt]
    })
    toast(t('Duties swapped'))
  }
  const replace = (date: string, key: string) => {
    let sub = ''
    update(d => { sub = replaceOnLeave(d, date, key) })
    toast(sub ? t('{name} takes the duty', { name: teachers.get(sub)?.name ?? '' }) : t('No free teacher for this cell'))
  }
  const toggleLock = (date: string, key: string) => update(d => {
    const k = `${date}|${key}`
    if (d.duty.locked[k]) delete d.duty.locked[k]
    else d.duty.locked[k] = true
  })

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head">
        <PageTitle title={t('Distribute duties')} sub={t('Change any cell by picking a teacher; changed cells are locked and Distribute leaves them as they are. Counters continue from the months before.')} />
        <MonthPicker month={month} />
      </div>
      <Problem p={p} />
      {slots.length > 0 && duty.length > 0 && (<>
        <div className="card pad row">
          <button className="btn primary" onClick={() => { update(d => { fillMonth(d, month); logFill(d, month) }); toast(t('{m} distributed', { m: monthLabel(month) })) }}><Icon n="zap" /> {t('Distribute {m}', { m: monthLabel(month) })}</button>
          <button className="btn" disabled={!filled} onClick={() => update(d => { for (const [date, row] of Object.entries(d.duty.assign)) if (date.startsWith(month)) for (const key of Object.keys(row)) d.duty.locked[`${date}|${key}`] = true })}><Icon n="lock" /> {t('Lock every duty')}</button>
          <button className="btn" disabled={!locks} onClick={() => update(d => { for (const k of Object.keys(d.duty.locked)) if (k.startsWith(month)) delete d.duty.locked[k] })}><Icon n="unlock" /> {t('Unlock all')} ({locks})</button>
          <button className="btn danger" disabled={!hasPlan(p, month)} onClick={() => {
            if (!confirm(t('Clear all duties of {m}, including locked ones?', { m: monthLabel(month) }))) return
            update(d => {
              for (const date of Object.keys(d.duty.assign)) if (date.startsWith(month)) delete d.duty.assign[date]
              for (const k of Object.keys(d.duty.locked)) if (k.startsWith(month)) delete d.duty.locked[k]
            })
          }}><Icon n="trash" /> {t('Clear {m}', { m: (getLang() === 'tr' ? MONTHS_ACC : MONTHS)[Number(month.slice(5)) - 1] })}</button>
        </div>
        <div className="card pad row">
          <label className="row" style={{ gap: 6 }}>{t('Lesson load balance')}
            <select value={p.duty.hoursWeight || 0} onChange={e => update(d => { d.duty.hoursWeight = Number(e.target.value) })}>
              {HOURS_WEIGHTS.map(([v, l]) => <option key={v} value={v}>{t(l)}</option>)}
            </select>
          </label>
          <span className="hint" style={{ flex: 1 }}>{t('Teachers with more lesson hours get fewer duties. Takes effect the next time you distribute.')}</span>
          <label className="row" style={{ gap: 6 }}>{t('Highlight')}
            <select value={duty.some(x => x.id === hl) ? hl : ''} onChange={e => setHl(e.target.value)}>
              <option value="">—</option>
              {duty.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        </div>
        {swapFrom && (
          <div className="card pad row swap-bar">
            <Icon n="swap" /> <span style={{ flex: 1 }}>{t('Pick the cell to swap with {date} {place}. Esc cancels.', { date: trDate(swapFrom.date), place: slots.find(s => s.key === swapFrom.key)?.name ?? '' })}</span>
            <button className="btn small" onClick={() => setSwapFrom(null)}><Icon n="x" /> {t('Cancel')}</button>
          </div>
        )}
        {(runs.size > 0 || empty > 0 || uncovered.length > 0) && (
          <div className="card pad stack">
            {runs.size > 0 && <span><span className="badge warn">{runs.size}</span> {t('Back-to-back duty could not be avoided here: no other teacher was free on those days. These cards have a yellow frame.')}</span>}
            {uncovered.length > 0 && (
              <details className="notice">
                <summary>
                  <span className="badge warn">{new Set(uncovered.flatMap(w => w.teachers)).size}</span> {t('{n} teachers have no duty in {w} weeks: those weeks have fewer free places than teachers.', { n: new Set(uncovered.flatMap(w => w.teachers)).size, w: uncovered.length })}
                  <span className="more">{t('Details')}</span>
                </summary>
                <ul>
                  {uncovered.map(w => <li key={w.from}><b>{trDate(w.from)}–{trDate(w.to)}</b> {w.teachers.map(id => teachers.get(id)?.name).join(', ')}</li>)}
                </ul>
              </details>
            )}
            {empty > 0 && <span><span className="badge bad">{empty}</span> {t('Empty cells: no ticked teacher is free on that day. Tick more days on the Teachers tab or fill them by hand.')}</span>}
          </div>
        )}
        <div className="card table-wrap">
          <table className="tt duty-tt">
            <thead><tr><th className="ph">{t('Date')}</th>{slots.map(s => <th key={s.key}>{s.name}</th>)}</tr></thead>
            <tbody>
              {v.rows.map(d => {
                const filled = Object.keys(d.row).length > 0
                const off = !d.special && !filled && !duty.some(x => days.get(x.id)![d.weekday])
                const ids = Object.values(d.row), twice = new Set(ids.filter((x, i) => ids.indexOf(x) !== i))
                return (
                  <tr key={d.date}>
                    <th className="ph">
                      {!d.special && !off && (
                        <Menu className="btn ghost small" label="…">
                          {close => <>
                            {slots.filter(s => d.row[s.key]).map(s => (
                              <button key={s.key} onClick={() => { close(); replace(d.date, s.key) }}>{t('{name} is on leave: give it to the teacher with the fewest duties', { name: teachers.get(d.row[s.key])?.name ?? '' })}</button>
                            ))}
                            {filled && <hr />}
                            <button onClick={() => { close(); update(x => cancelDay(x, d.date, t('Snow holiday'))) }}>{t('Snow holiday: this day\'s duties are not counted')}</button>
                          </>}
                        </Menu>
                      )}
                      {trDate(d.date)}<small>{WEEKDAYS[d.weekday]}</small>
                    </th>
                    {d.special && !filled ? <td colSpan={slots.length} className="closed sp"><s>{d.special}</s></td>
                      : off ? <td colSpan={slots.length} className="closed" />
                        : slots.map(s => {
                          const cur = d.row[s.key] ?? '', locked = !!p.duty.locked[`${d.date}|${s.key}`], te = teachers.get(cur)
                          const options = duty.filter(x => (days.get(x.id)![d.weekday] && fitsSlot(p, x.id, s.key)) || x.id === cur)
                          const src = swapFrom?.date === d.date && swapFrom.key === s.key
                          return (
                            <td key={s.key}>
                              <div className={`tcard ${twice.has(cur) ? 'clash' : ''} ${cur ? '' : 'none'} ${runs.has(`${d.date}|${s.key}`) ? 'run' : ''} ${cur && cur === hl ? 'hl' : ''} ${src ? 'swap-src' : ''}`} style={colorVars(te?.color, 0.14) as React.CSSProperties}>
                                <b>{te?.name ?? '—'}</b>
                                <span>{s.name}{cur ? ` · ${v.counts.get(cur)?.total ?? 0}` : ''}</span>
                                <select value={cur} onChange={e => setCell(d.date, s.key, e.target.value)} aria-label={`${trDate(d.date)} ${s.name}`}>
                                  <option value="">—</option>
                                  {options.map(x => <option key={x.id} value={x.id}>{x.name} ({v.counts.get(x.id)!.total})</option>)}
                                </select>
                                {cur && <button className="lock" title={locked ? t('Unlock') : t('Lock')} onClick={() => toggleLock(d.date, s.key)}><Icon n={locked ? 'lock' : 'unlock'} size={12} /></button>}
                                {cur && !swapFrom && <button className="swap" title={t('Swap with another cell')} aria-label={t('Swap with another cell')} onClick={() => setSwapFrom({ date: d.date, key: s.key })}><Icon n="swap" size={12} /></button>}
                                {swapFrom && !src && <button className="swap-target" aria-label={t('Swap here')} title={t('Swap here')} onClick={() => swapTo(d.date, s.key)} />}
                                {src && <button className="swap-target" aria-label={t('Cancel')} title={t('Cancel')} onClick={() => setSwapFrom(null)} />}
                              </div>
                            </td>
                          )
                        })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="sheet"><div className="ts"><Counters p={p} v={v} hl={hl} onPick={id => setHl(x => (x === id ? '' : id))} /></div></div>
        <details className="card pad no-print">
          <summary className="hint" style={{ cursor: 'pointer' }}>{t('Duty log')} ({p.duty.log.length})</summary>
          {!p.duty.log.length ? <p className="hint">{t('Distributions, sick-leave changes and snow holidays are noted here.')}</p>
            : <ul className="duty-log">{p.duty.log.map((line, i) => <li key={i}>{line}</li>)}</ul>}
        </details>
      </>)}
    </div>
  )
}

export function DutyPrintPage() {
  const p = useProject()
  const month = currentMonth(p)
  const v = useMemo(() => monthView(p, month), [p, month])
  const slots = dutySlots(p)
  const teacher = new Map(p.teachers.map(x => [x.id, x.name]))
  const title = `${p.school.name || t('School')} – ${t('Duty roster')} – ${monthLabel(month)}`
  const ready = slots.length > 0 && v.duty.length > 0 && hasPlan(p, month)
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head no-print">
        <PageTitle title={t('Print & share')} sub={t("Print the month's duty roster or save it as Excel")} />
        <MonthPicker month={month} />
      </div>
      <div className="card pad row no-print">
        <button className="btn primary" disabled={!ready} onClick={() => window.print()}><Icon n="printer" /> {t('Print / Save as PDF')}</button>
        <button className="btn" disabled={!ready} onClick={() => download(fileBase(p, month) + '.xlsx', xlsx(buildSheet(p, month, title)), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}>
          <Icon n="download" /> {native ? t('Save Excel') : t('Download Excel')}
        </button>
        <button className="btn" disabled={!ready} onClick={() => download(fileBase(p, month) + '.csv', buildCsv(p, month), 'text/csv')}><Icon n="download" /> {t('Excel (CSV)')}</button>
      </div>
      <div className="no-print"><Problem p={p} /></div>
      {slots.length > 0 && v.duty.length > 0 && !hasPlan(p, month) && <div className="card no-print"><Empty icon="zap" action={<button className="btn primary" onClick={() => navigate('duty-plan')}>{t('Go to Distribute duties')} <Icon n="right" /></button>}>{t('This month has not been distributed yet. Use Distribute duties first.')}</Empty></div>}
      {ready && (
        <div className="sheet"><div className="ts">
          <div className="ts-head"><h1>{title}</h1></div>
          <table className="dt">
            <thead><tr><th>{t('Date')}</th>{slots.map(s => <th key={s.key}>{s.name}</th>)}</tr></thead>
            <tbody>
              {v.rows.map(d => (
                <tr key={d.date}>
                  <td className="dd">{trDate(d.date)} <span>{WEEKDAYS[d.weekday]}</span></td>
                  {d.special && !Object.keys(d.row).length ? <td colSpan={slots.length} className="sp"><s>{d.special}</s></td>
                    : slots.map(s => <td key={s.key}>{teacher.get(d.row[s.key]) ?? ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <Counters p={p} v={v} />
          <Signatures p={p} v={v} />
        </div></div>
      )}
    </div>
  )
}
