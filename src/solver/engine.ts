import { cardId, classCells, type Placement, type Project } from '../model'

export interface SolveOptions {
  timeLimitMs: number
  seed: number
  keepPlacements: boolean
}

export interface Progress {
  iter: number
  elapsed: number
  hard: number
  soft: number
}

type IssueKind =
  | 'noSlot' | 'teacherClash' | 'roomClash' | 'classClash' | 'sameDay'
  | 'maxPerDay' | 'maxGaps' | 'linkMismatch' | 'overload' | 'classGap' | 'underload'

export interface Issue {
  kind: IssueKind
  who: string
  day?: number
  period?: number
  detail?: string
  cards?: string[]
}

interface Stats {
  classGaps: number
  teacherGaps: number
  placedCards: number
  totalCards: number
}

export interface SolveResult {
  placements: Record<string, Placement>
  hard: number
  soft: number
  iterations: number
  issues: Issue[]
  stats: Stats
}

function rng(seed: number) {
  let s = seed >>> 0 || 0x9e3779b9
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 4294967296
  }
}

interface Unit {
  cards: string[]
  len: number
  res: number[]
  lg: number
  domain: Int32Array
  locked: boolean
  fixedStart: number
  label: string
}

const RES_TEACHER = 0, RES_ROOM = 1, RES_CLASS = 2

export class Solver {
  D: number; P: number; S: number
  units: Unit[] = []
  resName: string[] = []
  resType: number[] = []
  cap: Int32Array
  gapW: Float64Array
  compact: Uint8Array
  open: Uint8Array
  maxGaps: Int32Array
  maxPerDay: Int32Array
  leadW: Float64Array
  lgSameDayOk: boolean[] = []
  lgCount: number
  spreadW: number
  pre: Issue[] = []

  occ: Uint16Array
  dayHard: Int32Array
  daySoft: Float64Array
  lgDay: Uint16Array
  lgHard: Int32Array
  lgSoft: Float64Array
  pos: Int32Array
  hard = 0
  soft = 0
  unplaced = 0
  hw = 1500
  mult: Float64Array
  logging = false
  log: number[] = []
  unitsOfRes: number[][]

  constructor(p: Project) {
    const D = (this.D = p.days.length), P = (this.P = p.periods.length), S = (this.S = D * P)
    const resIdx = new Map<string, number>()
    const gapW: number[] = [], maxGaps: number[] = [], maxPerDay: number[] = [], leadW: number[] = []
    const resAvail: string[] = []
    const caps: number[] = []
    const addRes = (key: string, name: string, type: number, avail: string, g: number, mg: number, mpd: number, lw: number) => {
      resIdx.set(key, this.resName.length)
      this.resName.push(name); this.resType.push(type); resAvail.push(avail); caps.push(1)
      gapW.push(g); maxGaps.push(mg); maxPerDay.push(mpd); leadW.push(lw)
    }
    const w = p.weights
    for (const t of p.teachers)
      addRes('t:' + t.id, t.name, RES_TEACHER, t.avail, w.teacherGap, t.maxGapsPerDay ?? -1, t.maxPerDay || 0, 0)
    for (const r of p.useRooms === false ? [] : p.rooms) { addRes('r:' + r.id, r.name, RES_ROOM, r.avail, 0, -1, 0, 0); caps[caps.length - 1] = Math.max(1, r.capacity || 1) }
    const classAtoms = new Map<string, number[]>()
    const groupAtoms = new Map<string, number[]>()
    const cellOf = new Map<number, { cls: string; name: string; groups: string[]; total: number }>()
    for (const c of p.classes) {
      const gName = new Map(c.groups.map(g => [g.id, g.name]))
      const atoms: number[] = []
      for (const cell of classCells(c)) {
        const key = 'c:' + c.id + (cell.key ? ':' + cell.key : '')
        addRes(key, cell.groups.length ? `${c.name} (${cell.groups.map(g => gName.get(g)).join(' + ')})` : c.name, RES_CLASS, c.avail, w.classGap, -1, 0, w.classLateStart)
        const i = resIdx.get(key)!
        atoms.push(i)
        cellOf.set(i, { cls: c.id, name: c.name, groups: cell.groups.map(g => gName.get(g) ?? g), total: 0 })
        for (const g of cell.groups) { const k = c.id + ':' + g; groupAtoms.set(k, [...(groupAtoms.get(k) ?? []), i]) }
      }
      classAtoms.set(c.id, atoms)
      for (const a of atoms) cellOf.get(a)!.total = atoms.length
    }
    const R = this.resName.length
    this.cap = Int32Array.from(caps)
    this.gapW = Float64Array.from(gapW); this.maxGaps = Int32Array.from(maxGaps)
    this.maxPerDay = Int32Array.from(maxPerDay); this.leadW = Float64Array.from(leadW)
    this.compact = Uint8Array.from(this.resType.map(t => (t === RES_CLASS && p.strictClasses !== false ? 1 : 0)))
    this.open = new Uint8Array(R * S)
    for (let r = 0; r < R; r++) for (let s = 0; s < S; s++) this.open[r * S + s] = resAvail[r][s] !== '0' && p.avail[s] !== '0' ? 1 : 0
    this.spreadW = w.spread

    const subj = new Map(p.subjects.map(s => [s.id, s]))
    const clsName = new Map(p.classes.map(c => [c.id, c.short || c.name]))

    const groups: (typeof p.lessons)[] = []
    const byLink = new Map<string, typeof p.lessons>()
    for (const l of p.lessons) {
      if (!l.split.length) continue
      if (l.link) {
        const g = byLink.get(l.link)
        if (g) g.push(l)
        else { const ng = [l]; byLink.set(l.link, ng); groups.push(ng) }
      } else groups.push([l])
    }
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      if (g.length > 1 && g.some(l => l.split.join() !== g[0].split.join())) {
        this.pre.push({ kind: 'linkMismatch', who: g[0].link })
        groups.splice(i, 1, ...g.map(l => [l]))
      }
    }

