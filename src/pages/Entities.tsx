import { useMemo, useState } from 'react'
import { Icon, type IconName } from '../icons'
import { t } from '../i18n'
import { fillTeachers, importStudents, newId, removeStudent, syncClassGroups, parseSplit, pickColor, setStudentTeacher, splitLabel, syncGroupLessons, teachersOf, upperName, type Entity, type Project, type Room, type SchoolClass, type Teacher } from '../model'
import { prunePlacements, removeTeacher, update, useProject } from '../store'
import { loadOf, type Kind } from '../timetable'
import { AvailabilityEditor, ChipSelect, Empty, MiniGrid, Modal, PageTitle, toast } from '../ui'

export type EntityKey = 'subjects' | 'teachers' | 'rooms' | 'classes'

const TITLES: Record<EntityKey, [string, string]> = {
  subjects: ['Subjects', 'subject'],
  teachers: ['Teachers', 'teacher'],
  rooms: ['Rooms', 'room'],
  classes: ['Classes', 'class'],
}
const ICONS: Record<EntityKey, IconName> = { subjects: 'book', teachers: 'teacher', rooms: 'door', classes: 'users' }
const SUBS: Record<EntityKey, string> = {
  subjects: 'What is taught',
  teachers: 'Who teaches, and when they are at school',
  rooms: 'Optional: labs, gyms and other special rooms',
  classes: 'Classes and their groups',
}
const KIND: Partial<Record<EntityKey, Kind>> = { teachers: 'teacher', rooms: 'room', classes: 'class' }

const UPPER: Partial<Record<EntityKey, true>> = { subjects: true, teachers: true }

function makeEntity(key: EntityKey, p: Project, name: string, short?: string): Entity {
  if (UPPER[key]) name = upperName(name)
  const base: Entity = {
    id: newId(key[0]), name, short: short || autoShort(name), color: pickColor(p[key].length + (key === 'teachers' ? 3 : 0)),
    avail: '1'.repeat(p.days.length * p.periods.length),
  }
  if (key === 'teachers') return { ...base, maxPerDay: 0, maxGapsPerDay: -1 } as Teacher
  if (key === 'classes') return { ...base, groups: [] } as SchoolClass
  if (key === 'rooms') return { ...base, capacity: 1 } as Room
  return base
}

const autoShort = (name: string) => {
  const w = name.trim().split(/\s+/)
  return (w.length > 1 ? w.map(x => x[0]).join('') : name.slice(0, 4)).toUpperCase()
}

