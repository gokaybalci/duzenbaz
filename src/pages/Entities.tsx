import { useMemo, useState } from 'react'
import { Icon } from '../icons'
import { t } from '../i18n'
import { newId, pickColor, upperName, type Entity, type Project, type Room, type SchoolClass, type Teacher } from '../model'
import { prunePlacements, removeTeacher, update, useProject } from '../store'
import { loadOf, type Kind } from '../timetable'
import { AvailabilityEditor, MiniGrid, Modal, toast } from '../ui'

export type EntityKey = 'subjects' | 'teachers' | 'rooms' | 'classes'

const TITLES: Record<EntityKey, [string, string]> = {
  subjects: ['Subjects', 'subject'],
  teachers: ['Teachers', 'teacher'],
  rooms: ['Rooms', 'room'],
  classes: ['Classes', 'class'],
}
const KIND: Partial<Record<EntityKey, Kind>> = { teachers: 'teacher', rooms: 'room', classes: 'class' }

const UPPER: Partial<Record<EntityKey, true>> = { subjects: true, teachers: true }

function makeEntity(key: EntityKey, p: Project, name: string, short?: string): Entity {
  if (UPPER[key]) name = upperName(name)
  const base: Entity = {
    id: newId(key[0]), name, short: short || autoShort(name), color: pickColor(p[key].length + (key === 'teachers' ? 3 : 0)),
    avail: '1'.repeat(p.days.length * p.periods.length),
  }
  if (key === 'teachers') return { ...base, maxPerDay: 0, maxDays: 0, maxGapsPerDay: -1 } as Teacher
  if (key === 'classes') return { ...base, groups: [] } as SchoolClass
  if (key === 'rooms') return { ...base, capacity: 1 } as Room
  return base
}

const autoShort = (name: string) => {
  const w = name.trim().split(/\s+/)
  return (w.length > 1 ? w.map(x => x[0]).join('') : name.slice(0, 4)).toUpperCase()
}