    const describe = (l: (typeof p.lessons)[number]) =>
      `${subj.get(l.subjectId)?.name ?? '?'} – ${l.classes.map(c => clsName.get(c.classId) ?? '?').join(', ')}`

    this.lgCount = groups.length
    groups.forEach((g, lg) => {
      const res: number[] = [] // not a Set: a teacher or class in two linked lessons is a clash and must count twice
      const avails: string[] = [p.avail]
      for (const l of g) {
        const s = subj.get(l.subjectId)
        if (s) avails.push(s.avail)
        for (const t of l.teacherIds) { const i = resIdx.get('t:' + t); if (i !== undefined) { res.push(i); avails.push(resAvail[i]) } }
        for (const r of l.roomIds) { const i = resIdx.get('r:' + r); if (i !== undefined) { res.push(i); avails.push(resAvail[i]) } }
        for (const c of l.classes) {
          const atoms = classAtoms.get(c.classId)
          if (!atoms) continue
          const cls = p.classes.find(x => x.id === c.classId)!
          if (c.groupId === null || !cls.groups.length) atoms.forEach(a => res.push(a))
          else groupAtoms.get(c.classId + ':' + c.groupId)?.forEach(a => res.push(a))
          avails.push(cls.avail)
        }
      }
      const ok = new Uint8Array(S)
      for (let s = 0; s < S; s++) ok[s] = avails.every(a => a[s] !== '0') ? 1 : 0
      this.lgSameDayOk[lg] = g.every(l => l.sameDayOk)
      g[0].split.forEach((len, part) => {
        const dom: number[] = []
        for (let d = 0; d < D; d++)
          for (let pp = 0; pp + len <= P; pp++) {
            let good = true
            for (let k = 0; k < len; k++) if (!ok[d * P + pp + k]) { good = false; break }
            if (good) dom.push(d * P + pp)
          }
        const cards = g.map(l => cardId(l.id, part))
        let locked = false, fixedStart = -1
        for (const c of cards) {
          const pl = p.placements[c]
          if (pl?.locked && pl.period + len <= P && pl.day < D) { locked = true; fixedStart = pl.day * P + pl.period }
        }
        const label = g.map(describe).join(' / ') + ` (${len}h)`
        if (!dom.length && !locked) this.pre.push({ kind: 'noSlot', who: label, cards })
        this.units.push({ cards, len, res, lg, domain: Int32Array.from(dom), locked, fixedStart, label })
      })
    })

