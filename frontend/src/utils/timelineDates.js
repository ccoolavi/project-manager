// Shared helpers for the My Timeline views.
//
// The app stores date-only values as `YYYY-MM-DDT00:00:00` with no timezone.
// Everything here works with calendar days (a local Date at midnight built
// from the Y-M-D digits), never with instants, so a task never slides to the
// next or previous day for someone in a different timezone.

export const DAY_MS = 86400000

/** '2026-10-05T00:00:00' or '2026-10-05' -> local Date at midnight, or null. */
export function parseDay(value) {
  if (!value || typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

export function startOfToday() {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}

export function addDays(d, n) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

/** Whole calendar days from a to b (DST-safe). */
export function diffDays(a, b) {
  return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS)
}

/** 'YYYY-MM-DD' for a local Date. */
export function dayKey(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** ISO weekday: Mon=1 .. Sun=7 (the numbering the API uses). */
export function isoWeekday(d) {
  return d.getDay() === 0 ? 7 : d.getDay()
}

export function shortDay(d) {
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
}

export const WEEKDAY_LABELS = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 7, label: 'Sun' },
]

// Display windows: one week back so recent work is still visible, then ahead.
export const RANGES = {
  '2w': { label: '2 weeks', back: 7, ahead: 14, dayWidth: 56 },
  '6w': { label: '6 weeks', back: 7, ahead: 42, dayWidth: 28 },
  '3m': { label: '3 months', back: 7, ahead: 91, dayWidth: 16 },
}

export function rangeWindow(today, rangeKey) {
  const r = RANGES[rangeKey] || RANGES['6w']
  const from = addDays(today, -r.back)
  const to = addDays(today, r.ahead)
  return { from, to, totalDays: diffDays(from, to) + 1, dayWidth: r.dayWidth }
}

/** The 6-week Monday-first grid the month view draws. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  const start = new Date(year, month, 1 - offset)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

// One colour per organisation, picked from its id so it never changes when
// another org is hidden or a different window happens not to contain it.
// Class names are written out in full so Tailwind keeps them.
export const ORG_PALETTE = [
  { chip: 'bg-blue-500/20 text-blue-300 border-blue-500/40', bar: 'bg-blue-500/70 border-blue-300', dot: 'bg-blue-400' },
  { chip: 'bg-purple-500/20 text-purple-300 border-purple-500/40', bar: 'bg-purple-500/70 border-purple-300', dot: 'bg-purple-400' },
  { chip: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', bar: 'bg-emerald-600/70 border-emerald-300', dot: 'bg-emerald-400' },
  { chip: 'bg-amber-500/20 text-amber-300 border-amber-500/40', bar: 'bg-amber-600/70 border-amber-300', dot: 'bg-amber-400' },
  { chip: 'bg-pink-500/20 text-pink-300 border-pink-500/40', bar: 'bg-pink-500/70 border-pink-300', dot: 'bg-pink-400' },
  { chip: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40', bar: 'bg-cyan-600/70 border-cyan-300', dot: 'bg-cyan-400' },
  { chip: 'bg-lime-500/20 text-lime-300 border-lime-500/40', bar: 'bg-lime-600/70 border-lime-300', dot: 'bg-lime-400' },
  { chip: 'bg-rose-500/20 text-rose-300 border-rose-500/40', bar: 'bg-rose-500/70 border-rose-300', dot: 'bg-rose-400' },
]

export function orgColor(orgId) {
  return ORG_PALETTE[Math.abs(Number(orgId) || 0) % ORG_PALETTE.length]
}

// Load level -> look. Every level also has words (tooltip, legend), so
// colour is never the only signal.
export const LEVEL_STYLE = {
  light: { cell: 'bg-emerald-500/25', text: 'Light' },
  busy: { cell: 'bg-yellow-400/40', text: 'Busy' },
  over: { cell: 'bg-orange-500/60', text: 'Overloaded' },
  severe: { cell: 'bg-red-500/70', text: 'Severely overloaded' },
}

export const isOverloaded = (level) => level === 'over' || level === 'severe'

/** "6 h", "2.5 h", "~2 h" (the ~ marks a guess, not an estimate). */
export function hoursText(hours, guessed = false) {
  const n = Math.round(Number(hours) * 10) / 10
  return `${guessed ? '~' : ''}${Number.isInteger(n) ? n : n.toFixed(1)} h`
}

/** Plain-words sentence for one warning. `taskById` maps id -> task row. */
export function describeWarning(w, taskById, orgNames) {
  const titles = (w.task_ids || []).map((id) => taskById.get(id)?.title).filter(Boolean)
  const list = titles.length > 3 ? `${titles.slice(0, 3).join(', ')} and ${titles.length - 3} more` : titles.join(', ')
  const when = shortDay(parseDay(w.date) || new Date())
  switch (w.kind) {
    case 'overload': {
      const orgs = new Set((w.task_ids || []).map((id) => taskById.get(id)?.organization_id).filter((x) => x != null))
      const across = w.cross_org ? ` across ${orgs.size || 2} organisations` : ''
      const cap = w.capacity > 0 ? `${hoursText(w.hours)} of work on a ${hoursText(w.capacity)} day` : `${hoursText(w.hours)} of work on a day off`
      return `${when}: ${cap}${across} (${list}).`
    }
    case 'deadline_pileup':
      return `${when}: ${w.task_ids.length} tasks are due the same day (${list}).`
    case 'starts_before_blocker': {
      const b = parseDay(w.blocker_due)
      return `${list} is scheduled to start ${when}, before the task blocking it is due${b ? ` (${shortDay(b)})` : ''}.`
    }
    case 'due_on_day_off':
      return `${list} is due on ${when}, a day off in your working week.`
    case 'overdue':
      return `${list} was due ${when} and is still open.`
    default:
      return `${when}: ${w.kind}`
  }
}

// ---- remembered choices (per person, per browser) -----------------------
// Every access is wrapped: storage can be blocked or full, and the page must
// work the same without it.

export const DEFAULT_PREFS = {
  view: null, // null = pick by screen width
  range: '6w',
  showDone: false,
  hiddenOrgs: [],
  workDays: [1, 2, 3, 4, 5, 6],
  hoursPerDay: 8,
}

const storageKey = (userId) => `kaizen.myTimeline.v1.${userId ?? 'anon'}`

export function loadPrefs(userId) {
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return { ...DEFAULT_PREFS }
    const p = JSON.parse(raw)
    const workDays = Array.isArray(p.workDays) ? p.workDays.filter((n) => Number.isInteger(n) && n >= 1 && n <= 7) : []
    const hours = Number(p.hoursPerDay)
    return {
      view: ['timeline', 'agenda', 'month'].includes(p.view) ? p.view : null,
      range: RANGES[p.range] ? p.range : DEFAULT_PREFS.range,
      showDone: !!p.showDone,
      hiddenOrgs: Array.isArray(p.hiddenOrgs) ? p.hiddenOrgs.filter((n) => Number.isInteger(n)) : [],
      workDays: workDays.length ? [...new Set(workDays)].sort() : DEFAULT_PREFS.workDays,
      hoursPerDay: hours >= 1 && hours <= 24 ? hours : DEFAULT_PREFS.hoursPerDay,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePrefs(userId, prefs) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(prefs))
  } catch {
    // Not remembered; nothing else to do.
  }
}
