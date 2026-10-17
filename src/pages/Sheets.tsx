// Printable, human-readable timetable sheets. Styles live in SHEET_CSS so that the
// exported standalone HTML looks exactly like the in-app preview.

import type { ReactNode } from 'react'
import { t } from '../i18n'
import { colorVars, lessonHours, type Project } from '../model'
import { cardLines, classLabel, entitiesOf, type CellCard, type Kind, type Names, type TTIndex } from '../timetable'

export const SHEET_CSS = `
.ts { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111; }
.ts-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #222; padding-bottom: 6px; margin-bottom: 10px; gap: 12px; }
.ts-head h1 { font-size: 22px; margin: 0; }
.ts-head .sub { font-size: 12px; color: #555; text-align: right; }
.ts table.tts { width: 100%; border-collapse: collapse; table-layout: fixed; }
.ts .tts th, .ts .tts td { border: 1px solid #555; padding: 4px; text-align: center; vertical-align: middle; }
.ts .tts thead th { background: #eef0f3; font-size: 13px; }
.ts .tts th.ph { width: 70px; font-size: 12px; background: #eef0f3; }
.ts .tts th.ph small { display: block; font-weight: 400; color: #444; font-size: 10.5px; }
.ts .tts td { height: 52px; font-size: 12px; line-height: 1.25; }
.ts .tts td.closed { background: repeating-linear-gradient(135deg, #eee, #eee 5px, #fff 5px, #fff 10px); }
.ts .tts td .s { font-weight: 700; font-size: 13px; display: block; }
.ts .tts td .m { color: #333; display: block; font-size: 11px; }
.ts .tts td .g + .g { border-top: 1px dashed #999; margin-top: 2px; padding-top: 2px; }
.ts.colored .tts td.f { background: var(--cbg); }
.ts .foot { display: flex; gap: 24px; margin-top: 10px; font-size: 12px; justify-content: space-between; align-items: flex-start; }
.ts table.ll { border-collapse: collapse; font-size: 11.5px; }
.ts table.ll th, .ts table.ll td { border: 1px solid #999; padding: 2px 8px; text-align: left; }
.ts table.ll th { background: #eef0f3; }
.ts .sign { text-align: center; min-width: 160px; padding-top: 30px; }
.ts .sign div { border-top: 1px solid #333; padding-top: 3px; }
.ts table.ms { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 9.5px; }
.ts .ms th, .ts .ms td { border: 1px solid #777; padding: 1px 2px; text-align: center; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ts .ms thead th { background: #eef0f3; }
.ts .ms th.rh { width: 64px; text-align: left; background: #eef0f3; }
.ts .ms td { height: 30px; line-height: 1.15; }
.ts .ms td b { display: block; font-size: 10px; }
.ts .ms .dsep { border-left: 2px solid #222; }
.ts.colored .ms td.f { background: var(--cbg); }
.ts table.ds { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 12px; }
.ts .ds th, .ts .ds td { border: 1px solid #666; padding: 3px; text-align: center; }
.ts .ds thead th { background: #eef0f3; }
.ts .ds th.rh { width: 80px; background: #eef0f3; }
.ts .ds td { height: 40px; }
.ts .ds td b { display: block; font-size: 12.5px; }
.ts .ds td span { display: block; font-size: 10.5px; color: #333; }
.ts.colored .ds td.f { background: var(--cbg); }
`

export interface SheetOptions {
  short: boolean
  showTeachers: boolean
  showRooms: boolean
  colored: boolean
  lessonList: boolean
  signature: boolean
}

export const defaultSheetOptions: SheetOptions = { short: false, showTeachers: true, showRooms: true, colored: true, lessonList: true, signature: false }

const KIND_TITLE: Record<Kind, string> = { class: 'Class timetable', teacher: 'Teacher timetable', room: 'Room timetable' }

function Head({ p, title, name }: { p: Project; title: string; name: string }) {
  return (
    <div className="ts-head">
      <div>
        <div style={{ fontSize: 12, color: '#555' }}>{title}</div>
        <h1>{name}</h1>
      </div>
      <div className="sub">{p.school.name}<br />{p.school.year}</div>
    </div>
  )
}