function addEntities(entity: EntityKey, names: string[]) {
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

export function PasteList({ entity, onClose }: { entity: EntityKey; onClose: () => void }) {
  const [text, setText] = useState('')
  return (
    <Modal title={t('Paste list')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn primary" onClick={() => { addEntities(entity, text.split(/\r?\n/)); onClose() }}>{t('Add')}</button></>}>
      <p className="hint" style={{ marginTop: 0 }}>{t('One per line. You can paste two columns from Excel: name and short name.')}</p>
      <textarea rows={12} style={{ width: '100%' }} value={text} onChange={e => setText(e.target.value)} autoFocus />
    </Modal>
  )
}

export function EntitiesPage({ entity }: { entity: EntityKey }) {
  const p = useProject()
  const [q, setQ] = useState('')
  const [newName, setNewName] = useState('')
  const [availFor, setAvailFor] = useState<string | null>(null)
  const [groupsFor, setGroupsFor] = useState<string | null>(null)
  const [studentsFor, setStudentsFor] = useState<string | null>(null)
  const [paste, setPaste] = useState(false)
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

  const add = (names: string[]) => addEntities(entity, names)

  const edit = (id: string, fn: (e: Entity) => void, tag: string) =>
    update(d => { const e = (d[entity] as Entity[]).find(x => x.id === id); if (e) fn(e) }, tag + id)

  const remove = (e: Entity) => {
    const used = p.lessons.filter(l =>
      entity === 'subjects' ? l.subjectId === e.id : entity === 'teachers' ? l.teacherIds.includes(e.id) : entity === 'rooms' ? l.roomIds.includes(e.id) : l.classes.some(c => c.classId === e.id)).length
    if (used && !confirm(t('"{name}" is used in {n} lessons. Delete anyway?', { name: e.name, n: used }) + (entity === 'subjects' || entity === 'classes' ? '\n' + t('Those lessons will be deleted too.') : ''))) return
    update(d => {
      if (entity === 'teachers') return removeTeacher(d, e.id)
      ;(d[entity] as Entity[]).splice((d[entity] as Entity[]).findIndex(x => x.id === e.id), 1)
      if (entity === 'subjects') {
        d.lessons = d.lessons.filter(l => l.subjectId !== e.id)
        d.teachers.forEach(x => { if (x.subjectIds) x.subjectIds = x.subjectIds.filter(s => s !== e.id) })
        for (const c of d.classes) { for (const g of c.groups) if (g.subjectId === e.id) delete g.subjectId; syncClassGroups(d as Project, c.id) }
      }
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
        <PageTitle title={t(title)} count={list.length} sub={t(SUBS[entity])} />
        <input placeholder={t('Search…')} value={q} onChange={e => setQ(e.target.value)} style={{ width: 200 }} />
        <button className="btn" onClick={() => setPaste(true)}>{t('Paste list')}</button>
        {entity === 'classes' && <button className="btn" onClick={() => setStudentsFor('')}>{t('Paste student list')}</button>}
      </div>
      <div className="card pad row">
        <input placeholder={t('New {what} name…', { what: t(singular) })} value={newName} style={{ flex: 1, maxWidth: 360 }}
          onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { add([newName]); setNewName('') } }} autoFocus />
        <button className="btn primary" onClick={() => { add([newName]); setNewName('') }} disabled={!newName.trim()}>+ {t('Add')}</button>
        <span className="hint">{t('Press Enter to add quickly.')}</span>
      </div>

      <div className="card table-wrap">
        {shown.length === 0 ? <Empty icon={list.length ? 'x' : ICONS[entity]}>{list.length ? t('No matches.') : t('Nothing here yet. Add the first one above.')}</Empty> : (
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 40 }}></th>
                <th style={{ minWidth: 170 }}>{sortHead('name', t('Name'))}</th>
                <th style={{ width: 110 }}>{sortHead('short', t('Short'))}</th>
                <th style={{ width: 90 }}>{t('Availability')}</th>
                {entity === 'teachers' && <th title={t('Subjects this teacher teaches. If a subject has only one teacher, new lessons of it get that teacher automatically.')}>{t('Teaches')}</th>}
                {entity === 'teachers' && <><th className="num" title={t('Max hours per day (0 = no limit)')}>{t('Max/day')}</th><th className="num" title={t('Max idle periods per day (empty = no limit)')}>{t('Max gaps/day')}</th></>}
                {entity === 'classes' && <><th className="num">{t('Students')}</th><th>{t('Groups')}</th></>}
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
                    {entity === 'teachers' && <td><ChipSelect items={p.subjects} value={(e as Teacher).subjectIds ?? []} placeholder={t('+ subject…')}
                      onChange={v => { let n = 0; update(d => { d.teachers.find(x => x.id === e.id)!.subjectIds = v; n = fillTeachers(d as Project) }); if (n) toast(t('{n} lessons without a teacher got this teacher', { n })) }} /></td>}
                    {entity === 'teachers' && (() => {
                      const tt = e as Teacher
                      return <>
                        <td className="num"><input type="number" min={0} value={tt.maxPerDay || ''} placeholder="–" onChange={ev => edit(e.id, x => { (x as Teacher).maxPerDay = Math.max(0, +ev.target.value || 0) }, 'mpd')} /></td>
                        <td className="num"><input type="number" min={0} value={tt.maxGapsPerDay >= 0 ? tt.maxGapsPerDay : ''} placeholder="–" onChange={ev => edit(e.id, x => { (x as Teacher).maxGapsPerDay = ev.target.value === '' ? -1 : Math.max(0, +ev.target.value) }, 'mg')} /></td>
                      </>
                    })()}
                    {entity === 'rooms' && <td className="num"><input type="number" min={1} max={50} value={(e as Room).capacity || 1} onChange={ev => edit(e.id, x => { (x as Room).capacity = Math.max(1, +ev.target.value || 1) }, 'cap')} /></td>}
                    {entity === 'classes' && <td className="num"><button className="btn small ghost" onClick={() => setStudentsFor(e.id)}>{(e as SchoolClass).students?.length ?? 0} <Icon n="edit" /></button></td>}
                    {entity === 'classes' && (
                      <td>
                        <button className="btn small ghost" onClick={() => setGroupsFor(e.id)}>
                          {(e as SchoolClass).groups.length ? (e as SchoolClass).groups.filter(g => !g.parent).map(g => g.name).join(', ') : <span className="hint">{t('Whole class')}</span>} <Icon n="edit" />
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
      {studentsFor !== null && <StudentsModal cls={(p.classes as SchoolClass[]).find(e => e.id === studentsFor)} onClose={() => setStudentsFor(null)} />}

      {paste && <PasteList entity={entity} onClose={() => setPaste(false)} />}
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
  const cols = cls.groups.filter(g => !g.parent)
  const used = (gid: string) => p.lessons.filter(l => l.classes.some(c => c.classId === cls.id && (c.groupId === gid || cls.groups.some(k => k.parent === gid && k.id === c.groupId)))).length
  const editCls = (fn: (c: SchoolClass) => void) => update(d => { const c = d.classes.find(x => x.id === cls.id); if (c) fn(c) }, 'groups' + cls.id)
  const editGroup = (gid: string, fn: (g: SchoolClass['groups'][number], c: SchoolClass) => void, tag = '') =>
    update(d => { const c = d.classes.find(x => x.id === cls.id); const g = c?.groups.find(x => x.id === gid); if (c && g) { fn(g, c); syncGroupLessons(d as Project, cls.id, gid); prunePlacements(d) } }, tag && tag + gid)
  const teacherOptions = (sid: string | undefined) => { const own = sid ? teachersOf(p, sid) : []; return own.length ? own : p.teachers }
  return (
    <Modal title={<>{t('Groups')}: {cls.name}</>} onClose={onClose} wide footer={<button className="btn primary" onClick={onClose}>{t('Done')}</button>}>
      <p className="hint" style={{ marginTop: 0, maxWidth: 560 }}>
        {t('Split a class into groups when part of the class has a different lesson at the same time (e.g. electives, language groups). Lessons of different groups can run in parallel; a whole-class lesson blocks all groups.')}
      </p>
      {!!cls.students?.length && <p className="hint" style={{ maxWidth: 560 }}>{t("Give each group its subject and hours, then pick each student's teacher below. Every teacher's students get their own lesson; the lessons of one group run at the same time. Groups that share a student never run at the same time.")}</p>}
      <div className="stack">
        {cols.map(g => (
          <div key={g.id} className="row">
            <input value={g.name} aria-label={t('Group')} onChange={e => editGroup(g.id, (x, c) => {
              x.name = e.target.value
              for (const k of c.groups) if (k.parent === x.id) { const te = p.teachers.find(y => y.id === k.teacherId); k.name = `${x.name} · ${te?.short || te?.name || ''}` }
            }, 'gname')} />
            {!!cls.students?.length && <>
              <select aria-label={t('Subject')} value={g.subjectId ?? ''} onChange={e => editGroup(g.id, x => { x.subjectId = e.target.value || undefined })}>
                <option value="">{t('Subject…')}</option>
                {p.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <SplitInput value={g.split ?? [2]} onChange={v => editGroup(g.id, x => { x.split = v }, 'gsplit')} />
            </>}
            <span className="hint">{t('{n} lessons', { n: used(g.id) })}</span>
            <button className="btn ghost small danger" onClick={() => {
              if (used(g.id) && !confirm(t('Lessons of this group will become whole-class lessons. Continue?'))) return
              update(d => {
                const c = d.classes.find(x => x.id === cls.id)!
                const kids = new Set(c.groups.filter(x => x.parent === g.id).map(x => x.id))
                d.lessons = d.lessons.filter(l => !l.classes.some(cr => cr.classId === cls.id && cr.groupId && kids.has(cr.groupId)))
                c.groups = c.groups.filter(x => x.id !== g.id && !kids.has(x.id))
                d.lessons.forEach(l => l.classes.forEach(cr => { if (cr.classId === cls.id && cr.groupId === g.id) cr.groupId = null }))
                prunePlacements(d)
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
      {!!cls.students?.length && !!cols.length && (
        <div className="table-wrap scroll-box" style={{ marginTop: 12, maxHeight: 420, overflow: 'auto' }}>
          <table className="data">
            <thead><tr><th>{t('Student')}</th>{cols.map(g => (
              <th key={g.id}>
                <div>{g.name}</div>
                <select aria-label={t('All students') + ' – ' + g.name} value="" disabled={!g.subjectId} style={{ fontWeight: 'normal' }}
                  onChange={e => update(d => {
                    const v = e.target.value
                    const c = d.classes.find(x => x.id === cls.id)!
                    for (const st of c.students ?? []) {
                      const has = c.groups.some(k => k.parent === g.id && k.students?.includes(st.id))
                      if (v === '-' ? has : !has) setStudentTeacher(d as Project, cls.id, g.id, st.id, v === '-' ? '' : v)
                    }
                    prunePlacements(d)
                  })}>
                  <option value="">{t('All students…')}</option>
                  {teacherOptions(g.subjectId).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  <option value="-">{t('Clear all')}</option>
                </select>
              </th>
            ))}</tr></thead>
            <tbody>
              {cls.students.map(st => (
                <tr key={st.id}>
                  <td>{st.no} {st.name}</td>
                  {cols.map(g => {
                    const cur = cls.groups.find(k => k.parent === g.id && k.students?.includes(st.id))?.teacherId ?? ''
                    return (
                      <td key={g.id}>
                        <select aria-label={`${st.name} – ${g.name}`} value={cur} disabled={!g.subjectId} title={g.subjectId ? '' : t('Choose the subject of this group first')}
                          onChange={e => update(d => { setStudentTeacher(d as Project, cls.id, g.id, st.id, e.target.value); prunePlacements(d) })}>
                          <option value="">–</option>
                          {teacherOptions(g.subjectId).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

function SplitInput({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(splitLabel(value))
  const ok = parseSplit(text)
  return <input aria-label={t('Hours')} title={t('Hours')} value={text} style={{ width: 70, borderColor: ok ? undefined : 'var(--danger)' }}
    onChange={e => { setText(e.target.value); const v = parseSplit(e.target.value); if (v) onChange(v) }} />
}

function StudentsModal({ cls, onClose }: { cls?: SchoolClass; onClose: () => void }) {
  const [text, setText] = useState('')
  const add = () => {
    let added = 0, skipped = 0
    update(d => { ({ added, skipped } = importStudents(d as Project, text, cls?.id)) })
    toast(t('{n} added', { n: added }) + (skipped ? ' · ' + t('{n} rows without a class skipped', { n: skipped }) : ''))
    setText('')
  }
  const remove = (id: string) => update(d => { removeStudent(d as Project, cls!.id, id); prunePlacements(d) })
  return (
    <Modal title={cls ? <>{t('Students')}: {cls.name}</> : t('Paste student list')} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>{t('Done')}</button><button className="btn primary" disabled={!text.trim()} onClick={add}>{t('Add')}</button></>}>
      {!!cls?.students?.length && (
        <div className="table-wrap scroll-box" style={{ maxHeight: 260, overflow: 'auto', marginBottom: 12 }}>
          <table className="data">
            <thead><tr><th className="num">{t('No')}</th><th>{t('Name')}</th><th>{t('Groups')}</th><th style={{ width: 50 }}></th></tr></thead>
            <tbody>
              {cls.students.map(st => (
                <tr key={st.id}>
                  <td className="num">{st.no}</td>
                  <td>{st.name}</td>
                  <td className="hint">{cls.groups.filter(g => g.students?.includes(st.id) && !cls.groups.some(k => k.parent === g.id)).map(g => g.name).join(', ')}</td>
                  <td><button className="btn ghost small danger" onClick={() => remove(st.id)} title={t('Delete')}><Icon n="trash" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="hint" style={{ marginTop: 0, maxWidth: 520 }}>
        {t('Paste from Excel or a CSV file, one student per row. Columns may be class, number and name in any order; header rows are skipped.')}
        {' '}{cls ? t('Rows without a class column go to this class.') : t('Classes that do not exist yet are created.')}
      </p>
      <textarea rows={10} style={{ width: '100%' }} value={text} onChange={e => setText(e.target.value)} autoFocus />
    </Modal>
  )
}