    const touch: number[][] = Array.from({ length: R }, () => [])
    this.units.forEach((u, i) => u.res.forEach(r => touch[r].push(i)))
    const first = new Map<string, number>(), members = new Map<number, number[]>()
    this.mult = new Float64Array(R).fill(1)
    for (const [r, cell] of cellOf) {
      const k = cell.cls + '|' + touch[r].join(',')
      const f = first.get(k)
      if (f === undefined) { first.set(k, r); members.set(r, [r]) }
      else { members.get(f)!.push(r); this.mult[r] = 0 }
    }
    for (const [r, ms] of members) {
      if (ms.length < 2) continue
      this.mult[r] = ms.length
      const cell = cellOf.get(r)!, common = cell.groups.filter(g => ms.every(m => cellOf.get(m)!.groups.includes(g)))
      this.resName[r] = ms.length === cell.total || !common.length ? cell.name : `${cell.name} (${common.join(' + ')})`
    }
    for (const u of this.units) u.res = u.res.filter(r => this.mult[r] > 0)

    const need = new Int32Array(R)
    for (const u of this.units) for (const r of u.res) need[r] += u.len
    for (let r = 0; r < R; r++) {
      let open = 0
      for (let s = 0; s < S; s++) if (resAvail[r][s] !== '0' && p.avail[s] !== '0') open++
      if (need[r] > open * caps[r]) this.pre.push({ kind: 'overload', who: this.resName[r], detail: `${need[r]} > ${open * caps[r]}` })
      else if (this.compact[r] && need[r] > 0 && need[r] < open) this.pre.push({ kind: 'underload', who: this.resName[r], detail: `${need[r]} < ${open}` })
    }

