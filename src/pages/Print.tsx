import { useMemo, useRef, useState } from 'react'
import { Icon } from '../icons'
import { getLang, t } from '../i18n'
import type { Project } from '../model'
import { useProject } from '../store'
import { buildIndex, classLabel, entitiesOf, names, type Kind } from '../timetable'
import { native } from '../native'
import { download, toast } from '../ui'
import { DailySheet, defaultSheetOptions, EntitySheet, MasterSheet, SHEET_CSS, type SheetOptions } from './Sheets'

type What = 'class' | 'teacher' | 'room' | 'master-class' | 'master-teacher' | 'daily-class' | 'daily-teacher'

const WHAT: [What, string][] = [
  ['class', 'Class timetables'],
  ['teacher', 'Teacher timetables'],
  ['room', 'Room timetables'],
  ['master-class', 'Overview: all classes'],
  ['master-teacher', 'Overview: all teachers'],
  ['daily-class', 'Daily plans (classes)'],
  ['daily-teacher', 'Daily plans (teachers)'],
]

const FILE_SUFFIX: Record<What | Kind, string> = {
  class: 'sinif_programlari', teacher: 'ogretmen_programlari', room: 'derslik_programlari',
  'master-class': 'carsaf_siniflar', 'master-teacher': 'carsaf_ogretmenler', 'daily-class': 'gunluk_siniflar', 'daily-teacher': 'gunluk_ogretmenler',
}

function fileBase(p: Project) {
  return (p.school.name || 'ders_programi').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '') || 'ders_programi'
}

function standaloneHtml(inner: string, title: string) {
  return `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title.replace(/</g, '&lt;')}</title><style>
body{margin:0;background:#f3f4f6;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
.sheets{display:flex;flex-direction:column;gap:20px;align-items:center;padding:20px}
.sheet{background:#fff;width:297mm;max-width:100%;padding:12mm;box-sizing:border-box;box-shadow:0 1px 4px rgba(0,0,0,.15);overflow-x:auto}
.sheet.portrait{width:210mm}
${SHEET_CSS}
@media print{@page{margin:8mm}body{background:#fff}.sheets{display:block;padding:0}.sheet{box-shadow:none;padding:0;width:auto;break-after:page}.sheet:last-child{break-after:auto}}
</style></head><body><div class="sheets">${inner}</div></body></html>`
}

