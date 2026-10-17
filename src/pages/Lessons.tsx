import { useMemo, useState } from 'react'
import { Icon } from '../icons'
import { t } from '../i18n'
import { defaultSplit, lessonHours, newId, parseSplit, splitLabel, type ClassRef, type Lesson, type Project } from '../model'
import { prunePlacements, update, useProject } from '../store'
import { classLabel, loadOf, names } from '../timetable'
import { ChipSelect, Modal, toast } from '../ui'

type Filter = { kind: 'all' } | { kind: 'class' | 'teacher'; id: string }

const refKey = (c: ClassRef) => `${c.classId}|${c.groupId ?? ''}`
const fromKey = (k: string): ClassRef => { const [classId, g] = k.split('|'); return { classId, groupId: g || null } }

function blankLesson(f: Filter): Lesson {
  return {
    id: newId('l'), subjectId: '', teacherIds: f.kind === 'teacher' ? [f.id] : [], roomIds: [],
    classes: f.kind === 'class' ? [{ classId: f.id, groupId: null }] : [], split: [2], sameDayOk: false, link: '',
  }
}

export function LessonsPage() {
  const p = useProject()
  const [filter, setFilter] = useState<Filter>({ kind: 'all' })
  const [draft, setDraft] = useState<Lesson>(() => blankLesson({ kind: 'all' }))
  const [editing, setEditing] = useState<Lesson | null>(null)
  const [copyOf, setCopyOf] = useState<Lesson[] | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const n = useMemo(() => names(p), [p])

  const shown = useMemo(() => p.lessons.filter(l =>
    filter.kind === 'all' ? true : filter.kind === 'class' ? l.classes.some(c => c.classId === filter.id) : l.teacherIds.includes(filter.id)), [p.lessons, filter])

  const choose = (f: Filter) => { setFilter(f); setDraft(blankLesson(f)); setSel(new Set()) }
  const picked = shown.filter(l => sel.has(l.id))
  const toggle = (id: string, on: boolean) => { const s = new Set(sel); if (on) s.add(id); else s.delete(id); setSel(s) }
  const delPicked = () => {
    if (!confirm(t('Delete {n} selected lessons?', { n: picked.length }))) return
    update(d => { d.lessons = d.lessons.filter(l => !sel.has(l.id)); prunePlacements(d) })
    setSel(new Set())
  }
  const valid = (l: Lesson) => l.subjectId && l.classes.length && l.split.length

  const add = () => {
    if (!valid(draft)) return
    update(d => { d.lessons.push({ ...draft, id: newId('l') }) })
    toast(t('Lesson added'))
    setDraft({ ...blankLesson(filter), classes: draft.classes, teacherIds: filter.kind === 'teacher' ? draft.teacherIds : [] })
  }

  const del = (id: string) => update(d => { d.lessons = d.lessons.filter(l => l.id !== id); prunePlacements(d) })
  const dup = (l: Lesson) => update(d => { d.lessons.splice(d.lessons.findIndex(x => x.id === l.id) + 1, 0, { ...structuredClone(l), id: newId('l') }) })

  const total = filter.kind === 'all' ? shown.reduce((a, l) => a + lessonHours(l), 0) : loadOf(p, filter.kind, filter.id)
  const S = p.days.length * p.periods.length

  return (
    <div className="split">
      <div className="card" style={{ padding: 8 }}>
        <div className="list">
          <button className={filter.kind === 'all' ? 'active' : ''} onClick={() => choose({ kind: 'all' })}>{t('All lessons')}<span className="meta">{p.lessons.length}</span></button>
          <div className="hint" style={{ padding: '10px 10px 4px' }}>{t('Classes')}</div>
          {p.classes.map(c => {
            const h = loadOf(p, 'class', c.id)
            return (
              <button key={c.id} className={filter.kind === 'class' && filter.id === c.id ? 'active' : ''} onClick={() => choose({ kind: 'class', id: c.id })}>
                <span className="dot" style={{ background: c.color }} />{c.name}<span className="meta">{h} {t('h')}</span>
              </button>
            )
          })}
          <div className="hint" style={{ padding: '10px 10px 4px' }}>{t('Teachers')}</div>
          {p.teachers.map(c => (
            <button key={c.id} className={filter.kind === 'teacher' && filter.id === c.id ? 'active' : ''} onClick={() => choose({ kind: 'teacher', id: c.id })}>
              <span className="dot" style={{ background: c.color }} />{c.name}<span className="meta">{loadOf(p, 'teacher', c.id)} {t('h')}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="stack" style={{ gap: 14, minWidth: 0 }}>
        <div className="page-head">
          <h2>
            {filter.kind === 'all' ? t('Lessons') : filter.kind === 'class' ? n.class.get(filter.id)?.name : n.teacher.get(filter.id)?.name}
            <span className="hint" style={{ fontWeight: 400, fontSize: 14, marginLeft: 8 }}>{t('{n} lessons · {h} hours/week', { n: shown.length, h: total })}{filter.kind === 'class' ? ` / ${S}` : ''}</span>
          </h2>
          {filter.kind === 'class' && shown.length > 0 && <button className="btn" onClick={() => setCopyOf(shown)}>{t('Copy lessons to other classes…')}</button>}
        </div>

        {(!p.subjects.length || !p.classes.length) && <div className="card pad hint">{t('Add subjects, classes and teachers first. Then define which lessons each class takes here.')}</div>}

        {filter.kind === 'teacher' && <TeacherAssign p={p} teacherId={filter.id} />}

        <div className="card pad stack">
          <h3>{filter.kind === 'teacher' ? t('Other lesson (several classes or teachers together)') : t('Add lesson')}</h3>
          <LessonForm p={p} value={draft} onChange={setDraft} />
          <div className="row">
            <button className="btn primary" disabled={!valid(draft)} onClick={add}>+ {t('Add lesson')}</button>
            {!valid(draft) && <span className="hint">{t('Pick at least a class and a subject.')}</span>}
          </div>
        </div>

        <div className="card table-wrap">
          {shown.length === 0 ? <div className="empty">{t('No lessons yet.')}</div> : (<>
            <div className="row" style={{ padding: '8px 10px', borderBottom: '1px solid var(--line)' }}>
              <label className="check"><input type="checkbox" checked={picked.length === shown.length} onChange={e => setSel(new Set(e.target.checked ? shown.map(l => l.id) : []))} />{t('Select all')}</label>
              <button className="btn small" disabled={!picked.length} onClick={() => setCopyOf(picked)}><Icon n="copy" /> {t('Copy')}</button>
              <button className="btn small danger" disabled={!picked.length} onClick={delPicked}><Icon n="trash" /> {t('Delete')}</button>
              {picked.length > 0 && <span className="hint">{t('{n} selected', { n: picked.length })}</span>}
            </div>
            <table className="data">
              <thead><tr><th style={{ width: 28 }}></th><th>{t('Class')}</th><th>{t('Subject')}</th><th>{t('Teacher')}</th>{p.useRooms && <th>{t('Room')}</th>}<th className="num">{t('Hours')}</th><th>{t('Blocks')}</th><th>{t('Parallel link')}</th><th style={{ width: 120 }}></th></tr></thead>
              <tbody>
                {shown.map(l => {
                  const s = n.subject.get(l.subjectId)
                  return (
                    <tr key={l.id} onDoubleClick={() => setEditing(structuredClone(l))}>
                      <td><input type="checkbox" aria-label={t('Select')} checked={sel.has(l.id)} onChange={e => toggle(l.id, e.target.checked)} /></td>
                      <td>{l.classes.map(c => classLabel(n, c, false)).join(', ')}</td>
                      <td><span className="chip"><span className="dot" style={{ background: s?.color }} />{s?.name ?? '?'}</span></td>
                      <td>{l.teacherIds.map(x => n.teacher.get(x)?.name ?? '?').join(', ') || <span className="badge warn">{t('none')}</span>}</td>
                      {p.useRooms && <td>{l.roomIds.filter(x => n.room.has(x)).map(x => n.room.get(x)?.name).join(', ')}</td>}
                      <td className="num">{lessonHours(l)}</td>
                      <td>{splitLabel(l.split)}{l.sameDayOk && <span className="hint"> ({t('same day ok')})</span>}</td>
                      <td>{l.link && <span className="chip"><Icon n="link" /> {l.link}</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn ghost small" onClick={() => setEditing(structuredClone(l))} title={t('Edit')}><Icon n="edit" /></button>
                        <button className="btn ghost small" onClick={() => dup(l)} title={t('Duplicate')}><Icon n="copy" /></button>
                        <button className="btn ghost small danger" onClick={() => del(l.id)} title={t('Delete')}><Icon n="trash" /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </>)}
        </div>
      </div>

      {editing && (
        <Modal title={t('Edit lesson')} onClose={() => setEditing(null)} wide
          footer={<>
            <button className="btn" onClick={() => setEditing(null)}>{t('Cancel')}</button>
            <button className="btn primary" disabled={!valid(editing)} onClick={() => {
              update(d => { const i = d.lessons.findIndex(x => x.id === editing.id); if (i >= 0) d.lessons[i] = editing; prunePlacements(d) })
              setEditing(null)
            }}>{t('Save')}</button>
          </>}>
          <LessonForm p={p} value={editing} onChange={setEditing} />
        </Modal>
      )}
      {copyOf && <CopyLessons p={p} lessons={copyOf} onClose={() => { setCopyOf(null); setSel(new Set()) }} />}
    </div>
  )
}

const sameRef = (a: ClassRef, b: ClassRef) => a.classId === b.classId && a.groupId === b.groupId

function TeacherAssign({ p, teacherId }: { p: Project; teacherId: string }) {
  const n = names(p)
  const [subjectId, setSubjectId] = useState('')
  const [splitText, setSplitText] = useState('2')
  const split = parseSplit(splitText)
  const refs: ClassRef[] = p.classes.flatMap(c => [{ classId: c.id, groupId: null }, ...c.groups.map(g => ({ classId: c.id, groupId: g.id }))])
  const ofSubject = p.lessons.filter(l => l.subjectId === subjectId)
  const mine = (r: ClassRef) => ofSubject.find(l => l.teacherIds.includes(teacherId) && l.classes.length === 1 && sameRef(l.classes[0], r))
  const others = (r: ClassRef) => ofSubject.filter(l => !l.teacherIds.includes(teacherId) && l.classes.some(c => sameRef(c, r)))

  const pickSubject = (id: string) => {
    setSubjectId(id)
    const used = p.lessons.find(l => l.subjectId === id)
    if (used) setSplitText(splitLabel(used.split))
  }
  const toggle = (r: ClassRef) => {
    const m = mine(r)
    if (m) update(d => { d.lessons = d.lessons.filter(l => l.id !== m.id); prunePlacements(d) })
    else if (split) update(d => { d.lessons.push({ id: newId('l'), subjectId, teacherIds: [teacherId], roomIds: [], classes: [r], split, sameDayOk: false, link: '' }) })
  }

  return (
    <div className="card pad stack">
      <h3>{t('Give lessons to this teacher')}</h3>
      <div className="row" style={{ alignItems: 'end', gap: 16 }}>
        <label className="field">{t('Subject')}
          <select value={subjectId} onChange={e => pickSubject(e.target.value)}>
            <option value="">{t('Choose…')}</option>
            {p.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="field" title={t('How the weekly hours are split into blocks, e.g. 2+2+1 = two double lessons and one single, each on a different day.')}>{t('Hours / blocks for new ticks')}
          <input value={splitText} style={{ width: 110, borderColor: split ? undefined : 'var(--danger)' }} onChange={e => setSplitText(e.target.value)} placeholder="2+2+1" />
        </label>
        <span className="hint" style={{ paddingBottom: 6 }}>{t('Teacher total: {h} hours/week', { h: loadOf(p, 'teacher', teacherId) })}</span>
      </div>
      {subjectId && (
        <div className="assign-grid">
          {refs.map(r => {
            const m = mine(r), o = others(r)
            return (
              <label key={r.classId + '|' + r.groupId} className={`assign ${m ? 'on' : ''}`}>
                <input type="checkbox" checked={!!m} disabled={!m && !split} onChange={() => toggle(r)} />
                <span><b>{classLabel(n, r, false)}</b>
                  {m && <span className="hint"> · {lessonHours(m)} {t('h')}</span>}
                  {o.length > 0 && <span className="hint" style={{ display: 'block' }}>{o.flatMap(l => l.teacherIds).map(x => n.teacher.get(x)?.short || n.teacher.get(x)?.name).join(', ') || t('no teacher')}</span>}
                </span>
              </label>
            )
          })}
        </div>
      )}
      {!subjectId && <span className="hint">{t('Choose a subject, then tick the classes this teacher teaches it to. Unticking removes the lesson.')}</span>}
    </div>
  )
}

function LessonForm({ p, value, onChange }: { p: Project; value: Lesson; onChange: (l: Lesson) => void }) {
  const [splitText, setSplitText] = useState(splitLabel(value.split))
  const [lastId, setLastId] = useState(value.id)
  if (lastId !== value.id) { setLastId(value.id); setSplitText(splitLabel(value.split)) }
  const n = names(p)
  const classOptions = p.classes.flatMap(c => [
    { id: refKey({ classId: c.id, groupId: null }), name: c.name, color: c.color },
    ...c.groups.map(g => ({ id: refKey({ classId: c.id, groupId: g.id }), name: `${c.name} (${g.name})`, color: c.color })),
  ])
  const links = [...new Set(p.lessons.map(l => l.link).filter(Boolean))]
  const hours = lessonHours(value)
  const setHours = (h: number) => {
    const split = defaultSplit(Math.max(1, Math.min(40, h || 1)))
    setSplitText(splitLabel(split))
    onChange({ ...value, split })
  }
  return (
    <div className="stack">
      <div className="row" style={{ alignItems: 'start', gap: 16 }}>
        <label className="field" style={{ minWidth: 220 }}>{t('Class / group')}
          <ChipSelect items={classOptions} value={value.classes.map(refKey)} onChange={v => onChange({ ...value, classes: v.map(fromKey) })} placeholder={t('+ class…')} />
        </label>
        <label className="field">{t('Subject')}
          <select value={value.subjectId} onChange={e => onChange({ ...value, subjectId: e.target.value })}>
            <option value="">{t('Choose…')}</option>
            {p.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="field" style={{ minWidth: 200 }}>{t('Teacher(s)')}
          <ChipSelect items={p.teachers} value={value.teacherIds} onChange={v => onChange({ ...value, teacherIds: v })} placeholder={t('+ teacher…')} />
        </label>
        {p.useRooms && <label className="field" style={{ minWidth: 160 }}>{t('Room(s)')}
          <ChipSelect items={p.rooms} value={value.roomIds} onChange={v => onChange({ ...value, roomIds: v })} placeholder={t('+ room…')} />
        </label>}
      </div>
      <div className="row" style={{ alignItems: 'end', gap: 16 }}>
        <label className="field">{t('Hours / week')}
          <input type="number" min={1} max={40} value={hours} style={{ width: 80 }} onChange={e => setHours(+e.target.value)} />
        </label>
        <label className="field" title={t('How the weekly hours are split into blocks, e.g. 2+2+1 = two double lessons and one single, each on a different day.')}>{t('Blocks')}
          <input value={splitText} style={{ width: 100, borderColor: parseSplit(splitText) ? undefined : 'var(--danger)' }}
            onChange={e => { setSplitText(e.target.value); const s = parseSplit(e.target.value); if (s) onChange({ ...value, split: s }) }} />
        </label>
        <label className="field" title={t('Lessons with the same link are always scheduled at the same time (e.g. parallel electives of different groups).')}>{t('Parallel link')}
          <input list="links" value={value.link} placeholder={t('optional')} style={{ width: 140 }} onChange={e => onChange({ ...value, link: e.target.value })} />
          <datalist id="links">{links.map(l => <option key={l} value={l} />)}</datalist>
        </label>
        <label className="check" style={{ paddingBottom: 6 }}>
          <input type="checkbox" checked={value.sameDayOk} onChange={e => onChange({ ...value, sameDayOk: e.target.checked })} />
          {t('Blocks may be on the same day')}
        </label>
      </div>
      {value.classes.length > 1 && <div className="hint">{t('This lesson is taught to {list} together at the same time.', { list: value.classes.map(c => classLabel(n, c, false)).join(', ') })}</div>}
    </div>
  )
}

function CopyLessons({ p, lessons, onClose }: { p: Project; lessons: Lesson[]; onClose: () => void }) {
  const [targets, setTargets] = useState<string[]>([])
  const [keepTeachers, setKeepTeachers] = useState(true)
  const src = lessons.filter(l => l.classes.length === 1)
  const from = new Set(src.map(l => l.classes[0].classId))
  return (
    <Modal title={t('Copy lessons to other classes')} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn primary" disabled={!targets.length || !src.length} onClick={() => {
          update(d => {
            for (const cid of targets) {
              const cls = d.classes.find(c => c.id === cid)!
              for (const l of src) {
                const g = l.classes[0].groupId
                d.lessons.push({ ...structuredClone(l), id: newId('l'), classes: [{ classId: cid, groupId: g && cls.groups.some(x => x.id === g) ? g : null }], teacherIds: keepTeachers ? [...l.teacherIds] : [], link: '' })
              }
            }
          })
          toast(t('{n} lessons copied', { n: src.length * targets.length }))
          onClose()
        }}>{t('Copy {n} lessons', { n: src.length * targets.length })}</button>
      </>}>
      <p className="hint" style={{ marginTop: 0 }}>{t('Copies {n} single-class lessons.', { n: src.length })}{src.length < lessons.length && ' ' + t('{n} lessons shared by several classes are skipped.', { n: lessons.length - src.length })}</p>
      <div className="row" style={{ maxHeight: 260, overflow: 'auto' }}>
        {p.classes.filter(c => !from.has(c.id)).map(c => (
          <label key={c.id} className="check chip"><input type="checkbox" checked={targets.includes(c.id)} onChange={e => setTargets(e.target.checked ? [...targets, c.id] : targets.filter(x => x !== c.id))} />{c.name}</label>
        ))}
      </div>
      <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={keepTeachers} onChange={e => setKeepTeachers(e.target.checked)} />{t('Keep the same teachers')}</label>
    </Modal>
  )
}