    this.occ = new Uint16Array(R * S)
    this.dayHard = new Int32Array(R * D)
    this.daySoft = new Float64Array(R * D)
    this.lgDay = new Uint16Array(this.lgCount * D)
    this.lgHard = new Int32Array(this.lgCount)
    this.lgSoft = new Float64Array(this.lgCount)
    this.pos = new Int32Array(this.units.length).fill(-1)
    this.unplaced = this.units.length
    this.unitsOfRes = Array.from({ length: R }, () => [])
    this.units.forEach((u, i) => new Set(u.res).forEach(r => this.unitsOfRes[r].push(i)))
  }

  private dsHours = 0
  private dsConf = 0
  private dsGaps = 0
  private dsLead = 0

  dayStats(r: number, d: number) {
    const P = this.P, base = r * this.S + d * P
    let first = -1, last = -1, hours = 0, conf = 0
    for (let p = 0; p < P; p++) {
      const c = this.occ[base + p]
      if (c) {
        if (first < 0) first = p
        last = p; hours++
        if (c > this.cap[r]) conf += c - this.cap[r]
      }
    }
    let gaps = 0, lead = 0
    if (hours) {
      for (let p = first + 1; p < last; p++) if (!this.occ[base + p] && this.open[base + p]) gaps++
      for (let p = 0; p < first; p++) if (this.open[base + p]) lead++
    }
    this.dsHours = hours; this.dsConf = conf; this.dsGaps = gaps; this.dsLead = lead
  }

  dayCost(r: number): [number, number] {
    const hours = this.dsHours, gaps = this.dsGaps, lead = this.dsLead
    const m = this.mult[r]
    let hard = this.dsConf * m, soft = 0
    if (hours) {
      soft = (gaps * this.gapW[r] + lead * this.leadW[r]) * m
      if (this.compact[r]) hard += (gaps + lead) * m
      const mg = this.maxGaps[r]
      if (mg >= 0 && gaps > mg) hard += gaps - mg
      const mpd = this.maxPerDay[r]
      if (mpd > 0 && hours > mpd) hard += hours - mpd
    }
    return [hard, soft]
  }

  rowEval(r: number, d: number) {
    this.dayStats(r, d)
    const [hard, soft] = this.dayCost(r)
    const i = r * this.D + d
    this.hard += hard - this.dayHard[i]
    this.soft += soft - this.daySoft[i]
    this.dayHard[i] = hard
    this.daySoft[i] = soft
  }

  lgEval(lg: number) {
    const D = this.D, base = lg * D
    let hard = 0, soft = 0
    const ok = this.lgSameDayOk[lg]
    for (let d = 0; d < D; d++) {
      const n = this.lgDay[base + d]
      if (n > 1 && !ok) hard += n - 1
      if (d + 1 < D && n && this.lgDay[base + d + 1]) soft += this.spreadW
    }
    this.hard += hard - this.lgHard[lg]
    this.soft += soft - this.lgSoft[lg]
    this.lgHard[lg] = hard
    this.lgSoft[lg] = soft
  }

  apply(u: number, s: number, sign: 1 | -1) {
    const unit = this.units[u]
    const S = this.S, d = (s / this.P) | 0
    for (const r of unit.res) {
      const base = r * S + s
      for (let k = 0; k < unit.len; k++) this.occ[base + k] += sign
      this.rowEval(r, d)
    }
    this.lgDay[unit.lg * this.D + d] += sign
    this.lgEval(unit.lg)
  }

  moveTo(u: number, s: number) {
    const old = this.pos[u]
    if (old === s) return
    if (this.logging) this.log.push(u, old)
    if (old >= 0) this.apply(u, old, -1)
    else this.unplaced--
    this.pos[u] = s
    if (s >= 0) this.apply(u, s, 1)
    else this.unplaced++
  }

  get obj() { return (this.hard + this.unplaced) * this.hw + this.soft }

  beginMove() { this.log.length = 0; this.logging = true }
  undoMove() {
    this.logging = false
    for (let i = this.log.length - 2; i >= 0; i -= 2) this.moveTo(this.log[i], this.log[i + 1])
  }

  isBad(u: number) {
    const s = this.pos[u]
    if (s < 0) return true
    const d = (s / this.P) | 0
    if (this.lgHard[this.units[u].lg]) return true
    for (const r of this.units[u].res) if (this.dayHard[r * this.D + d]) return true
    return false
  }

  init(p: Project, keep: boolean, rand: () => number) {
    const order: number[] = []
    this.units.forEach((u, i) => {
      if (u.locked) this.moveTo(i, u.fixedStart)
      else if (keep) {
        const pl = p.placements[u.cards[0]]
        const s = pl ? pl.day * this.P + pl.period : -1
        if (pl && u.domain.includes(s)) this.moveTo(i, s)
        else order.push(i)
      } else order.push(i)
    })
    const key = (i: number) => this.units[i].domain.length / (this.units[i].len * (1 + this.units[i].res.length))
    order.sort((a, b) => key(a) - key(b) || rand() - 0.5)
    for (const u of order) this.placeBest(u, rand)
  }

  placeBest(u: number, rand: () => number) {
    const dom = this.units[u].domain
    if (!dom.length) return
    let best = Infinity, bestS = -1, ties = 0
    for (let i = 0; i < dom.length; i++) {
      const s = dom[i]
      this.moveTo(u, s)
      const c = this.obj
      if (c < best) { best = c; bestS = s; ties = 1 }
      else if (c === best && rand() * ++ties < 1) bestS = s
    }
    this.moveTo(u, bestS)
  }

  clashing(u: number): number[] {
    const s = this.pos[u], unit = this.units[u], out: number[] = []
    if (s < 0) return out
    for (const r of unit.res)
      for (let k = 0; k < unit.len; k++) {
        if (this.occ[r * this.S + s + k] <= this.cap[r]) continue
        const t = s + k
        for (const v of this.unitsOfRes[r]) {
          const pv = this.pos[v]
          if (v !== u && pv >= 0 && pv <= t && pv + this.units[v].len > t && !this.units[v].locked && !out.includes(v)) out.push(v)
        }
      }
    return out
  }

  private rand: () => number = Math.random
  private opt!: SolveOptions
  private movable: number[] = []
  private bestHard = 0
  private bestSoft = 0
  private bestPos = new Int32Array(0)
  private iter = 0
  private t0 = 0
  private lastBestAt = 0
  private bad: number[] = []
  private phaseStart = 0
  private phase = 0
  private T0 = 400
  private done = false

  start(p: Project, opt: SolveOptions) {
    this.opt = opt
    this.rand = rng(opt.seed)
    this.t0 = this.lastBestAt = this.phaseStart = performance.now()
    this.init(p, opt.keepPlacements, this.rand)
    this.movable = this.units.map((_, i) => i).filter(i => !this.units[i].locked && this.units[i].domain.length > 1)
    this.bestHard = this.hard + this.unplaced
    this.bestSoft = this.soft
    this.bestPos = this.pos.slice()
    this.done = !this.movable.length || (!this.bestHard && !this.bestSoft)
  }

  progress(): Progress {
    return { iter: this.iter, elapsed: performance.now() - this.t0, hard: this.bestHard, soft: this.bestSoft }
  }

  step(budgetMs: number): boolean {
    if (this.done) return true
    const rand = this.rand, opt = this.opt, movable = this.movable
    const stepEnd = performance.now() + budgetMs
    const phaseLen = Math.max(1500, opt.timeLimitMs / 5)
    const stagnation = Math.max(2500, opt.timeLimitMs * 0.3)
    const T1 = 0.5
    let T = this.T0
    for (;;) {
      if ((this.iter & 255) === 0) {
        const now = performance.now()
        if (now - this.t0 > opt.timeLimitMs) { this.done = true; break }
        if (this.bestHard === 0 && now - this.lastBestAt > stagnation) { this.done = true; break }
        if (now > stepEnd) break
        const frac = (now - this.phaseStart) / phaseLen
        if (frac >= 1) {
          for (let u = 0; u < this.units.length; u++) this.moveTo(u, this.bestPos[u])
          this.phase++
          this.phaseStart = now
          if (this.bestHard > 0) { this.hw = this.phase % 2 ? 300 : 1500; this.T0 = 400 }
          else { this.hw = 2000; this.T0 = 150 }
        }
        T = this.T0 * Math.pow(T1 / this.T0, Math.min(1, frac))
      }
      if ((this.iter & 1023) === 0) {
        this.bad = []
        for (const u of movable) if (this.isBad(u)) this.bad.push(u)
      }
      this.iter++
      const bad = this.bad
      const u = bad.length && rand() < 0.5 ? bad[(rand() * bad.length) | 0] : movable[(rand() * movable.length) | 0]
      const old = this.pos[u]
      const before = this.obj
      const mv = rand()
      this.beginMove()
      if (mv < 0.25) {
        const unit = this.units[u]
        const peers = this.unitsOfRes[unit.res[(rand() * unit.res.length) | 0]]
        const v = peers[(rand() * peers.length) | 0]
        const vu = this.units[v]
        const ov = this.pos[v]
        if (v === u || vu.locked || vu.len !== unit.len || ov === old || ov < 0 || old < 0) continue
        if (!unit.domain.includes(ov) || !vu.domain.includes(old)) continue
        this.moveTo(u, -1); this.moveTo(v, old); this.moveTo(u, ov)
      } else if (mv < 0.29) {
        const dom = this.units[u].domain
        this.moveTo(u, dom[(rand() * dom.length) | 0])
        for (const v of this.clashing(u)) if (this.units[v].domain.length <= 120) this.placeBest(v, rand)
      } else if (mv < 0.31 && this.units[u].domain.length <= 120) {
        this.placeBest(u, rand)
      } else {
        const dom = this.units[u].domain
        const s = dom[(rand() * dom.length) | 0]
        if (s === old) continue
        this.moveTo(u, s)
      }
      this.logging = false
      const delta = this.obj - before
      if (delta > 0 && rand() >= Math.exp(-delta / T)) { this.undoMove(); continue }
      const h = this.hard + this.unplaced
      if (h < this.bestHard || (h === this.bestHard && this.soft < this.bestSoft - 1e-9)) {
        this.bestHard = h; this.bestSoft = this.soft
        this.bestPos = this.pos.slice()
        this.lastBestAt = performance.now()
        if (!h && !this.soft) { this.done = true; break }
      }
    }
    return this.done
  }

  finish(): SolveResult {
    this.logging = false
    for (let u = 0; u < this.units.length; u++) this.moveTo(u, this.bestPos[u])
    return this.result(this.iter)
  }

  solve(p: Project, opt: SolveOptions, onProgress?: (p: Progress) => void, shouldStop?: () => boolean): SolveResult {
    this.start(p, opt)
    while (!this.step(200)) {
      onProgress?.(this.progress())
      if (shouldStop?.()) break
    }
    return this.finish()
  }

  parts() {
    const D = this.D
    let hard = 0, soft = 0
    for (let r = 0; r < this.resName.length; r++) {
      for (let d = 0; d < D; d++) {
        this.dayStats(r, d)
        const [h, so] = this.dayCost(r)
        hard += h; soft += so
      }
    }
    for (let lg = 0; lg < this.lgCount; lg++)
      for (let d = 0; d < D; d++) {
        const n = this.lgDay[lg * D + d]
        if (n > 1 && !this.lgSameDayOk[lg]) hard += n - 1
        if (d + 1 < D && n && this.lgDay[lg * D + d + 1]) soft += this.spreadW
      }
    const unplaced = this.pos.reduce((a, s) => a + (s < 0 ? 1 : 0), 0)
    return { hard: hard + unplaced, soft }
  }

  result(iter: number): SolveResult {
    const { D, P, S } = this
    const placements: Record<string, Placement> = {}
    let placed = 0
    this.units.forEach((u, i) => {
      const s = this.pos[i]
      if (s < 0) return
      placed += u.cards.length
      for (const c of u.cards) placements[c] = { day: (s / P) | 0, period: s % P, locked: u.locked }
    })
    const issues: Issue[] = [...this.pre]
    let classGaps = 0, teacherGaps = 0
    const clashKind: IssueKind[] = ['teacherClash', 'roomClash', 'classClash']
    for (let r = 0; r < this.resName.length; r++) {
      for (let d = 0; d < D; d++) {
        let hours = 0
        for (let p = 0; p < P; p++) {
          const c = this.occ[r * S + d * P + p]
          if (!c) continue
          hours++
          if (c > this.cap[r]) {
            const cards = this.units.flatMap((u, i) => {
              const s = this.pos[i]
              return u.res.includes(r) && s >= 0 && s <= d * P + p && s + u.len > d * P + p ? u.cards : []
            })
            issues.push({ kind: clashKind[this.resType[r]], who: this.resName[r], day: d, period: p, cards })
          }
        }
        if (!hours) continue
        this.dayStats(r, d)
        const gaps = this.dsGaps
        if (this.resType[r] === RES_CLASS) classGaps += gaps + this.dsLead
        if (this.compact[r] && (gaps || this.dsLead)) issues.push({ kind: 'classGap', who: this.resName[r], day: d, detail: String(gaps + this.dsLead) })
        if (this.resType[r] === RES_TEACHER) teacherGaps += gaps
        if (this.maxGaps[r] >= 0 && gaps > this.maxGaps[r]) issues.push({ kind: 'maxGaps', who: this.resName[r], day: d, detail: `${gaps} > ${this.maxGaps[r]}` })
        if (this.maxPerDay[r] > 0 && hours > this.maxPerDay[r]) issues.push({ kind: 'maxPerDay', who: this.resName[r], day: d, detail: `${hours} > ${this.maxPerDay[r]}` })
      }
    }
    for (let lg = 0; lg < this.lgCount; lg++) {
      if (this.lgSameDayOk[lg]) continue
      for (let d = 0; d < D; d++)
        if (this.lgDay[lg * D + d] > 1) {
          const us = this.units.filter((_u, i) => this.units[i].lg === lg && this.pos[i] >= 0 && ((this.pos[i] / P) | 0) === d)
          issues.push({ kind: 'sameDay', who: us[0].label.replace(/ \(\d+h\)$/, ''), day: d, cards: us.flatMap(u => u.cards) })
        }
    }
    const totalCards = this.units.reduce((a, u) => a + u.cards.length, 0)
    return {
      placements, ...this.parts(), iterations: iter, issues,
      stats: { classGaps, teacherGaps, placedCards: placed, totalCards },
    }
  }
}

export function evaluate(p: Project): SolveResult {
  const s = new Solver(p)
  s.units.forEach((u, i) => {
    const pl = p.placements[u.cards[0]]
    if (pl && pl.day < s.D && pl.period + u.len <= s.P) s.moveTo(i, pl.day * s.P + pl.period)
  })
  return s.result(0)
}

export function solve(p: Project, opt: SolveOptions, onProgress?: (p: Progress) => void, shouldStop?: () => boolean) {
  return new Solver(p).solve(p, opt, onProgress, shouldStop)
}
