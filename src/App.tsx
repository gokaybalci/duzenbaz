import { useEffect, useRef, useState } from 'react'
import { Icon, type IconName } from './icons'
import { demoProject, demoTeacherRange } from './demo'
import { DAY_NAMES, setLang, t, useLang } from './i18n'
import { addMandatorySubjects, emptyProject, SCHOOL_TYPES, type Project, type SchoolType } from './model'
import { EntitiesPage, type EntityKey } from './pages/Entities'
import { GeneratePage } from './pages/Generate'
import { LessonsPage } from './pages/Lessons'
import { PrintPage } from './pages/Print'
import { SchoolPage } from './pages/School'
import { SHEET_CSS } from './pages/Sheets'
import { TimetablePage } from './pages/Timetable'
import { native } from './native'
import { FONTS, setAppearance, TEXT_SIZES, THEMES, useAppearance } from './theme'
import { canRedo, canUndo, getProject, redo, replaceProject, undo, useProject } from './store'
import { download, Menu, Modal, toast, ToastHost } from './ui'

type Page = 'start' | 'school' | EntityKey | 'lessons' | 'generate' | 'timetable' | 'print'

const NAV: [Page, IconName, string][] = [
  ['start', 'home', 'Start'],
  ['school', 'school', 'School & schedule'],
  ['subjects', 'book', 'Subjects'],
  ['teachers', 'teacher', 'Teachers'],
  ['rooms', 'door', 'Rooms'],
  ['classes', 'users', 'Classes'],
  ['lessons', 'puzzle', 'Lessons'],
  ['generate', 'zap', 'Generate'],
  ['timetable', 'calendar', 'Timetable'],
  ['print', 'printer', 'Print & share'],
]

