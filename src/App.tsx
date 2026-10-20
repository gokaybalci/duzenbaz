import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './icons'
import { demoProject, demoTeacherRange } from './demo'
import { DAY_NAMES, setLang, t, useLang } from './i18n'
import { addMandatorySubjects, emptyProject, fileName, SCHOOL_TYPES, type Project, type SchoolType } from './model'
import { DutyPlacesPage, DutyPlanPage, DutyPrintPage, DutySpecialsPage, DutyTeachersPage } from './pages/Duty'
import { EntitiesPage, type EntityKey } from './pages/Entities'
import { GeneratePage } from './pages/Generate'
import { LessonsPage } from './pages/Lessons'
import { PrintPage } from './pages/Print'
import { SchoolPage } from './pages/School'
import { SHEET_CSS } from './pages/Sheets'
import { TimetablePage } from './pages/Timetable'
import { native } from './native'
import { isDprg, readDprg } from './dprg'
import { zip } from './xlsx'
import { bg } from './assets'
import { version } from '../package.json'
import { FONTS, setAppearance, TEXT_SIZES, THEMES, useAppearance } from './theme'
import { canRedo, canUndo, getFilePath, getProject, markSaved, setFilePath, redo, replaceProject, undo, useProject, useSaved } from './store'
import { setNavigator } from './nav'
import { download, Menu, Modal, PageTitle, toast, ToastHost } from './ui'

type Page = 'start' | 'school' | EntityKey | 'lessons' | 'generate' | 'timetable' | 'print' | DutyPage
type DutyPage = 'duty-teachers' | 'duty-places' | 'duty-specials' | 'duty-plan' | 'duty-print'

const NAV: [Page, IconName, string, string][] = [
  ['start', 'home', 'Start', ''],
  ['school', 'school', 'School & schedule', 'Setup'],
  ['subjects', 'book', 'Subjects', 'Setup'],
  ['teachers', 'teacher', 'Teachers', 'Setup'],
  ['rooms', 'door', 'Rooms', 'Setup'],
  ['classes', 'users', 'Classes', 'Setup'],
  ['lessons', 'puzzle', 'Lessons', 'Setup'],
  ['generate', 'zap', 'Generate', 'Scheduling'],
  ['timetable', 'calendar', 'Timetable', 'Scheduling'],
  ['print', 'printer', 'Print & share', 'Output'],
]

const DUTY_NAV: [DutyPage, IconName, string, string][] = [
  ['duty-teachers', 'teacher', 'Teachers', 'Setup'],
  ['duty-places', 'door', 'Duty places', 'Setup'],
  ['duty-specials', 'calendar', 'Special days', 'Setup'],
  ['duty-plan', 'zap', 'Distribute duties', 'Scheduling'],
  ['duty-print', 'printer', 'Print & share', 'Output'],
]
const PAGES = new Set<string>([...NAV, ...DUTY_NAV].map(([id]) => id))

