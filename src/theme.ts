import { useSyncExternalStore } from 'react'
import { native } from './native'

export const THEMES = [
  { id: 'light', name: 'Light', side: '#eceff3', main: '#f6f7f9', accent: '#2f6fed' },
  { id: 'cream', name: 'Cream', side: '#ebe2d1', main: '#f4eee2', accent: '#a65a1b' },
  { id: 'green', name: 'Green', side: '#e1ebe4', main: '#edf4ef', accent: '#1d7348' },
  { id: 'blue', name: 'Navy', side: '#e1e7f2', main: '#edf1f8', accent: '#1c3d8f' },
  { id: 'contrast', name: 'High contrast', side: '#ffffff', main: '#ffffff', accent: '#000000' },
  { id: 'dark', name: 'Dark', side: '#101216', main: '#14171c', accent: '#5b8ef5' },
] as const
type ThemeId = (typeof THEMES)[number]['id']

export const TEXT_SIZES = [
  { scale: 1, name: 'Normal' },
  { scale: 1.15, name: 'Large' },
  { scale: 1.3, name: 'Extra large' },
] as const

export const FONTS = [
  { id: 'standard', name: 'Standard', stack: "'Source Sans 3 Variable', 'Segoe UI', 'Noto Sans', Ubuntu, Cantarell, 'DejaVu Sans', system-ui, sans-serif" },
  { id: 'readable', name: 'Readable (wide)', stack: "Verdana, Tahoma, 'DejaVu Sans', 'Bitstream Vera Sans', sans-serif" },
  { id: 'office', name: 'Office', stack: "Calibri, Carlito, 'Segoe UI', 'Noto Sans', sans-serif" },
  { id: 'plain', name: 'Plain', stack: "Arial, 'Liberation Sans', Helvetica, 'Nimbus Sans', sans-serif" },
  { id: 'classic', name: 'Classic', stack: "Georgia, Cambria, 'Times New Roman', 'Noto Serif', 'DejaVu Serif', serif" },
] as const
type FontId = (typeof FONTS)[number]['id']

const KEY = 'duzenbaz.appearance'
let state: { theme: ThemeId; scale: number; font: FontId } = { theme: 'light', scale: 1, font: 'standard' }
try {
  const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
  if (THEMES.some(t => t.id === v.theme)) state.theme = v.theme
  if (TEXT_SIZES.some(s => s.scale === v.scale)) state.scale = v.scale
  if (FONTS.some(f => f.id === v.font)) state.font = v.font
} catch {}
const listeners = new Set<() => void>()

function apply() {
  document.documentElement.dataset.theme = state.theme
  document.documentElement.style.setProperty('--font', FONTS.find(f => f.id === state.font)!.stack)
  if (native) native.setZoom(state.scale).catch(() => { document.documentElement.style.zoom = String(state.scale) })
  else document.documentElement.style.zoom = String(state.scale)
}
apply()

export function setAppearance(next: Partial<typeof state>) {
  state = { ...state, ...next }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
  apply()
  listeners.forEach(l => l())
}

export const useAppearance = () =>
  useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l) } }, () => state)