/** Spreadsheet-friendly export: one row per class/teacher, one column per period of the week. */
function csv(p: Project, kind: Kind) {
  const idx = buildIndex(p), n = names(p)
  const sep = getLang() === 'tr' ? ';' : ','
  const q = (s: string) => (/[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const header = ['', ...p.days.flatMap(d => p.periods.map(per => `${d} ${per.label}`))]
  const rows = entitiesOf(p, kind).map(e => [e.name, ...idx.grids[kind].get(e.id)!.map(cards => cards.map(c => {
    const sub = n.subject.get(c.lesson.subjectId)?.name ?? ''
    const other = kind === 'class' ? c.lesson.teacherIds.map(x => n.teacher.get(x)?.name).join('/') : c.lesson.classes.map(x => classLabel(n, x, true)).join('/')
    const room = c.lesson.roomIds.map(x => n.room.get(x)?.name).join('/')
    return [sub, other, room].filter(Boolean).join(' - ')
  }).join(' | '))])
  return '﻿' + [header, ...rows].map(r => r.map(q).join(sep)).join('\r\n')
}

export function PrintPage() {
  const p = useProject()
  const [what, setWhat] = useState<What>('class')
  const [o, setO] = useState<SheetOptions>(defaultSheetOptions)
  const [only, setOnly] = useState<string[] | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const idx = useMemo(() => buildIndex(p), [p])
  const n = useMemo(() => names(p), [p])

  const isEntity = what === 'class' || what === 'teacher' || what === 'room'
  const kind: Kind = isEntity ? what : what.endsWith('teacher') ? 'teacher' : 'class'
  const ents = entitiesOf(p, kind)
  const chosen = isEntity ? ents.filter(e => !only || only.includes(e.id)) : []
  const days = what.startsWith('daily') ? p.days.map((_, i) => i).filter(i => !only || only.includes(String(i))) : []
  const choices = isEntity ? ents.map(e => ({ id: e.id, name: e.name })) : what.startsWith('daily') ? p.days.map((d, i) => ({ id: String(i), name: d })) : []
  const placed = Object.keys(p.placements).length
  const title = `${p.school.name || t('Timetable')} – ${t(WHAT.find(w => w[0] === what)![1])}`

  const html = () => standaloneHtml(ref.current?.innerHTML ?? '', title)
  const share = async () => {
    const file = new File([html()], `${fileBase(p)}_${FILE_SUFFIX[what]}.html`, { type: 'text/html' })
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title }) } catch { /* cancelled */ }
    } else {
      download(file.name, file, 'text/html')
      toast(t('Sharing is not supported here, the file was downloaded instead.'))
    }
  }

  const opt = (k: keyof SheetOptions, label: string) => (
    <label className="check"><input type="checkbox" checked={o[k]} onChange={e => setO({ ...o, [k]: e.target.checked })} />{t(label)}</label>
  )

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="page-head no-print">
        <h2>{t('Print & share')}</h2>
        <button className="btn primary" disabled={!placed} onClick={() => window.print()}><Icon n="printer" /> {t('Print / Save as PDF')}</button>
        <button className="btn" disabled={!placed} onClick={() => download(`${fileBase(p)}_${FILE_SUFFIX[what]}.html`, html(), 'text/html')}><Icon n="download" /> {native ? t('Save HTML') : t('Download HTML')}</button>
        <button className="btn" disabled={!placed} onClick={() => download(`${fileBase(p)}_${FILE_SUFFIX[kind]}.csv`, csv(p, kind), 'text/csv')}><Icon n="download" /> {t('Excel (CSV)')}</button>
        {!native && <button className="btn" disabled={!placed} onClick={share}><Icon n="share" /> {t('Share')}</button>}
      </div>

      <div className="card pad stack no-print">
        <div className="row">
          <select value={what} onChange={e => { setWhat(e.target.value as What); setOnly(null) }}>
            {WHAT.map(([w, l]) => <option key={w} value={w}>{t(l)}</option>)}
          </select>
          {opt('short', 'Short names')}
          {opt('showTeachers', 'Show teachers')}
          {opt('showRooms', 'Show rooms')}
          {opt('colored', 'Colors')}
          {isEntity && opt('lessonList', 'Lesson list')}
          {isEntity && opt('signature', 'Principal signature')}
        </div>
        {choices.length > 0 && (
          <div className="row" style={{ maxHeight: 120, overflow: 'auto', gap: 4 }}>
            <button className="btn small" onClick={() => setOnly(null)}>{t('All')}</button>
            <button className="btn small" onClick={() => setOnly([])}>{t('None')}</button>
            {choices.map(c => {
              const on = !only || only.includes(c.id)
              return (
                <label key={c.id} className="check chip">
                  <input type="checkbox" checked={on} onChange={e => {
                    const cur = only ?? choices.map(x => x.id)
                    setOnly(e.target.checked ? [...cur, c.id] : cur.filter(x => x !== c.id))
                  }} />{c.name}
                </label>
              )
            })}
          </div>
        )}
        <div className="hint">{t('Tip: in the print dialog choose "Save as PDF" to get a PDF file. Each timetable is printed on its own page.')}</div>
      </div>

      {!placed ? <div className="card empty">{t('Generate a timetable first.')}</div> : (
        <div className="sheets" ref={ref}>
          {isEntity && chosen.map(e => <div className="sheet" key={e.id}><EntitySheet p={p} idx={idx} n={n} kind={kind} id={e.id} o={o} /></div>)}
          {what.startsWith('master') && <div className="sheet"><MasterSheet p={p} idx={idx} n={n} kind={kind} short={true} colored={o.colored} /></div>}
          {days.map(d => <div className="sheet" key={d}><DailySheet p={p} idx={idx} n={n} kind={kind} day={d} o={o} /></div>)}
        </div>
      )}
    </div>
  )
}
