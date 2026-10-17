import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../icons'
import { t } from '../i18n'
import { colorVars, lessonHours, parseCardId, type Project } from '../model'
import { lessonOf, moveCard, setLocked, slotStatuses, swapCards, unplaceCard, type SlotStatus } from '../placement'
import { undo, update, useProject } from '../store'
import { buildIndex, cardLines, classLabel, entitiesOf, names, type CellCard, type Kind, type Names, type TTIndex } from '../timetable'
import { MasterSheet } from './Sheets'

const KINDS: [Kind, string][] = [['class', 'Classes'], ['teacher', 'Teachers'], ['room', 'Rooms']]

export function TimetablePage() {
  const p = useProject()
  const [kind, setKind] = useState<Kind | 'all'>('class')
  const [sel, setSel] = useState<Record<Kind, string>>({ class: '', teacher: '', room: '' })
  const [dragId, setDragId] = useState<string | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number; title: string; color: string } | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const idx = useMemo(() => buildIndex(p), [p])
  const n = useMemo(() => names(p), [p])

  const k: Kind = kind === 'all' ? 'class' : kind
  const list = entitiesOf(p, k)
  const id = list.some(e => e.id === sel[k]) ? sel[k] : list[0]?.id ?? ''
  const statuses = useMemo(() => (dragId ? slotStatuses(p, idx, dragId) : null), [p, idx, dragId])

  const clashCount = (kk: Kind, eid: string) => {
    const g = idx.grids[kk].get(eid)
    if (!g) return 0
    const set = new Set<string>()
    g.forEach((cards, s) => cards.forEach(c => { if (idx.clashSlots.get(c.cardId)?.has(s)) set.add(c.cardId) }))
    return set.size
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!selected || (e.target as HTMLElement).closest('input,select,textarea')) return
      if (e.key === 'Delete' || e.key === 'Backspace') { unplaceCard(p, selected); setSelected(null) }
      if (e.key.toLowerCase() === 'l') setLocked(p, selected, !p.placements[selected]?.locked)
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [p, selected])

  const drop = (cid: string, s: number) => {
    const st = slotStatuses(p, idx, cid)
    if (st[s] === 'closed') return
    const P = p.periods.length
    const grid = idx.grids[k].get(id)
    const len = lessonOf(p, cid)?.split[parseCardId(cid).part] ?? 1
    const here = grid ? grid[s].filter(c => c.cardId !== cid && c.offset === 0) : []
    if (here.length === 1 && here[0].len === len && p.placements[cid] && !p.placements[here[0].cardId]?.locked) swapCards(p, cid, here[0].cardId)
    else moveCard(p, cid, Math.floor(s / P), s % P)
  }

  const startDrag = (e: React.PointerEvent, cid: string, title: string, color: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX, y0 = e.clientY
    let moving = false, target: number | null = null
    const slotAt = (x: number, y: number) => {
      const td = document.elementFromPoint(x, y)?.closest('td[data-slot]') as HTMLElement | null
      return td ? Number(td.dataset.slot) : null
    }
    const move = (ev: PointerEvent) => {
      if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return
      if (!moving) { moving = true; setDragId(cid); setSelected(null) }
      setGhost({ x: ev.clientX, y: ev.clientY, title, color })
      target = slotAt(ev.clientX, ev.clientY)
      setOver(target)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (moving) { if (target !== null) drop(cid, target) }
      else setSelected(cid)
      setDragId(null); setGhost(null); setOver(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }

  const placed = Object.keys(p.placements).length
  const unplacedHere = idx.unplaced.filter(u =>
    kind === 'all' ? true : k === 'class' ? u.lesson.classes.some(c => c.classId === id) : k === 'teacher' ? u.lesson.teacherIds.includes(id) : u.lesson.roomIds.includes(id))

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="page-head">
        <h2>{t('Timetable')}</h2>
        <div className="btn-group">
          {KINDS.filter(([kk]) => kk !== 'room' || p.useRooms).map(([kk, label]) => <button key={kk} className={`btn ${kind === kk ? 'on' : ''}`} onClick={() => setKind(kk)}>{t(label)}</button>)}
          <button className={`btn ${kind === 'all' ? 'on' : ''}`} onClick={() => setKind('all')}>{t('Overview')}</button>
        </div>
        {placed > 0 && <>
          <button className="btn" onClick={() => update(d => { for (const v of Object.values(d.placements)) v.locked = true })}><Icon n="lock" /> {t('Lock all')}</button>
          <button className="btn" onClick={() => update(d => { for (const v of Object.values(d.placements)) v.locked = false })}><Icon n="unlock" /> {t('Unlock all')}</button>
          <button className="btn danger" onClick={() => { if (confirm(t('Remove all unlocked blocks from the timetable?'))) update(d => { for (const [c, v] of Object.entries(d.placements)) if (!v.locked) delete d.placements[c] }) }}>{t('Clear')}</button>
        </>}
      </div>

      {kind === 'all' ? (
        <div className="card" style={{ overflow: 'auto', padding: 8 }}>
          <MasterSheet p={p} idx={idx} n={n} kind="class" short screen />
        </div>
      ) : (
        <div className="split">
          <div className="card" style={{ padding: 8 }}>
            <div className="list">
              {list.length === 0 && <div className="empty">{t('Nothing here yet.')}</div>}
              {list.map(e => {
                const c = clashCount(k, e.id)
                return (
                  <button key={e.id} className={e.id === id ? 'active' : ''} onClick={() => setSel({ ...sel, [k]: e.id })}>
                    <span className="dot" style={{ background: e.color }} />{e.name}
                    {c > 0 && <span className="meta"><span className="badge bad">{c}</span></span>}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="stack" style={{ minWidth: 0 }}>
            {id && (
              <div className="card" style={{ overflow: 'hidden' }}>
                <Grid p={p} idx={idx} n={n} kind={k} id={id} statuses={statuses} dragId={dragId} over={over} selected={selected} startDrag={startDrag}
                  onCellClick={s => { if (selected && statuses === null) { const st = slotStatuses(p, idx, selected); if (st[s] !== 'closed') { drop(selected, s); setSelected(null) } } }} />
              </div>
            )}
            {unplacedHere.length > 0 && (
              <div className="card pad stack">
                <h3>{t('Not placed')} ({unplacedHere.length})</h3>
                <div className="tray">
                  {unplacedHere.map(u => {
                    const cl = cardLines(n, u.lesson, k, true, id)
                    return (
                      <div key={u.cardId} className={`tcard ${dragId === u.cardId ? 'dragging' : ''} ${selected === u.cardId ? 'selected' : ''}`} style={colorVars(cl.color, 0.14) as React.CSSProperties}
                        onPointerDown={e => startDrag(e, u.cardId, cl.title, cl.color)}>
                        <b>{cl.title} · {u.len} {t('h')}</b>
                        {cl.lines.map((x, i) => <span key={i}>{x}</span>)}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            {selected && <Details p={p} n={n} id={selected} onClose={() => setSelected(null)} />}
            {ghost && <div className="tcard drag-ghost" style={{ ...colorVars(ghost.color, 0.3), left: ghost.x + 8, top: ghost.y + 8 } as React.CSSProperties}><b>{ghost.title}</b></div>}
            <p className="hint" style={{ margin: 0 }}>
              {t('Drag a block to move it (green = free, yellow = same lesson already that day, red = conflict), or click a block and then click an empty cell. Drop on a block of the same length to swap. Moved blocks get locked. Press L to lock/unlock the selected block, Delete to remove it. Ctrl+Z undoes.')}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function Grid({ p, idx, n, kind, id, statuses, dragId, over, selected, startDrag, onCellClick }: {
  p: Project; idx: TTIndex; n: Names; kind: Kind; id: string; statuses: SlotStatus[] | null
  dragId: string | null; over: number | null; selected: string | null
  startDrag: (e: React.PointerEvent, cid: string, title: string, color: string) => void
  onCellClick: (s: number) => void
}) {
  const P = p.periods.length
  const grid = idx.grids[kind].get(id)
  const ent = entitiesOf(p, kind).find(e => e.id === id)
  if (!grid || !ent) return null
  const dragLen = dragId ? lessonOf(p, dragId)?.split[parseCardId(dragId).part] ?? 1 : 1
  const hint = !dragId && selected ? slotStatuses(p, idx, selected) : null
  const blank = new Set<number>()
  if (kind === 'class' && p.strictClasses)
    for (let d = 0; d < p.days.length; d++) {
      const open = (s: number) => ent.avail[s] !== '0' && p.avail[s] !== '0'
      let last = -1
      for (let pp = 0; pp < P; pp++) if (grid[d * P + pp].length) last = pp
      for (let pp = 0; pp < last; pp++) { const s = d * P + pp; if (!grid[s].length && open(s)) blank.add(s) }
    }
  const st = statuses ?? hint

  return (
    <table className="tt">
      <thead>
        <tr><th className="ph">{ent.short}</th>{p.days.map((d, i) => <th key={i}>{d}</th>)}</tr>
      </thead>
      <tbody>
        {p.periods.map((per, pi) => (
          <tr key={pi}>
            <th className="ph">{per.label}<small>{per.time}</small></th>
            {p.days.map((_, di) => {
              const s = di * P + pi
              const cards = grid[s]
              const closed = ent.avail[s] === '0' || p.avail[s] === '0'
              let cls = closed ? 'closed' : blank.has(s) ? 'blank' : ''
              if (st && st[s] !== 'closed') cls += ' drop-' + st[s]
              if (dragId && over !== null && s >= over && s < over + dragLen && Math.floor(over / P) === di && statuses?.[over] !== 'closed') {
                const occ = grid[over].filter(c => c.cardId !== dragId && c.offset === 0)
                cls += occ.length === 1 && occ[0].len === dragLen && !occ[0].locked && p.placements[dragId] ? ' drop-swap' : ' drop-target'
              }
              return (
                <td key={di} className={cls} data-slot={s} title={blank.has(s) ? t('Blank period in class schedule') : undefined} onClick={() => { if (!cards.length) onCellClick(s) }}>
                  {cards.map(c => <Card key={c.cardId} c={c} n={n} kind={kind} viewer={id} clash={!!idx.clashSlots.get(c.cardId)?.has(s)}
                    dragging={dragId === c.cardId} selected={selected === c.cardId} startDrag={startDrag} />)}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Card({ c, n, kind, viewer, clash, dragging, selected, startDrag }: {
  c: CellCard; n: Names; kind: Kind; viewer: string; clash: boolean; dragging: boolean; selected: boolean
  startDrag: (e: React.PointerEvent, cid: string, title: string, color: string) => void
}) {
  const cl = cardLines(n, c.lesson, kind, kind !== 'class', viewer)
  return (
    <div className={`tcard ${c.offset ? 'cont' : ''} ${clash ? 'clash' : ''} ${dragging ? 'dragging' : ''} ${selected ? 'selected' : ''}`}
      style={colorVars(cl.color, 0.14) as React.CSSProperties}
      onPointerDown={e => startDrag(e, c.cardId, cl.title, cl.color)} title={[cl.title, ...cl.lines].join('\n')}>
      {c.locked && <span className="lock"><Icon n="lock" size={10} /></span>}
      <b>{cl.title}</b>
      {cl.lines.map((x, i) => <span key={i}>{x}</span>)}
    </div>
  )
}

function Details({ p, n, id, onClose }: { p: Project; n: Names; id: string; onClose: () => void }) {
  const l = lessonOf(p, id)
  if (!l) return null
  const pl = p.placements[id]
  const part = parseCardId(id).part
  return (
    <div className="card pad row" style={{ justifyContent: 'space-between' }}>
      <div className="stack" style={{ gap: 2 }}>
        <b>{n.subject.get(l.subjectId)?.name} · {t('block {i} of {n}', { i: part + 1, n: l.split.length })} ({l.split[part]}h, {lessonHours(l)}h/{t('week')})</b>
        <span className="hint">
          {l.classes.map(c => classLabel(n, c, false)).join(', ')} · {l.teacherIds.map(x => n.teacher.get(x)?.name).join(', ') || '—'}
          {l.roomIds.length ? ' · ' + l.roomIds.map(x => n.room.get(x)?.name).join(', ') : ''}
          {pl ? ` · ${p.days[pl.day]} ${p.periods[pl.period]?.label}` : ''}
        </span>
      </div>
      <div className="row">
        {pl && <button className="btn" onClick={() => setLocked(p, id, !pl.locked)}>{pl.locked ? <><Icon n="unlock" /> {t('Unlock')}</> : <><Icon n="lock" /> {t('Lock')}</>}</button>}
        {pl && <button className="btn" onClick={() => { unplaceCard(p, id); onClose() }}>{t('Remove from timetable')}</button>}
        <button className="btn ghost" onClick={() => undo()}><Icon n="undo" /> {t('Undo')}</button>
        <button className="btn ghost" onClick={onClose}><Icon n="x" /></button>
      </div>
    </div>
  )
}