export default function App() {
  const p = useProject()
  useLang()
  const [page, setPage] = useState<Page>(() => (localStorage.getItem('duzenbaz.page') as Page) || 'start')
  const fileInput = useRef<HTMLInputElement>(null)
  const [demoOpen, setDemoOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)

  useEffect(() => { try { localStorage.setItem('duzenbaz.page', page) } catch { /* ignore */ } }, [page])
  // Desktop: a .duzenbaz file double-clicked in the file manager.
  useEffect(() => {
    native?.startupFile().then(f => { if (f) open({ name: f.name, arrayBuffer: async () => f.data.slice().buffer }) }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(getProject(), e.shiftKey) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const counts: Partial<Record<Page, number>> = {
    subjects: p.subjects.length, teachers: p.teachers.length, rooms: p.rooms.length, classes: p.classes.length, lessons: p.lessons.length,
  }

  const open = async (f: { name: string; arrayBuffer(): Promise<ArrayBuffer> }) => {
    try {
      const buf = await f.arrayBuffer()
      const proj: Project = JSON.parse(new TextDecoder().decode(buf))
      if (!proj.days || !proj.lessons) throw new Error(t('Not a timetable project file'))
      replaceProject(proj)
      toast(t('Opened {name}', { name: f.name }))
      setPage(Object.keys(proj.placements ?? {}).length ? 'timetable' : 'lessons')
    } catch (e) {
      alert(t('Could not open the file') + ':\n' + (e instanceof Error ? e.message : String(e)))
    }
  }

  const pickFile = async () => {
    if (!native) { fileInput.current?.click(); return }
    try {
      const f = await native.openProject()
      if (f) open({ name: f.name, arrayBuffer: async () => f.data.slice().buffer })
    } catch (e) { alert(t('Could not open the file') + ':\n' + String(e)) }
  }

  return (
    <div className="app">
      <style>{SHEET_CSS}</style>
      <nav className="sidebar no-print">
        <div className="brand"><img className="logo" src="/logo.svg" alt="" />{t('Düzenbaz')}</div>
        {NAV.filter(([id]) => id !== 'rooms' || p.useRooms).map(([id, icon, label], i) => (
          <div key={id} style={{ display: 'contents' }}>
            {(i === 2 || i === 7) && <div className="nav-sep" />}
            <button className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => setPage(id)}>
              <Icon n={icon} />{t(label)}{counts[id] !== undefined && <span className="count">{counts[id]}</span>}
            </button>
          </div>
        ))}
        <div className="spacer" />
        <AppearanceMenu />
        <div className="row" style={{ padding: '0 6px' }}>
          <div className="btn-group">
            <LangBtn l="tr" /><LangBtn l="en" />
          </div>
        </div>
      </nav>
      <div className="main">
        <header className="topbar no-print">
          <div className="title">{p.school.name || t('Untitled school')} {p.school.year && <span className="hint">· {p.school.year}</span>}</div>
          <button className="btn ghost icon" onClick={undo} disabled={!canUndo()} title={t('Undo') + ' (Ctrl+Z)'}><Icon n="undo" /></button>
          <button className="btn ghost icon" onClick={redo} disabled={!canRedo()} title={t('Redo') + ' (Ctrl+Y)'}><Icon n="redo" /></button>
          <Menu label={<><Icon n="folder" /> {t('File')} <Icon n="down" size={12} /></>}>
            {close => <>
              <button onClick={() => { close(); setNewOpen(true) }}><Icon n="file" /> {t('New project')}</button>
              <button onClick={() => { close(); pickFile() }}><Icon n="open" /> {t('Open…')}</button>
              <button onClick={() => { close(); save(p, false) }}><Icon n="save" /> {t('Save')} <span className="hint">Ctrl+S</span></button>
              {native && <button onClick={() => { close(); save(p, true) }}><Icon n="save" /> {t('Save as…')} <span className="hint">Ctrl+Shift+S</span></button>}
              <hr />
              <button onClick={() => { close(); setDemoOpen(true) }}><Icon n="cap" /> {t('Load demo school')}</button>
            </>}
          </Menu>
          <input ref={fileInput} type="file" accept=".duzenbaz,.json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) open(f); e.target.value = '' }} />
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
        </main>
      </div>
      {newOpen && <NewProjectDialog onClose={() => setNewOpen(false)} onCreate={() => { setNewOpen(false); setPage('school') }} />}
      {demoOpen && <DemoDialog onClose={() => setDemoOpen(false)} onCreate={() => { setDemoOpen(false); setPage('generate') }} />}
      <ToastHost />
    </div>
  )
}

async function save(p: Project, saveAs: boolean) {
  const name = (p.school.name || 'ders_programi').replace(/[^\p{L}\p{N}]+/gu, '_') + '.duzenbaz'
  const json = JSON.stringify(p, null, 1)
  if (native) {
    try {
      const saved = await native.saveProject(json, saveAs, name)
      if (saved) toast(t('Saved {name}', { name: saved }))
    } catch (e) { alert(t('Could not save the file') + ':\n' + String(e)) }
    return
  }
  await download(name, json, 'application/json')
  toast(t('Saved {name}', { name }))
}

function AppearanceMenu() {
  const a = useAppearance()
  return (
    <Menu up className="nav-item" label={<><Icon n="palette" />{t('Appearance')}</>}>
      {() => <div style={{ width: 260 }}>
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
      </div>}
    </Menu>
  )
}

function NewProjectDialog({ onClose, onCreate }: { onClose: () => void; onCreate: () => void }) {
  const [type, setType] = useState<SchoolType>('')
  const create = () => {
    native?.forgetProjectPath()
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
        <button className="btn primary" disabled={!ok} onClick={() => { replaceProject(demoProject({ classes, teachers })); onCreate() }}>{t('Create')}</button>
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
  return (
    <div className="stack" style={{ gap: 16, maxWidth: 820 }}>
      <div className="page-head"><h2>{t('Welcome')}</h2></div>
      <div className="card pad stack">
        <p style={{ margin: 0 }}>{native ? t('Build weekly timetables for your school in a few steps. Your data never leaves this computer: it is kept in your user profile and saved only to files you choose with File → Save.') : t('Build weekly timetables for your school in a few steps. Everything is saved automatically in this browser; use File → Save to keep a copy or move it to another computer.')}</p>
        <div className="row">
          <button className="btn primary" onClick={() => go('school')}>{t('Start setting up')}</button>
          <button className="btn" onClick={openFile}><Icon n="open" /> {t('Open a file')}</button>
          <button className="btn" onClick={openDemo}><Icon n="cap" /> {t('Try the demo school')}</button>
        </div>
      </div>
      <div className="card">
        {steps.map(([pg, title, desc, done], i) => (
          <button key={pg} className="nav-item" style={{ width: '100%', padding: '12px 16px', borderRadius: 0, borderBottom: '1px solid var(--line)' }} onClick={() => go(pg)}>
            <span className={`badge ${done ? 'ok' : ''}`} style={{ minWidth: 26, textAlign: 'center' }}>{done ? <Icon n="check" size={12} /> : i + 1}</span>
            <span className="stack" style={{ gap: 0 }}><b>{t(title)}</b><span className="hint">{t(desc)}</span></span>
            <span style={{ marginLeft: 'auto' }} className="hint"><Icon n="right" /></span>
          </button>
        ))}
      </div>
    </div>
  )
}
