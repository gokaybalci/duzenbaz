import { invoke } from '@tauri-apps/api/core'
import { getCurrentWebview } from '@tauri-apps/api/webview'

interface NativeFile { name: string; data: Uint8Array }

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const toFile = (f: { name: string; data: number[] } | null): NativeFile | null =>
  f ? { name: f.name, data: Uint8Array.from(f.data) } : null

export const native = inTauri ? {
  openProject: async () => toFile(await invoke('open_project')),
  saveProject: (json: string, saveAs: boolean, suggested: string) => invoke<string | null>('save_project', { json, saveAs, suggested }),
  forgetProjectPath: () => invoke<void>('forget_project_path'),
  getSaveDir: () => invoke<string | null>('get_save_dir'),
  chooseSaveDir: () => invoke<string | null>('choose_save_dir'),
  saveExport: (name: string, data: Uint8Array, ext: 'html' | 'csv' | 'xlsx' | 'zip') => invoke<string | null>('save_export', { name, data: Array.from(data), ext }),
  startupFile: async () => toFile(await invoke('startup_file')),
  cpuCount: () => invoke<number>('cpu_count'),
  openRepo: () => invoke<void>('open_repo'),
  setZoom: (scale: number) => getCurrentWebview().setZoom(scale),
} : undefined

