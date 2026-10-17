// Import .dprg project files (.dprg = gzip-compressed UTF-16 XML).

import { DEFAULT_WEIGHTS, fullGrid, pickColor, type ClassRef, type Lesson, type Project } from '../model'

async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const ds = new DecompressionStream('gzip')
  const stream = new Blob([buf]).stream().pipeThrough(ds)
  return await new Response(stream).arrayBuffer()
}

function decodeText(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf)
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b)
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b)
  if (b[0] === 0x3c && b[1] === 0) return new TextDecoder('utf-16le').decode(b)
  return new TextDecoder('utf-8').decode(b)
}

export async function readDprg(buf: ArrayBuffer): Promise<Project> {
  const b = new Uint8Array(buf)
  const raw = b[0] === 0x1f && b[1] === 0x8b ? await gunzip(buf) : buf
  const xml = decodeText(raw)
  if (!xml.includes('<DersProgrami')) throw new Error('Unsupported file: this Dagitmatik file format is not supported (only XML-based .dprg projects).')
  return dprgXmlToProject(xml)
}

export function dprgXmlToProject(xml: string, parser: DOMParser = new DOMParser()): Project {
  const doc = parser.parseFromString(xml, 'text/xml')
  const root = doc.documentElement
  const kids = (el: Element | null | undefined, tag: string) => (el ? Array.from(el.getElementsByTagName(tag)) : [])
  const txt = (el: Element | null | undefined, tag: string) => (el ? kids(el, tag)[0]?.textContent?.trim() ?? '' : '')
  const general = kids(root, 'GenelAyarlar')[0]

  const days = kids(kids(general, 'Gunler')[0], 'Gun').map(e => e.textContent ?? '')
  const times = kids(kids(general, 'Saatler')[0], 'Saat').map(e => e.textContent ?? '')
  const D = days.length || Number(txt(general, 'HaftalikGunSayisi')) || 5
  const P = times.length || Number(txt(general, 'GunlukDersSaatiSayisi')) || 8
  const S = D * P
  const grid = (s: string) => (s.length >= S ? s.slice(0, S).replace(/[^0]/g, '1') : fullGrid(D, P))

  const ents = (section: string, tag: string, offset: number) =>
    kids(kids(root, section)[0], tag).map((e, i) => ({
      id: e.getAttribute('Id') ?? String(i),
      name: txt(e, 'Adi'),
      short: txt(e, 'KisaAdi') || txt(e, 'Adi').slice(0, 4),
      color: pickColor(i + offset),
      avail: grid(txt(e, 'Kosul')),
      el: e,
    }))
  const strip = <T extends { el: Element }>(x: T) => { const { el, ...rest } = x; void el; return rest }

  const subjects = ents('Dersler', 'Ders', 0).map(strip)
  const teachers = ents('Ogretmenler', 'Ogretmen', 3).map(t => ({ ...strip(t), maxPerDay: 0, maxDays: 0, maxGapsPerDay: -1 }))
  const rooms = ents('Derslikler', 'Derslik', 7).map(r => ({ ...strip(r), capacity: 1 }))
  const classes = ents('Siniflar', 'Sinif', 11).map(c => ({
    ...strip(c),
    groups: kids(c.el, 'Grup')
      .filter(g => g.getAttribute('Id') !== '0')
      .map(g => ({ id: g.getAttribute('Id') ?? '', name: txt(g, 'Adi') || txt(g, 'KisaAdi') })),
  }))

  const ids = (s: string | null) => (s ?? '').split(/[,;|&]/).map(x => x.trim()).filter(Boolean)
  const lessons: Lesson[] = kids(kids(root, 'TanimliDersler')[0], 'TanimliDers').map(e => {
    const classRefs: ClassRef[] = ids(e.getAttribute('SinifGruplar')).map(cg => {
      const [c, g] = cg.split(':')
      return { classId: c, groupId: !g || g === '0' ? null : g }
    })
    return {
      id: 'd' + (e.getAttribute('Id') ?? Math.random()),
      subjectId: e.getAttribute('DersId') ?? '',
      teacherIds: ids(e.getAttribute('Ogretmenler')),
      roomIds: ids(e.getAttribute('Derslikler')),
      classes: classRefs,
      split: (e.getAttribute('Yerlesim') ?? '1').split('+').map(Number).filter(n => n > 0),
      sameDayOk: false,
      link: '',
    }
  })

  return {
    version: 1,
    school: { name: txt(general, 'OkulAdi'), year: txt(general, 'OgretimYili'), principal: txt(general, 'OkulMuduru') },
    days: days.length ? days : Array.from({ length: D }, (_, i) => `Gün ${i + 1}`),
    periods: Array.from({ length: P }, (_, i) => ({ label: String(i + 1), time: times[i] ?? '' })),
    avail: grid(txt(general, 'Kosullar')),
    subjects, teachers, rooms, classes, lessons,
    placements: {},
    weights: { ...DEFAULT_WEIGHTS },
    strictClasses: true,
    useRooms: lessons.some(l => l.roomIds.length > 0),
    schoolType: '', // .dprg files do not say; the user picks it on the School page
  }
}