function cellContent(cards: CellCard[], n: Names, kind: Kind, viewer: string, o: SheetOptions) {
  return cards.map(c => {
    const cl = cardLines(n, c.lesson, kind, o.short, viewer)
    let lines = cl.lines
    if (kind === 'class') {
      const own = c.lesson.classes.find(x => x.classId === viewer)
      const grp = own?.groupId ? classLabel(n, own, true).replace(/^[^(]*\(|\)$/g, '') : null
      const tea = o.showTeachers ? c.lesson.teacherIds.map(x => (o.short ? n.teacher.get(x)?.short : n.teacher.get(x)?.name) ?? '?').join(', ') : ''
      const room = o.showRooms ? c.lesson.roomIds.map(x => (o.short ? n.room.get(x)?.short : n.room.get(x)?.name) ?? '?').join(', ') : ''
      lines = [grp, tea, room].filter((x): x is string => !!x)
    } else if (!o.showRooms) lines = lines.slice(0, 1)
    return (
      <div className="g" key={c.cardId}>
        <span className="s">{cl.title}</span>
        {lines.map((l, i) => <span className="m" key={i}>{l}</span>)}
      </div>
    )
  })
}

/** One weekly timetable for a class, teacher or room. Multi-period blocks are merged. */
export function EntitySheet({ p, idx, n, kind, id, o }: { p: Project; idx: TTIndex; n: Names; kind: Kind; id: string; o: SheetOptions }) {
  const P = p.periods.length
  const grid = idx.grids[kind].get(id)
  const ent = entitiesOf(p, kind).find(e => e.id === id)
  if (!grid || !ent) return null
  // rowSpan computation per day
  const span: number[] = new Array(grid.length).fill(1)
  for (let d = 0; d < p.days.length; d++)
    for (let pp = 0; pp < P; pp++) {
      const s = d * P + pp, cards = grid[s]
      if (span[s] === 0 || cards.length !== 1 || cards[0].offset !== 0 || cards[0].len < 2) continue
      let k = 1
      while (k < cards[0].len && pp + k < P && grid[s + k].length === 1 && grid[s + k][0].cardId === cards[0].cardId) k++
      span[s] = k
      for (let j = 1; j < k; j++) span[s + j] = 0
    }
  const lessons = p.lessons.filter(l => kind === 'class' ? l.classes.some(c => c.classId === id) : kind === 'teacher' ? l.teacherIds.includes(id) : l.roomIds.includes(id))
  const total = lessons.reduce((a, l) => a + lessonHours(l), 0)
  return (
    <div className={`ts ${o.colored ? 'colored' : ''}`}>
      <Head p={p} title={t(KIND_TITLE[kind])} name={ent.name} />
      <table className="tts">
        <thead><tr><th className="ph"></th>{p.days.map((d, i) => <th key={i}>{d}</th>)}</tr></thead>
        <tbody>
          {p.periods.map((per, pi) => (
            <tr key={pi}>
              <th className="ph">{per.label}<small>{per.time}</small></th>
              {p.days.map((_, di) => {
                const s = di * P + pi
                if (span[s] === 0) return null
                const cards = grid[s]
                const closed = !cards.length && (ent.avail[s] === '0' || p.avail[s] === '0')
                const color = cards.length === 1 ? n.subject.get(cards[0].lesson.subjectId)?.color : undefined
                return (
                  <td key={di} rowSpan={span[s]} className={closed ? 'closed' : cards.length ? 'f' : ''} style={colorVars(color) as React.CSSProperties}>
                    {cellContent(cards, n, kind, id, o)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="foot">
        {o.lessonList ? (
          <table className="ll">
            <thead><tr><th>{t('Subject')}</th><th>{kind === 'class' ? t('Teacher') : t('Class')}</th><th>{t('Hours')}</th></tr></thead>
            <tbody>
              {lessons.map(l => (
                <tr key={l.id}>
                  <td>{n.subject.get(l.subjectId)?.name}</td>
                  <td>{kind === 'class' ? l.teacherIds.map(x => n.teacher.get(x)?.name).join(', ') : l.classes.map(c => classLabel(n, c, false)).join(', ')}</td>
                  <td style={{ textAlign: 'right' }}>{lessonHours(l)}</td>
                </tr>
              ))}
              <tr><th colSpan={2}>{t('Total')}</th><th style={{ textAlign: 'right' }}>{total}</th></tr>
            </tbody>
          </table>
        ) : <div>{t('Total')}: <b>{total}</b> {t('hours/week')}</div>}
        {o.signature && <div className="sign"><div>{p.school.principal}<br />{t('Principal')}</div></div>}
      </div>
    </div>
  )
}

/** All classes (or teachers) on one sheet: rows = entities, columns = every period of the week. */
export function MasterSheet({ p, idx, n, kind, short = true, colored = true, screen }: { p: Project; idx: TTIndex; n: Names; kind: Kind; short?: boolean; colored?: boolean; screen?: boolean }) {
  const P = p.periods.length
  const ents = entitiesOf(p, kind)
  const body: ReactNode[] = ents.map(e => {
    const grid = idx.grids[kind].get(e.id)!
    return (
      <tr key={e.id}>
        <th className="rh" title={e.name}>{short ? e.short || e.name : e.name}</th>
        {grid.map((cards, s) => {
          const c = cards[0]
          const col = c ? n.subject.get(c.lesson.subjectId)?.color : undefined
          const sub = c ? n.subject.get(c.lesson.subjectId)?.short : ''
          const other = c ? (kind === 'class' ? c.lesson.teacherIds.map(x => n.teacher.get(x)?.short).join(',') : c.lesson.classes.map(x => n.class.get(x.classId)?.short).join(',')) : ''
          const clash = cards.some(x => idx.clashSlots.get(x.cardId)?.has(s))
          return (
            <td key={s} className={`${s % P === 0 ? 'dsep' : ''} ${c ? 'f' : ''}`} style={{ ...colorVars(col, 0.18), ...(clash && screen ? { outline: '2px solid #d93a3a', outlineOffset: -2 } : {}) } as React.CSSProperties}
              title={cards.map(x => [n.subject.get(x.lesson.subjectId)?.name, ...x.lesson.teacherIds.map(y => n.teacher.get(y)?.name), ...x.lesson.classes.map(y => classLabel(n, y, false))].join(' · ')).join('\n')}>
              {c && <><b>{sub}{cards.length > 1 ? '+' : ''}</b>{other}</>}
            </td>
          )
        })}
      </tr>
    )
  })
  return (
    <div className={`ts ${colored ? 'colored' : ''}`} style={screen ? { minWidth: p.days.length * P * 44 + 70 } : undefined}>
      {!screen && <Head p={p} title={t('Overview')} name={kind === 'class' ? t('All classes') : kind === 'teacher' ? t('All teachers') : t('All rooms')} />}
      <table className="ms">
        <thead>
          <tr><th className="rh" rowSpan={2}></th>{p.days.map((d, i) => <th key={i} colSpan={P} className="dsep">{d}</th>)}</tr>
          <tr>{p.days.flatMap((_, d) => p.periods.map((per, i) => <th key={d * P + i} className={i === 0 ? 'dsep' : ''}>{per.label}</th>))}</tr>
        </thead>
        <tbody>{body}</tbody>
      </table>
    </div>
  )
}

/** Daily plan: one day, rows = classes (or teachers), columns = periods. */
export function DailySheet({ p, idx, n, kind, day, o }: { p: Project; idx: TTIndex; n: Names; kind: Kind; day: number; o: SheetOptions }) {
  const P = p.periods.length
  const ents = entitiesOf(p, kind)
  return (
    <div className={`ts ${o.colored ? 'colored' : ''}`}>
      <Head p={p} title={t('Daily plan') + ' · ' + (kind === 'class' ? t('Classes') : kind === 'teacher' ? t('Teachers') : t('Rooms'))} name={p.days[day]} />
      <table className="ds">
        <thead><tr><th className="rh"></th>{p.periods.map((per, i) => <th key={i}>{per.label}<br /><small style={{ fontWeight: 400 }}>{per.time}</small></th>)}</tr></thead>
        <tbody>
          {ents.map(e => {
            const grid = idx.grids[kind].get(e.id)!
            return (
              <tr key={e.id}>
                <th className="rh">{o.short ? e.short || e.name : e.name}</th>
                {p.periods.map((_, pi) => {
                  const cards = grid[day * P + pi]
                  const col = cards[0] ? n.subject.get(cards[0].lesson.subjectId)?.color : undefined
                  return (
                    <td key={pi} className={cards.length ? 'f' : ''} style={colorVars(col) as React.CSSProperties}>
                      {cards.map(c => {
                        const cl = cardLines(n, c.lesson, kind, true, e.id)
                        return <div key={c.cardId}><b>{cl.title}</b><span>{cl.lines.slice(0, o.showRooms ? 2 : 1).join(' · ')}</span></div>
                      })}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
