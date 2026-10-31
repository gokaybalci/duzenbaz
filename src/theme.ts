import { useSyncExternalStore } from 'react'
import { native } from './native'

export const THEMES = [
  { id: 'light', name: 'Light', side: '#f4f4f2', main: '#f8f8f7', accent: '#0d7377' },
  { id: 'cream', name: 'Cream', side: '#efe8da', main: '#f6f1e7', accent: '#9a5216' },
  { id: 'green', name: 'Green', side: '#e8f0ea', main: '#f1f6f2', accent: '#1a6c43' },
  { id: 'blue', name: 'Navy', side: '#e8edf5', main: '#f1f4f9', accent: '#1c3d8f' },
  { id: 'contrast', name: 'High contrast', side: '#ffffff', main: '#ffffff', accent: '#000000' },
  { id: 'dark', name: 'Dark', side: '#0f0f10', main: '#141415', accent: '#4fb8b2' },
] as const
type ThemeId = (typeof THEMES)[number]['id']

export const TEXT_SIZES = [
  { scale: 1, name: 'Normal' },
  { scale: 1.15, name: 'Large' },
  { scale: 1.3, name: 'Extra large' },
] as const

export const FONTS = [
  { id: 'standard', name: 'Standard', stack: "'Instrument Sans Variable', 'Segoe UI', 'Noto Sans', Ubuntu, Cantarell, 'DejaVu Sans', system-ui, sans-serif" },
  { id: 'readable', name: 'Readable (wide)', stack: "Verdana, Tahoma, 'DejaVu Sans', 'Bitstream Vera Sans', sans-serif" },
  { id: 'office', name: 'Office', stack: "Calibri, Carlito, 'Segoe UI', 'Noto Sans', sans-serif" },
  { id: 'plain', name: 'Plain', stack: "Arial, 'Liberation Sans', Helvetica, 'Nimbus Sans', sans-serif" },
  { id: 'classic', name: 'Classic', stack: "Georgia, Cambria, 'Times New Roman', 'Noto Serif', 'DejaVu Serif', serif" },
] as const
type FontId = (typeof FONTS)[number]['id']

const SHEET_FONT = "'Source Sans 3 Variable', 'Segoe UI', 'Noto Sans', Ubuntu, Cantarell, 'DejaVu Sans', system-ui, sans-serif"
const KEY = 'duzenbaz.appearance'
let state: { theme: ThemeId; scale: number; font: FontId } = { theme: 'light', scale: 1, font: 'standard' }
try {
  const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
  if (THEMES.some(t => t.id === v.theme)) state.theme = v.theme
  if (TEXT_SIZES.some(s => s.scale === v.scale)) state.scale = v.scale
  if (FONTS.some(f => f.id === v.font)) state.font = v.font
} catch {}
const listeners = new Set<() => void>()
const FIT_WIDTH = 1360
const MIN_FIT = 0.8
let webviewZoom = 1
let fitWidth = 0

function apply() {
  document.documentElement.dataset.theme = state.theme
  const stack = FONTS.find(f => f.id === state.font)!.stack
  document.documentElement.style.setProperty('--font', stack)
  document.documentElement.style.setProperty('--sheet-font', state.font === 'standard' ? SHEET_FONT : stack)
  applyZoom()
}

function applyZoom() {
  fitWidth = window.innerWidth * webviewZoom
  const zoom = Math.round(state.scale * Math.max(MIN_FIT, Math.min(1, fitWidth / FIT_WIDTH)) * 100) / 100
  const cssZoom = () => {
    document.documentElement.style.zoom = String(zoom)
    document.documentElement.style.setProperty('--css-zoom', String(zoom))
  }
  if (!native) return cssZoom()
  webviewZoom = zoom
  native.setZoom(zoom).catch(() => { webviewZoom = 1; cssZoom() })
}
apply()
window.addEventListener('resize', () => { if (Math.abs(window.innerWidth * webviewZoom - fitWidth) >= 4) applyZoom() })

export function setAppearance(next: Partial<typeof state>) {
  state = { ...state, ...next }
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch {}
  apply()
  listeners.forEach(l => l())
}

export const useAppearance = () =>
  useSyncExternalStore(l => { listeners.add(l); return () => { listeners.delete(l) } }, () => state)
