// Minimal i18n: English text is the key and Turkish (the default UI language) maps from it.

import { useSyncExternalStore } from 'react'
import { tr } from './i18n.tr'

export type Lang = 'en' | 'tr'
const KEY = 'duzenbaz.lang'
let lang: Lang = (() => {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'en' || v === 'tr') return v
  } catch { /* ignore */ }
  return 'tr' // Turkish is the main language; English is only an optional switch.
})()
const listeners = new Set<() => void>()

export function setLang(l: Lang) {
  lang = l
  try { localStorage.setItem(KEY, l) } catch { /* ignore */ }
  document.documentElement.lang = l
  listeners.forEach(f => f())
}
export const getLang = () => lang
if (typeof document !== 'undefined') document.documentElement.lang = lang

/** Translate; `{name}` placeholders are filled from vars. */
export function t(s: string, vars?: Record<string, string | number>): string {
  let out = lang === 'tr' ? (tr[s] ?? s) : s
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
  return out
}

export function useLang() {
  return useSyncExternalStore(f => { listeners.add(f); return () => { listeners.delete(f) } }, getLang)
}

export const DAY_NAMES: Record<Lang, string[]> = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  tr: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'],
}
