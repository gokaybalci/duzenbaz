import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { t } from './i18n'
import type { Grid, Period } from './model'
import { native } from './native'

export function PageTitle({ title, count, sub }: { title: ReactNode; count?: ReactNode; sub?: ReactNode }) {
  return (
    <div className="page-title">
      <h2>{title}{count !== undefined && <span className="page-count">{count}</span>}</h2>
      {sub && <p className="page-sub">{sub}</p>}
    </div>
  )
}

export function Empty({ icon = 'sparkle', children, action }: { icon?: IconName; children: ReactNode; action?: ReactNode }) {
  return <div className="empty"><Icon n={icon} size={26} /><p>{children}</p>{action}</div>
}

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={wide ? { width: 920 } : undefined} role="dialog">
        <header><h3>{title}</h3><button className="btn ghost icon" onClick={onClose} aria-label={t('Close')}><Icon n="x" /></button></header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}

export function AvailabilityEditor({ days, periods, value, onChange, base }: { days: string[]; periods: Period[]; value: Grid; onChange: (g: Grid) => void; base?: Grid }) {
  const P = periods.length
  const paint = useRef<string | null>(null)
  const [cur, setCur] = useState(value)
  useEffect(() => setCur(value), [value])
  useEffect(() => {
    const up = () => { if (paint.current !== null) { paint.current = null; onChange(curRef.current) } }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [onChange])
  const curRef = useRef(cur)
  curRef.current = cur
  const set = (idx: number[], v: string) => {
    const a = curRef.current.split('')
    idx.forEach(i => (a[i] = v))
    const g = a.join('')
    curRef.current = g
    setCur(g)
  }
  const toggleMany = (idx: number[]) => {
    const anyOpen = idx.some(i => curRef.current[i] !== '0')
    set(idx, anyOpen ? '0' : '1')
    onChange(curRef.current)
  }
  const blocked = (i: number) => base !== undefined && base[i] === '0'
  return (
    <div className="stack">
      <table className="avail">
        <thead>
          <tr>
            <th onClick={() => toggleMany(Array.from({ length: days.length * P }, (_, i) => i))} title={t('Toggle all')}><Icon n="swap" /></th>
            {days.map((d, di) => (
              <th key={di} onClick={() => toggleMany(Array.from({ length: P }, (_, p) => di * P + p))} title={t('Toggle whole day')}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periods.map((per, p) => (
            <tr key={p}>
              <th onClick={() => toggleMany(days.map((_, d) => d * P + p))} title={t('Toggle this period on all days')} style={{ textAlign: 'left' }}>
                {per.label} <span style={{ fontWeight: 400 }}>{per.time}</span>
              </th>
              {days.map((_, d) => {
                const i = d * P + p
                if (blocked(i)) return <td key={d} className="blocked" title={t('Closed for the whole school')}>–</td>
                const on = cur[i] !== '0'
                return (
                  <td key={d} className={on ? '' : 'off'}
                    onPointerDown={e => { e.preventDefault(); paint.current = on ? '0' : '1'; set([i], paint.current) }}
                    onPointerEnter={() => { if (paint.current !== null) set([i], paint.current) }}>
                    {on ? <Icon n="check" /> : <Icon n="x" />}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="btn small" onClick={() => { set(Array.from({ length: cur.length }, (_, i) => i), '1'); onChange(curRef.current) }}>{t('Open all')}</button>
        <button className="btn small" onClick={() => { set(Array.from({ length: cur.length }, (_, i) => i), '0'); onChange(curRef.current) }}>{t('Close all')}</button>
        <span className="hint">{t('Click or drag to toggle. Click a day or period header to toggle the whole row/column.')}</span>
      </div>
    </div>
  )
}

export function MiniGrid({ value, days, periods, onClick }: { value: Grid; days: number; periods: number; onClick?: () => void }) {
  const cells = []
  for (let p = 0; p < periods; p++) for (let d = 0; d < days; d++) cells.push(<i key={p * days + d} className={value[d * periods + p] === '0' ? 'off' : ''} />)
  const closed = value.split('').filter(c => c === '0').length
  return (
    <button className="mini-grid" style={{ gridTemplateColumns: `repeat(${days}, 5px)` }} onClick={onClick} title={closed ? t('{n} closed slots', { n: closed }) : t('Always available')}>
      {cells}
    </button>
  )
}

let toastSet: ((s: string | null) => void) | null = null
let toastTimer: number | undefined
export function toast(msg: string) {
  toastSet?.(msg)
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => toastSet?.(null), 2600)
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { toastSet = setMsg; return () => { toastSet = null } }, [])
  return msg ? <div className="toast">{msg}</div> : null
}

export function Menu({ label, children, up, className }: { label: ReactNode; children: (close: () => void) => ReactNode; up?: boolean; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', h)
    return () => window.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div className="menu" ref={ref}>
      <button className={className ?? 'btn'} onClick={() => setOpen(o => !o)}>{label}</button>
      {open && <div className={`menu-pop ${up ? 'up' : ''}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

export function ChipSelect<T extends { id: string; name: string; color?: string }>({ items, value, onChange, placeholder }: { items: T[]; value: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const byId = new Map(items.map(i => [i.id, i]))
  return (
    <div className="row" style={{ gap: 4 }}>
      {value.map(id => (
        <span key={id} className="chip">
          {byId.get(id)?.color && <span className="dot" style={{ background: byId.get(id)!.color }} />}
          {byId.get(id)?.name ?? '?'}
          <button className="btn ghost small" style={{ padding: 0 }} onClick={() => onChange(value.filter(v => v !== id))} aria-label={t('Remove')}><Icon n="x" size={12} /></button>
        </span>
      ))}
      <select value="" onChange={e => { if (e.target.value) onChange([...value, e.target.value]) }} style={{ maxWidth: 180 }}>
        <option value="">{placeholder}</option>
        {items.filter(i => !value.includes(i.id)).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
      </select>
    </div>
  )
}

export async function download(name: string, data: BlobPart, type: string) {
  const ext = name.split('.').pop()?.toLowerCase()
  if (native && (ext === 'html' || ext === 'csv' || ext === 'xlsx' || ext === 'zip')) {
    const bytes = new Uint8Array(await new Blob([data]).arrayBuffer())
    const saved = await native.saveExport(name, bytes, ext)
    if (saved) toast(t('Saved {name}', { name: saved }))
    return
  }
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