export default function App() {
  const p = useProject()
  useLang()
  const [page, setPage] = useState<Page>(() => { const s = localStorage.getItem('duzenbaz.page') ?? ''; return PAGES.has(s) ? s as Page : 'start' })
  const dutyMode = page.startsWith('duty-')
  const isSaved = useSaved()
  const lastOf = useRef<Record<'tt' | 'duty', Page>>({ tt: 'start', duty: 'duty-teachers' })
  lastOf.current[dutyMode ? 'duty' : 'tt'] = page
  useEffect(() => setNavigator(pg => { if (PAGES.has(pg)) setPage(pg as Page) }), [])
  const fileInput = useRef<HTMLInputElement>(null)
  const [demoOpen, setDemoOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [dprgNote, setDprgNote] = useState(false)

  useEffect(() => { try { localStorage.setItem('duzenbaz.page', page) } catch {} }, [page])
  useEffect(() => {
    native?.startupFile().then(f => f ? open({ name: f.name, path: f.path, arrayBuffer: async () => f.data.slice().buffer }) : native?.restoreProjectPath(getFilePath())).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(getProject(), e.shiftKey); return }
      if ((e.target as HTMLElement).closest('input,textarea,select')) return
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const counts: Partial<Record<Page, number>> = {
    subjects: p.subjects.length, teachers: p.teachers.length, rooms: p.rooms.length, classes: p.classes.length, lessons: p.lessons.length,
    'duty-teachers': p.teachers.length, 'duty-places': p.duty.places.length, 'duty-specials': p.duty.specials.length,
  }

  const open = async (f: { name: string; path?: string | null; arrayBuffer(): Promise<ArrayBuffer> }) => {
    try {
      const buf = await f.arrayBuffer()
      const dprg = isDprg(f.name)
      const proj: Project = dprg ? await readDprg(buf) : JSON.parse(new TextDecoder().decode(buf))
      if (!proj.days || !proj.lessons) throw new Error(t('Not a timetable project file'))
      replaceProject(proj)
      setFilePath(f.path ?? null)
      if (!dprg) markSaved(getProject()) // an imported Dağıtmatik file is saved as a new .duzenbaz
      toast(t('Opened {name}', { name: f.name }))
      setPage(Object.keys(proj.placements ?? {}).length ? 'timetable' : 'lessons')
      setDprgNote(dprg)
    } catch (e) {
      setFilePath(null) // the native side already switched to the file that failed to open
      alert(t('Could not open the file') + ':\n' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const pickFile = async () => {
    if (!native) { fileInput.current?.click(); return }
    try {
      const f = await native.openProject()
      if (f) open({ name: f.name, path: f.path, arrayBuffer: async () => f.data.slice().buffer })
    } catch (e) { alert(t('Could not open the file') + ':\n' + String(e)) }
  }

  return (
    <div className="app">
      <style>{SHEET_CSS}</style>
      <nav className="sidebar no-print">
        <div className="brand"><span className="tip" data-tip="Gökay"><img className="logo" src="/logo.svg" alt="" /></span>{t('Düzenbaz')}</div>
        <div className="mod-switch" role="group" aria-label={t('Module')}>
          <button className={dutyMode ? '' : 'on'} aria-pressed={!dutyMode} onClick={() => dutyMode && setPage(lastOf.current.tt)}>{t('Timetable')}</button>
          <button className={dutyMode ? 'on' : ''} aria-pressed={dutyMode} onClick={() => !dutyMode && setPage(lastOf.current.duty)}>{t('Duty')}</button>
        </div>
        {(dutyMode ? DUTY_NAV : NAV.filter(([id]) => id !== 'rooms' || p.useRooms)).map(([id, icon, label, group], i, all) => (
          <div key={id} style={{ display: 'contents' }}>
            {group && group !== all[i - 1]?.[3] && <div className="nav-group">{t(group)}</div>}
            <button className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>
              <Icon n={icon} />{t(label)}{counts[id] !== undefined && <span className="count">{counts[id]}</span>}
            </button>
          </div>
        ))}
        <div className="spacer" />
        <SettingsMenu />
        <div className="row" style={{ padding: '0 6px', marginTop: 10 }}>
          <div className="btn-group">
            <LangBtn l="tr" /><LangBtn l="en" />
          </div>
        </div>
      </nav>
      <div className="main">
        <header className="topbar no-print">
          <div className="title">{p.school.name || t('Untitled school')} {p.school.year && <span className="hint">· {p.school.year}</span>}</div>
          <span className={`save-state ${isSaved ? 'ok' : ''}`}><i />{t(isSaved ? 'Saved' : 'Unsaved changes')}</span>
          <button className="btn" onClick={() => save(getProject(), false)} title={t('Save') + ' (Ctrl+S)'}><Icon n="save" /> {t('Save')}</button>
          <button className="btn ghost icon" onClick={undo} disabled={!canUndo()} title={t('Undo') + ' (Ctrl+Z)'}><Icon n="undo" /></button>
          <button className="btn ghost icon" onClick={redo} disabled={!canRedo()} title={t('Redo') + ' (Ctrl+Y)'}><Icon n="redo" /></button>
          <Menu label={<><Icon n="folder" /> {t('File')} <Icon n="down" size={12} /></>}>
            {close => <>
              <button onClick={() => { close(); setNewOpen(true) }}><Icon n="file" /> {t('New project')}</button>
              <button onClick={() => { close(); pickFile() }}><Icon n="open" /> {t('Open…')}</button>
              <button onClick={() => { close(); save(p, false) }}><Icon n="save" /> {t('Save')} <span className="hint">Ctrl+S</span></button>
              {native && <button onClick={() => { close(); save(p, true) }}><Icon n="save" /> {t('Save as…')} <span className="hint">Ctrl+Shift+S</span></button>}
              <button onClick={() => { close(); exportCopy(p) }}><Icon n="download" /> {t('Back up as ZIP')}</button>
              <hr />
              <button onClick={() => { close(); setDemoOpen(true) }}><Icon n="cap" /> {t('Load demo school')}</button>
            </>}
          </Menu>
          <input ref={fileInput} type="file" accept=".duzenbaz,.json,.dprg,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) open(f); e.target.value = '' }} />
        </header>
        <main className="content">
          {page === 'start' && <StartPage go={setPage} openFile={pickFile} openDemo={() => setDemoOpen(true)} />}
          {page === 'school' && <SchoolPage />}
          {(page === 'subjects' || page === 'teachers' || (page === 'rooms' && p.useRooms) || page === 'classes') && <EntitiesPage key={page} entity={page} />}
          {page === 'rooms' && !p.useRooms && <SchoolPage />}
          {page === 'lessons' && <LessonsPage />}
          {page === 'generate' && <GeneratePage goTo={pg => setPage(pg as Page)} />}
          {page === 'timetable' && <TimetablePage />}
          {page === 'print' && <PrintPage />}
          {page === 'duty-teachers' && <DutyTeachersPage />}
          {page === 'duty-places' && <DutyPlacesPage />}
          {page === 'duty-specials' && <DutySpecialsPage />}
          {page === 'duty-plan' && <DutyPlanPage />}
          {page === 'duty-print' && <DutyPrintPage />}
        </main>
      </div>
      {newOpen && <NewProjectDialog onClose={() => setNewOpen(false)} onCreate={() => { setNewOpen(false); setPage('school') }} />}
      {demoOpen && <DemoDialog onClose={() => setDemoOpen(false)} onCreate={() => { setDemoOpen(false); setPage('generate') }} />}
      {dprgNote && <Modal title={t('Imported from Dağıtmatik')} onClose={() => setDprgNote(false)}
        footer={<button className="btn primary" onClick={() => setDprgNote(false)}>{t('Done')}</button>}>
        <p style={{ maxWidth: 420, margin: 0 }}>{t('This file comes from Dağıtmatik, a different program, so some settings may not carry over exactly. Check the teachers, lessons and timetable, then use File → Save to keep it as a Düzenbaz project.')}</p>
      </Modal>}
      <ToastHost />
    </div>
  )
}

async function save(p: Project, saveAs: boolean) {
  const name = fileName(p) + '.duzenbaz'
  const json = JSON.stringify(p, null, 1)
  if (native) {
    try {
      const saved = await native.saveProject(json, saveAs, name)
      if (saved) { setFilePath(saved); markSaved(p); toast(t('Saved to {path}', { path: saved })) }
    } catch (e) { alert(t('Could not save the file') + ':\n' + String(e)) }
    return
  }
  await download(name, json, 'application/json')
  markSaved(p)
  toast(t('Saved {name}', { name }))
}

function exportCopy(p: Project) {
  const now = new Date(), two = (n: number) => String(n).padStart(2, '0')
  const stamp = `${two(now.getDate())}.${two(now.getMonth() + 1)}.${now.getFullYear()}_${two(now.getHours())}.${two(now.getMinutes())}`
  const name = `${fileName(p)}_${stamp}`
  return download(name + '.zip', zip([[name + '.duzenbaz', JSON.stringify(p, null, 1)]]), 'application/zip')
}

function SaveFolder() {
  const [dir, setDir] = useState<string | null>(null)
  useEffect(() => { native?.getSaveDir().then(setDir).catch(() => {}) }, [])
  if (!native) return <div className="hint" style={{ padding: '0 8px 8px' }}>{t('In the browser, files are saved to your Downloads folder.')}</div>
  return (
    <div className="stack" style={{ gap: 6, padding: '0 8px 8px' }}>
      <code className="save-dir" title={dir ?? ''}>{dir ?? '…'}</code>
      <button className="btn small" onClick={() => native!.chooseSaveDir().then(d => { if (d) { setDir(d); toast(t('Save folder: {path}', { path: d })) } }).catch(e => alert(String(e)))}>
        <Icon n="folder" /> {t('Change folder…')}
      </button>
      <span className="hint">{t('Save (Ctrl+S) writes here without asking; Save as… asks for a place.')}</span>
    </div>
  )
}

function SettingsMenu() {
  const a = useAppearance()
  const [about, setAbout] = useState(false)
  return (<>
    <Menu up className="nav-item" label={<><Icon n="settings" />{t('Settings')}</>}>
      {close => <div style={{ width: 280 }}>
        <div className="menu-title">{t('Save folder')}</div>
        <SaveFolder />
        <div className="menu-title">{t('Colour theme')}</div>
        <div className="theme-grid">
          {THEMES.map(th => (
            <button key={th.id} className={a.theme === th.id ? 'on' : ''} onClick={() => setAppearance({ theme: th.id })}>
              <span className="theme-sw" style={{ background: th.main }}><i style={{ background: th.side, borderRight: `3px solid ${th.accent}` }} /><i /></span>
              {t(th.name)}
            </button>
          ))}
        </div>
        <div className="menu-title">{t('Font')}</div>
        <div className="font-list">
          {FONTS.map(f => (
            <button key={f.id} className={a.font === f.id ? 'on' : ''} style={{ fontFamily: f.stack }} onClick={() => setAppearance({ font: f.id })}>
              {t(f.name)} <span className="hint">· Ders Programı 123</span>
            </button>
          ))}
        </div>
        <div className="menu-title">{t('Text size')}</div>
        <div className="size-row">
          {TEXT_SIZES.map(sz => (
            <button key={sz.scale} className={a.scale === sz.scale ? 'on' : ''} onClick={() => setAppearance({ scale: sz.scale })}>
              <span style={{ fontSize: 13 * sz.scale, fontWeight: 600 }}>Aa</span>{t(sz.name)}
            </button>
          ))}
        </div>
        <div className="row hint" style={{ padding: '8px 4px 0', gap: 4 }}>
          <a className="btn ghost icon" href={REPO} target="_blank" rel="noreferrer" title="GitHub" aria-label="GitHub"
            onClick={e => { if (native) { e.preventDefault(); native.openRepo().catch(() => {}) } }}
            onContextMenu={e => { e.preventDefault(); close(); setAbout(true) }}><Icon n="github" /></a>
          {t('Version')} {version}
        </div>
      </div>}
    </Menu>
    {about && <Modal title={<>Düzenbaz {version}</>} onClose={() => setAbout(false)}>
      <div className="stack" style={{ alignItems: 'center', maxWidth: 360 }}>
        <span className="tip inside" data-tip={t('Momo and Tarçın ❤️')} style={{ width: '100%' }}>
          <img src={bg} alt={t('Momo and Tarçın ❤️')} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
        </span>
      </div>
    </Modal>}
  </>)
}

const REPO = 'https://github.com/gokaybalci/duzenbaz'

function NewProjectDialog({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [type, setType] = useState<SchoolType>('')
  const create = () => {
    setFilePath(null)
    const e = emptyProject()
    e.days = DAY_NAMES[document.documentElement.lang === 'tr' ? 'tr' : 'en'].slice(0, 5)
    e.schoolType = type
    addMandatorySubjects(e, type)
    replaceProject(e)
    onCreate()
  }
  return (
    <Modal title={t('New project')} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn primary" disabled={!type} onClick={create}>{t('Create')}</button>
      </>}>
      <div className="stack" style={{ maxWidth: 420 }}>
        <p className="hint" style={{ margin: 0 }}>{t('Start a new empty project? Unsaved changes will be lost (you can still undo).')}</p>
        <b>{t('School type')}</b>
        <span className="hint">{t('The mandatory subjects of the chosen school type are added to Subjects for you.')}</span>
        {SCHOOL_TYPES.map(([v, label]) => (
          <label key={v} className="check">
            <input type="radio" name="schoolType" checked={type === v} onChange={() => setType(v)} />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </Modal>
  )
}

function DemoDialog({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [classes, setClasses] = useState(12)
  const range = demoTeacherRange(classes)
  const [teachers, setTeachers] = useState(range.suggested)
  const ok = classes >= 1 && classes <= 40 && teachers >= range.min && teachers <= range.max
  return (
    <Modal title={t('Demo school')} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>{t('Cancel')}</button>
        <button className="btn primary" disabled={!ok} onClick={() => { setFilePath(null); replaceProject(demoProject({ classes, teachers })); onCreate() }}>{t('Create')}</button>
      </>}>
      <div className="stack" style={{ maxWidth: 420 }}>
        <p className="hint" style={{ margin: 0 }}>{t('Creates a sample ortaokul (grades 5–8, 35 lesson hours a week per class). It replaces the current project; you can undo.')}</p>
        <label className="field">{t('Number of classes')}
          <input type="number" min={1} max={40} value={classes} onChange={e => { const c = Math.max(1, Math.min(40, +e.target.value || 1)); setClasses(c); setTeachers(demoTeacherRange(c).suggested) }} />
        </label>
        <label className="field">{t('Number of teachers')}
          <input type="number" min={range.min} max={range.max} value={teachers} onChange={e => setTeachers(+e.target.value || 0)} />
        </label>
        <span className={teachers < range.min ? 'badge bad' : 'hint'}>{t('At least {min}, suggested {s} for {c} classes.', { min: range.min, s: range.suggested, c: classes })}</span>
      </div>
    </Modal>
  )
}

function LangBtn({ l }: { l: 'en' | 'tr' }) {
  const cur = useLang()
  return <button className={`btn small ${cur === l ? 'on' : ''}`} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
}

function StartPage({ go, openFile, openDemo }: { go: (p: Page) => void; openFile: () => void; openDemo: () => void }) {
  const p = useProject()
  const steps: [Page, string, string, boolean][] = [
    ['school', 'School & schedule', 'Days, lesson hours and times', !!p.school.name],
    ['subjects', 'Subjects', 'What is taught', p.subjects.length > 0],
    ['teachers', 'Teachers', 'Who teaches, and when they are at school', p.teachers.length > 0],
    ...(p.useRooms ? [['rooms', 'Rooms', 'Optional: labs, gyms and other special rooms', p.rooms.length > 0] as [Page, string, string, boolean]] : []),
    ['classes', 'Classes', 'Classes and their groups', p.classes.length > 0],
    ['lessons', 'Lessons', 'Which class takes which subject, with which teacher, how many hours', p.lessons.length > 0],
    ['generate', 'Generate', 'Distribute all lessons automatically', Object.keys(p.placements).length > 0],
    ['print', 'Print & share', 'Class, teacher and overview timetables', false],
  ]
  const doneCount = steps.slice(0, -1).filter(x => x[3]).length
  const next = Math.max(0, steps.findIndex(x => !x[3]))
  return (
    <div className="stack narrow" style={{ gap: 16 }}>
      <div className="page-head">
        <PageTitle title={t('Welcome')} sub={native ? t('Build weekly timetables for your school in a few steps. Your data never leaves this computer: it is kept in your user profile and saved only to files you choose with File → Save.') : t('Build weekly timetables for your school in a few steps. Everything is saved automatically in this browser; use File → Save to keep a copy or move it to another computer.')} />
      </div>
      <div className="row">
        <button className="btn primary" onClick={() => go(steps[next][0])}>{doneCount ? t('Continue: {step}', { step: t(steps[next][1]) }) : t('Start setting up')} <Icon n="right" /></button>
        <button className="btn" onClick={openFile}><Icon n="open" /> {t('Open a file')}</button>
        <button className="btn" onClick={openDemo}><Icon n="cap" /> {t('Try the demo school')}</button>
      </div>
      <div className="card">
        <div className="steps-head">
          <b>{t('{n} of {m} steps done', { n: doneCount, m: steps.length - 1 })}</b>
          <div className="progress"><div style={{ width: `${(doneCount / (steps.length - 1)) * 100}%` }} /></div>
        </div>
        {steps.map(([pg, title, desc, done], i) => (
          <button key={pg} className={`step ${done ? 'done' : ''} ${i === next ? 'next' : ''}`} onClick={() => go(pg)}>
            <span className="num">{done ? <Icon n="check" size={14} /> : i + 1}</span>
            <span className="stack" style={{ gap: 0 }}><b>{t(title)}</b><span className="hint">{t(desc)}</span></span>
            {i === next && <span className="next-tag">{t('Next')}</span>}
            <Icon n="right" />
          </button>
        ))}
      </div>
    </div>
  )
}