export function EntitiesPage({ entity }: { entity: EntityKey }) {
  const p = useProject()
  const [q, setQ] = useState('')
  const [newName, setNewName] = useState('')
  const [availFor, setAvailFor] = useState<string | null>(null)
  const [groupsFor, setGroupsFor] = useState<string | null>(null)
  const [paste, setPaste] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: 'name' | 'short' | 'hours'; dir: 1 | -1 } | null>(null)
  const list = p[entity] as Entity[]
  const kind = KIND[entity]
  const [title, singular] = TITLES[entity]

  const hours = useMemo(() => {
    const m = new Map<string, number>()
    if (entity === 'subjects') for (const l of p.lessons) m.set(l.subjectId, (m.get(l.subjectId) ?? 0) + l.split.reduce((a, b) => a + b, 0) * l.classes.length)
    else if (kind) for (const e of list) m.set(e.id, loadOf(p, kind, e.id))
    return m
  }, [p, entity, kind, list])

  const shown = useMemo(() => {
    const s = q.trim().toLocaleLowerCase('tr')
    const out = s ? list.filter(e => (e.name + ' ' + e.short).toLocaleLowerCase('tr').includes(s)) : [...list]
    if (sort) {
      const key = sort.key
      const cmp = key === 'hours' ? (a: Entity, b: Entity) => (hours.get(a.id) ?? 0) - (hours.get(b.id) ?? 0)
        : (a: Entity, b: Entity) => a[key].localeCompare(b[key], 'tr', { numeric: true })
      out.sort((a, b) => cmp(a, b) * sort.dir)
    }
    return out
  }, [list, q, sort, hours])

  const sortBy = (key: 'name' | 'short' | 'hours') => {
    const first = key === 'hours' ? -1 : 1
    setSort(sort?.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: first })
  }
  const sortHead = (key: 'name' | 'short' | 'hours', label: string) => (
    <button className="th-sort" onClick={() => sortBy(key)} title={t('Sort')}>
      {label}{sort?.key === key && <Icon n="down" size={12} className={sort.dir === 1 ? 'flip' : ''} />}
    </button>
  )
  const openSlots = (e: Entity) => e.avail.split('').filter((c, i) => c !== '0' && p.avail[i] !== '0').length * (entity === 'rooms' ? (e as Room).capacity || 1 : 1)

  const add = (names: string[]) => {
    const clean = names.map(n => n.trim()).filter(Boolean)
    if (!clean.length) return
    update(d => {
      for (const line of clean) {
        const [name, short] = line.split('\t')
        ;(d[entity] as Entity[]).push(makeEntity(entity, d as Project, name.trim(), short?.trim()))
      }
    })
    toast(t('{n} added', { n: clean.length }))
  }

  const edit = (id: string, fn: (e: Entity) => void, tag: string) =>
    update(d => { const e = (d[entity] as Entity[]).find(x => x.id === id); if (e) fn(e) }, tag + id)

  const remove = (e: Entity) => {
    const used = p.lessons.filter(l =>
      entity === 'subjects' ? l.subjectId === e.id : entity === 'teachers' ? l.teacherIds.includes(e.id) : entity === 'rooms' ? l.roomIds.includes(e.id) : l.classes.some(c => c.classId === e.id)).length
    if (used && !confirm(t('"{name}" is used in {n} lessons. Delete anyway?', { name: e.name, n: used }) + (entity === 'subjects' || entity === 'classes' ? '\n' + t('Those lessons will be deleted too.') : ''))) return
    update(d => {
      if (entity === 'teachers') return removeTeacher(d, e.id)
      ;(d[entity] as Entity[]).splice((d[entity] as Entity[]).findIndex(x => x.id === e.id), 1)
      if (entity === 'subjects') d.lessons = d.lessons.filter(l => l.subjectId !== e.id)
      if (entity === 'rooms') d.lessons.forEach(l => { l.roomIds = l.roomIds.filter(x => x !== e.id) })
      if (entity === 'classes') {
        d.lessons.forEach(l => { l.classes = l.classes.filter(c => c.classId !== e.id) })
        d.lessons = d.lessons.filter(l => l.classes.length)
      }
      prunePlacements(d)
    })
  }

  const availEntity = list.find(e => e.id === availFor)
  const groupsEntity = (p.classes as SchoolClass[]).find(e => e.id === groupsFor)

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="page-head">
        <h2>{t(title)} <span className="hint" style={{ fontWeight: 400, fontSize: 14 }}>({list.length})</span></h2>
        <input placeholder={t('Search…')} value={q} onChange={e => setQ(e.target.value)} style={{ width: 200 }} />
        <button className="btn" onClick={() => setPaste('')}>{t('Paste list')}</button>
      </div>
      <div className="card pad row">
        <input placeholder={t('New {what} name…', { what: t(singular) })} value={newName} style={{ flex: 1, maxWidth: 360 }}
          onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { add([newName]); setNewName('') } }} autoFocus />
        <button className="btn primary" onClick={() => { add([newName]); setNewName('') }} disabled={!newName.trim()}>+ {t('Add')}</button>
        <span className="hint">{t('Press Enter to add quickly.')}</span>
      </div>

      <div className="card table-wrap">
        {shown.length === 0 ? <div className="empty">{list.length ? t('No matches.') : t('Nothing here yet. Add the first one above.')}</div> : (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>{sortHead('name', t('Name'))}</th>
                <th style={{ width: 110 }}>{sortHead('short', t('Short'))}</th>
                <th style={{ width: 90 }}>{t('Availability')}</th>
                {entity === 'teachers' && <><th className="num" title={t('Max hours per day (0 = no limit)')}>{t('Max/day')}</th><th className="num" title={t('Max days per week (0 = no limit)')}>{t('Max days')}</th><th className="num" title={t('Max idle periods per day (empty = no limit)')}>{t('Max gaps/day')}</th></>}
                {entity === 'classes' && <th>{t('Groups')}</th>}
                {entity === 'rooms' && <th className="num" title={t('How many identical rooms of this kind the school has (e.g. 2 gyms). A lesson needs any one of them.')}>{t('Quantity')}</th>}
                <th className="num">{sortHead('hours', entity === 'subjects' ? t('Total hours') : t('Hours / open'))}</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(e => {
                const h = hours.get(e.id) ?? 0, open = openSlots(e)
                return (
                  <tr key={e.id}>
                    <td><input type="color" value={e.color} onChange={ev => edit(e.id, x => { x.color = ev.target.value }, 'color')} /></td>
                    <td><input value={e.name} onChange={ev => {
                      const el = ev.target, pos = el.selectionStart
                      edit(e.id, x => { x.name = UPPER[entity] ? upperName(el.value) : el.value }, 'name')
                      if (UPPER[entity]) requestAnimationFrame(() => el.setSelectionRange(pos, pos))
                    }} /></td>
                    <td><input value={e.short} onChange={ev => edit(e.id, x => { x.short = ev.target.value }, 'short')} /></td>
                    <td><MiniGrid value={e.avail} days={p.days.length} periods={p.periods.length} onClick={() => setAvailFor(e.id)} /></td>
                    {entity === 'teachers' && (() => {
                      const tt = e as Teacher
                      return <>
                        <td className="num"><input type="number" min={0} value={tt.maxPerDay || ''} placeholder="–" onChange={ev => edit(e.id, x => { (x as Teacher).maxPerDay = Math.max(0, +ev.target.value || 0) }, 'mpd')} /></td>
                        <td className="num"><input type="number" min={0} max={p.days.length} value={tt.maxDays || ''} placeholder="–" onChange={ev => edit(e.id, x => { (x as Teacher).maxDays = Math.max(0, +ev.target.value || 0) }, 'md')} /></td>
                        <td className="num"><input type="number" min={0} value={tt.maxGapsPerDay >= 0 ? tt.maxGapsPerDay : ''} placeholder="–" onChange={ev => edit(e.id, x => { (x as Teacher).maxGapsPerDay = ev.target.value === '' ? -1 : Math.max(0, +ev.target.value) }, 'mg')} /></td>
                      </>
                    })()}
                    {entity === 'rooms' && <td className="num"><input type="number" min={1} max={50} value={(e as Room).capacity || 1} onChange={ev => edit(e.id, x => { (x as Room).capacity = Math.max(1, +ev.target.value || 1) }, 'cap')} /></td>}
                    {entity === 'classes' && (
                      <td>
                        <button className="btn small ghost" onClick={() => setGroupsFor(e.id)}>
                          {(e as SchoolClass).groups.length ? (e as SchoolClass).groups.map(g => g.name).join(', ') : <span className="hint">{t('Whole class')}</span>} <Icon n="edit" />
                        </button>
                      </td>
                    )}
                    <td className="num">
                      {entity === 'subjects' ? h : <span className={`badge ${h > open ? 'bad' : h === 0 ? '' : 'ok'}`} title={h > open ? t('More lesson hours than open slots!') : ''}>{h} / {open}</span>}
                    </td>
                    <td><button className="btn ghost small danger" onClick={() => remove(e)} title={t('Delete')}><Icon n="trash" /></button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {availEntity && (
        <Modal title={<>{t('Availability')}: {availEntity.name}</>} onClose={() => setAvailFor(null)} footer={<button className="btn primary" onClick={() => setAvailFor(null)}>{t('Done')}</button>}>
          <p className="hint" style={{ marginTop: 0 }}>
            {entity === 'teachers' ? t('Mark the times this teacher is NOT at school. Lessons will never be placed there.') : t('Lessons will never be placed in closed slots.')}
          </p>
          <AvailabilityEditor days={p.days} periods={p.periods} value={availEntity.avail} base={p.avail} onChange={g => edit(availEntity.id, x => { x.avail = g }, 'avail')} />
          {entity === 'teachers' && <CopyAvail from={availEntity} list={list} onCopy={ids => update(d => { for (const x of d.teachers) if (ids.includes(x.id)) x.avail = availEntity.avail })} />}
        </Modal>
      )}

      {groupsEntity && <GroupsModal cls={groupsEntity} onClose={() => setGroupsFor(null)} />}

      {paste !== null && (
        <Modal title={t('Paste list')} onClose={() => setPaste(null)}
          footer={<><button className="btn" onClick={() => setPaste(null)}>{t('Cancel')}</button><button className="btn primary" onClick={() => { add(paste.split(/\r?\n/)); setPaste(null) }}>{t('Add')}</button></>}>
          <p className="hint" style={{ marginTop: 0 }}>{t('One per line. You can paste two columns from Excel: name and short name.')}</p>
          <textarea rows={12} style={{ width: '100%' }} value={paste} onChange={e => setPaste(e.target.value)} autoFocus />
        </Modal>
      )}
    </div>
  )
}

function CopyAvail({ from, list, onCopy }: { from: Entity; list: Entity[]; onCopy: (ids: string[]) => void }) {
  const [sel, setSel] = useState<string[]>([])
  const others = list.filter(e => e.id !== from.id)
  if (!others.length) return null
  return (
    <details style={{ marginTop: 12 }}>
      <summary className="hint" style={{ cursor: 'pointer' }}>{t('Copy this availability to other teachers')}</summary>
      <div className="row" style={{ marginTop: 8, maxHeight: 160, overflow: 'auto' }}>
        {others.map(e => (
          <label key={e.id} className="check chip"><input type="checkbox" checked={sel.includes(e.id)} onChange={ev => setSel(ev.target.checked ? [...sel, e.id] : sel.filter(x => x !== e.id))} />{e.name}</label>
        ))}
      </div>
      <button className="btn small" style={{ marginTop: 8 }} disabled={!sel.length} onClick={() => { onCopy(sel); toast(t('Copied to {n}', { n: sel.length })); setSel([]) }}>{t('Copy')}</button>
    </details>
  )
}

function GroupsModal({ cls, onClose }: { cls: SchoolClass; onClose: () => void }) {
  const [name, setName] = useState('')
  const p = useProject()
  const used = (gid: string) => p.lessons.filter(l => l.classes.some(c => c.classId === cls.id && c.groupId === gid)).length
  const editCls = (fn: (c: SchoolClass) => void) => update(d => { const c = d.classes.find(x => x.id === cls.id); if (c) fn(c) }, 'groups' + cls.id)
  return (
    <Modal title={<>{t('Groups')}: {cls.name}</>} onClose={onClose} footer={<button className="btn primary" onClick={onClose}>{t('Done')}</button>}>
      <p className="hint" style={{ marginTop: 0, maxWidth: 520 }}>
        {t('Split a class into groups when part of the class has a different lesson at the same time (e.g. electives, language groups). Lessons of different groups can run in parallel; a whole-class lesson blocks all groups.')}
      </p>
      <div className="stack">
        {cls.groups.map(g => (
          <div key={g.id} className="row">
            <input value={g.name} onChange={e => editCls(c => { c.groups.find(x => x.id === g.id)!.name = e.target.value })} />
            <span className="hint">{t('{n} lessons', { n: used(g.id) })}</span>
            <button className="btn ghost small danger" onClick={() => {
              if (used(g.id) && !confirm(t('Lessons of this group will become whole-class lessons. Continue?'))) return
              update(d => {
                const c = d.classes.find(x => x.id === cls.id)!
                c.groups = c.groups.filter(x => x.id !== g.id)
                d.lessons.forEach(l => l.classes.forEach(cr => { if (cr.classId === cls.id && cr.groupId === g.id) cr.groupId = null }))
              })
            }}><Icon n="trash" /></button>
          </div>
        ))}
        <div className="row">
          <input placeholder={t('New group name…')} value={name} onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { editCls(c => { c.groups.push({ id: newId('g'), name: name.trim() }) }); setName('') } }} />
          <button className="btn" disabled={!name.trim()} onClick={() => { editCls(c => { c.groups.push({ id: newId('g'), name: name.trim() }) }); setName('') }}>+ {t('Add group')}</button>
        </div>
      </div>
    </Modal>
  )
}
