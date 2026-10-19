// Reader for Dağıtmatik .dprg files: old ones are gzip'd UTF-16LE XML, newer ones a little-endian binary layout.
import { cardId, emptyProject, fullGrid, newId, pickColor, type ClassRef, type Entity, type Project } from './model'

export const isDprg = (name: string) => /\.dprg$/i.test(name)

export async function readDprg(buf: ArrayBuffer): Promise<Project> {
  const b = new Uint8Array(buf)
  const p = b[0] === 0x1f && b[1] === 0x8b
    ? fromXml(new TextDecoder('utf-16le').decode(await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()))
    : fromBinary(new DataView(buf))
  p.useRooms = p.lessons.some(l => l.roomIds.length > 0) // Dağıtmatik always checks rooms
  return p
}

const addMinutes = (hhmm: string, m: number) => {
  const [h, mi] = hhmm.split(':').map(Number), t = h * 60 + mi + m
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

const entity = (name: string, short: string, color: string, avail: string): Entity => ({ id: '', name: name.trim(), short: short.trim(), color, avail })
const teacher = (e: Entity) => ({ ...e, maxPerDay: 0, maxDays: 0, maxGapsPerDay: -1 })

function fromBinary(v: DataView): Project {
  let o = 0
  const u8 = () => v.getUint8(o++)
  const u16 = () => { o += 2; return v.getUint16(o - 2, true) }
  const i32 = () => { o += 4; return v.getInt32(o - 4, true) }
  const utf8 = new TextDecoder()
  const str = () => { const n = u16(); o += n; return utf8.decode(new Uint8Array(v.buffer, v.byteOffset + o - n, n)) }
  const ids = (n: number) => Array.from({ length: n }, i32)
  const zero = (n: number, what: string) => { if (n) throw new Error(`Dağıtmatik: desteklenmeyen alan (${what})`) }

  const p = emptyProject()
  const version = u16()
  if (version < 1 || version > 2) throw new Error(`Dağıtmatik: bilinmeyen sürüm ${version}`)
  if (version >= 2) o += 8 // shortcut: v2 header bytes are unknown (zeros in samples), decode once a sample differs
  const minutes = u16()
  const days: { name: string; periods: { id: number; start: string }[] }[] = []
  for (let d = u8(); d--;) {
    i32()
    const name = str(), periods = []
    for (let n = u8(); n--;) periods.push({ id: i32(), start: `${String(u8()).padStart(2, '0')}:${String(u8()).padStart(2, '0')}` })
    days.push({ name, periods })
  }
  const P = Math.max(0, ...days.map(d => d.periods.length))
  if (days.length && P) {
    p.days = days.map(d => d.name)
    const longest = days.find(d => d.periods.length === P)!
    p.periods = longest.periods.map((x, i) => ({ label: String(i + 1), time: `${x.start}-${addMinutes(x.start, minutes)}` }))
    p.avail = days.map(d => Array.from({ length: P }, (_, j) => (j < d.periods.length ? '1' : '0')).join('')).join('')
  }
  const slot = new Map<number, number>()
  days.forEach((d, i) => d.periods.forEach((x, j) => slot.set(x.id, i * P + j)))
  const S = p.days.length * p.periods.length

  const ent = new Map<number, string>()
  const read = (prefix: string) => {
    const id = i32(), name = str(), short = str()
    const color = '#' + [u8(), u8(), u8()].map(x => x.toString(16).padStart(2, '0')).join('')
    const g = fullGrid(p.days.length, p.periods.length).split('')
    for (const s of ids(u16())) if (slot.has(s)) g[slot.get(s)!] = '0' // the stored slots are the closed ones
    const e = entity(name, short, color, g.join(''))
    ent.set(id, e.id = newId(prefix))
    return e
  }
  p.subjects = Array.from({ length: u16() }, () => read('s'))
  p.teachers = Array.from({ length: u16() }, () => teacher(read('t')))
  p.rooms = Array.from({ length: u16() }, () => ({ ...read('r'), capacity: 1 }))
  zero(u16(), 'derslik grubu') // shortcut: unknown u16 before classes, 0 in all samples
  p.classes = Array.from({ length: u16() }, () => {
    const c = read('c')
    zero(u16(), 'sınıf grubu'); zero(u16(), 'sınıf grubu') // shortcut: probably groups, 0 in all samples; ask the user for a sample with groups
    return { ...c, groups: [] }
  })

  u8() // shortcut: unknown byte before labels, ignored
  const labels = new Map<number, string>()
  for (let n = u8(); n--;) { const id = i32(); u8(); labels.set(id, str()) }
  for (let n = u16(); n--;) {
    i32(); const label = labels.get(i32()) ?? ''; i32(); const text = str().trim()
    if (label === 'Okul Adı') p.school.name = text
    else if (label === 'Okul Müdürü') p.school.principal = text
    else if (/^\d{4}\s*-\s*\d{4}$/.test(text)) p.school.year = text
  }

  const block = new Map<number, string>()
  for (let n = u16(); n--;) {
    i32()
    const id = newId('l'), subjectId = ent.get(i32())
    const map = (xs: number[]) => xs.map(x => ent.get(x)).filter((x): x is string => !!x)
    const teacherIds = map(ids(u8())), classIds = map(ids(u8())), roomIds = map(ids(u8()))
    const split: number[] = []
    for (let k = u8(); k--;) {
      block.set(i32(), cardId(id, split.length))
      split.push(u8())
      o += 3 // shortcut: 3 unknown block bytes (first is 0/1), ignored
      const rooms = map(ids(u8()))
      if (!roomIds.length) roomIds.push(...rooms)
      u8() // 1 = not placed; the placement list below says the same
    }
    if (subjectId && split.length) p.lessons.push({ id, subjectId, teacherIds, roomIds, classes: classIds.map(classId => ({ classId, groupId: null })), split, sameDayOk: false, link: '' })
  }
  zero(u16(), 'yerleşim öncesi alan') // shortcut: unknown u16 before placements, 0 in all samples
  for (let n = u16(); n--;) {
    const card = block.get(i32()), s = slot.get(i32())
    ids(u8())
    if (card && s !== undefined && s < S) p.placements[card] = { day: Math.floor(s / p.periods.length), period: s % p.periods.length, locked: false }
  }
  // the print templates and the MD5 trailer that follow are not needed
  return p
}

const unxml = (s: string) => s.replace(/&(lt|gt|quot|apos|amp|#\d+|#x[\da-f]+);/gi, (_, e: string) =>
  ({ lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' })[e.toLowerCase()] ?? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))))

interface El { attr: Record<string, string>; body: string }
// shortcut: regex XML reader (DOMParser is missing in Node, where the check script runs); fine for Dağıtmatik's flat, machine-written XML
const els = (xml: string, tag: string): El[] =>
  [...xml.matchAll(new RegExp(`<${tag}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'g'))].map(m => ({
    attr: Object.fromEntries([...m[1].matchAll(/([\w:]+)="([^"]*)"/g)].map(a => [a[1], unxml(a[2])])),
    body: m[2] ?? '',
  }))
const text = (xml: string, tag: string) => unxml(els(xml, tag)[0]?.body ?? '').trim()

function fromXml(xml: string): Project {
  if (!xml.includes('<DersProgrami')) throw new Error('Dağıtmatik dosyası değil')
  const p = emptyProject()
  const section = (tag: string) => els(xml, tag)[0]?.body ?? ''
  const gen = section('GenelAyarlar')
  p.school = { name: text(gen, 'OkulAdi'), year: text(gen, 'OgretimYili'), principal: text(gen, 'OkulMuduru'), vice: text(gen, 'OkulMudurYrd') }
  const days = els(gen, 'Gun').map(e => unxml(e.body).trim()), times = els(gen, 'Saat').map(e => unxml(e.body).trim())
  if (days.length && times.length) {
    p.days = days
    p.periods = times.map((time, i) => ({ label: String(i + 1), time }))
  }
  const D = p.days.length, P = p.periods.length
  const grid = (s: string) => (s.length === D * P ? s.replace(/[^0]/g, '1') : fullGrid(D, P))
  p.avail = grid(text(gen, 'Kosullar'))

  const ent = new Map<string, string>()
  const read = (list: string, prefix: string, i: number, e: El) => {
    const id = newId(prefix)
    ent.set(`${list}:${e.attr.Id}`, id)
    return { ...entity(text(e.body, 'Adi'), text(e.body, 'KisaAdi'), pickColor(i), grid(text(e.body, 'Kosul'))), id }
  }
  p.subjects = els(section('Dersler'), 'Ders').map((e, i) => read('d', 's', i, e))
  p.teachers = els(section('Ogretmenler'), 'Ogretmen').map((e, i) => teacher(read('o', 't', i, e)))
  p.rooms = els(section('Derslikler'), 'Derslik').map((e, i) => ({ ...read('r', 'r', i, e), capacity: 1 }))
  const groups = new Map<string, string>()
  p.classes = els(section('Siniflar'), 'Sinif').map((e, i) => {
    const c = read('c', 'c', i, e)
    const gs = els(e.body, 'Grup').filter(g => g.attr.Id !== '0') // group 0 is the whole class
      .map(g => { const id = newId('g'); groups.set(`${e.attr.Id}:${g.attr.Id}`, id); return { id, name: text(g.body, 'Adi') } })
    return { ...c, groups: gs }
  })

  for (const { attr: a } of els(section('TanimliDersler'), 'TanimliDers')) {
    const subjectId = ent.get(`d:${a.DersId}`), split = (a.Yerlesim ?? '').split('+').map(Number).filter(n => n > 0)
    if (!subjectId || !split.length) continue
    const list = (s: string | undefined, k: string) => (s ?? '').split(',').map(x => ent.get(`${k}:${x.trim()}`)).filter((x): x is string => !!x)
    const classes: ClassRef[] = (a.SinifGruplar ?? '').split(',').flatMap(cg => {
      const [c, g] = cg.trim().split(':'), classId = ent.get(`c:${c}`)
      return classId ? [{ classId, groupId: g && g !== '0' ? groups.get(`${c}:${g}`) ?? null : null }] : []
    })
    const id = newId('l')
    p.lessons.push({ id, subjectId, teacherIds: list(a.Ogretmenler, 'o'), roomIds: list(a.Derslikler, 'r'), classes, split, sameDayOk: false, link: '' })
    // YerlesimStr: three letters per block = block index, day, period (A = 0); anything out of range = not placed
    const ys = a.YerlesimStr ?? ''
    split.forEach((len, k) => {
      const day = ys.charCodeAt(3 * k + 1) - 65, period = ys.charCodeAt(3 * k + 2) - 65
      if (day >= 0 && day < D && period >= 0 && period + len <= P) p.placements[cardId(id, k)] = { day, period, locked: false }
    })
  }
  return p
}
