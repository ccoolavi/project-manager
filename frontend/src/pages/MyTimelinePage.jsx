import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react'
import api from '../utils/api'
import { errorMessage } from '../utils/errors'
import { useAuth } from '../context/AuthContext'
import TaskDetailPanel from '../components/TaskDetailPanel'
import MyTimelineView from '../components/MyTimelineView'
import MyAgendaView, { TaskListSection } from '../components/MyAgendaView'
import MyMonthView from '../components/MyMonthView'
import {
  RANGES, WEEKDAY_LABELS, LEVEL_STYLE, addDays, dayKey, describeWarning, diffDays, hoursText, isOverloaded,
  loadPrefs, monthGrid, orgColor, parseDay, rangeWindow, savePrefs, shortDay, startOfToday,
} from '../utils/timelineDates'

const VIEWS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'month', label: 'Month' },
]

// Warnings that put a task "in a clash" (ring on its bar).
const CLASH_KINDS = new Set(['overload', 'deadline_pileup', 'starts_before_blocker'])

/**
 * Everything assigned to me, across every organisation I belong to, laid out
 * so I can plan and avoid overlaps. The server does the arithmetic (how many
 * hours each day needs, which days are overloaded, which deadlines pile up);
 * this page only draws it and remembers a few personal choices.
 */
export default function MyTimelinePage() {
  const { user } = useAuth()
  const userId = user?.id

  const [prefs, setPrefsState] = useState(() => loadPrefs(userId))
  const updatePrefs = useCallback((patch) => {
    setPrefsState((cur) => {
      const next = { ...cur, ...patch }
      savePrefs(userId, next)
      return next
    })
  }, [userId])

  const today = useMemo(() => startOfToday(), [])
  const [autoView] = useState(() => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'agenda' : 'timeline'))
  const view = prefs.view || autoView

  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [focus, setFocus] = useState(null) // { date: Date } — new object each time so the same day can be re-focused
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [hoursDraft, setHoursDraft] = useState(String(prefs.hoursPerDay))
  const [open, setOpen] = useState(null) // { task, members, projectId, subProjectId, orgId }
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const reqId = useRef(0)

  // The window we ask the server about follows the view.
  const win = useMemo(() => {
    if (view === 'month') {
      const grid = monthGrid(cursor.year, cursor.month)
      const from = grid[0], to = grid[grid.length - 1]
      return { from, to, totalDays: diffDays(from, to) + 1, dayWidth: 0 }
    }
    return rangeWindow(today, prefs.range)
  }, [view, cursor, prefs.range, today])

  const query = useMemo(() => ({
    from: dayKey(win.from),
    to: dayKey(win.to),
    include_done: prefs.showDone,
    work_days: prefs.workDays.join(','),
    hours_per_day: prefs.hoursPerDay,
    today: dayKey(today),
  }), [win, prefs.showDone, prefs.workDays, prefs.hoursPerDay, today])

  const load = useCallback(async () => {
    const mine = ++reqId.current
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/me/timeline', { params: query })
      if (mine !== reqId.current) return // a newer request is already on its way
      setData(res.data)
    } catch (err) {
      if (mine !== reqId.current) return
      setError(errorMessage(err, 'Could not load your timeline.'))
    }
    if (mine === reqId.current) setLoading(false)
  }, [query])

  useEffect(() => { load() }, [load])

  // Offline, the service worker may answer from its saved copy of an earlier plan. Say so, and refresh once the
  // connection is back, so nobody plans from a stale picture without knowing it.
  useEffect(() => {
    const goOnline = () => { setOnline(true); load() }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [load])

  const tasks = data?.tasks || []
  const days = data?.days || []
  const warnings = data?.warnings || []

  const orgNames = useMemo(() => {
    const m = new Map()
    for (const t of tasks) m.set(t.organization_id, t.organization_name)
    for (const s of data?.sprints || []) m.set(s.organization_id, s.organization_name)
    return m
  }, [tasks, data])
  const orgList = useMemo(() => [...orgNames.entries()].sort((a, b) => a[1].localeCompare(b[1])), [orgNames])
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const hidden = useMemo(() => new Set(prefs.hiddenOrgs), [prefs.hiddenOrgs])
  const visibleTasks = useMemo(() => tasks.filter((t) => !hidden.has(t.organization_id)), [tasks, hidden])
  const visibleSprints = useMemo(() => (data?.sprints || []).filter((s) => !hidden.has(s.organization_id)), [data, hidden])
  const clashTaskIds = useMemo(() => {
    const ids = new Set()
    for (const w of warnings) if (CLASH_KINDS.has(w.kind)) w.task_ids.forEach((id) => ids.add(id))
    return ids
  }, [warnings])

  const toggleOrg = (id) => updatePrefs({ hiddenOrgs: hidden.has(id) ? prefs.hiddenOrgs.filter((x) => x !== id) : [...prefs.hiddenOrgs, id] })

  const toggleWorkDay = (n) => {
    const has = prefs.workDays.includes(n)
    if (has && prefs.workDays.length === 1) return // a week needs at least one working day
    updatePrefs({ workDays: has ? prefs.workDays.filter((x) => x !== n) : [...prefs.workDays, n].sort() })
  }
  const commitHours = () => {
    const n = Number(hoursDraft)
    if (Number.isFinite(n) && n >= 1 && n <= 24) updatePrefs({ hoursPerDay: n })
    else setHoursDraft(String(prefs.hoursPerDay))
  }

  // ---- the headline ------------------------------------------------------
  const banner = useMemo(() => {
    if (!data) return null
    const overloaded = days.filter((d) => isOverloaded(d.level) && parseDay(d.date) >= today)
    const covers = win.from <= today && win.to >= addDays(today, 13)
    const soon = overloaded.filter((d) => parseDay(d.date) <= addDays(today, 13))
    const scope = covers ? 'Next 2 weeks' : 'In this view'
    const list = covers ? soon : overloaded
    const first = list[0]
    if (!first) {
      const later = overloaded[0]
      return {
        tone: 'good',
        text: `${scope}: no overloaded days.`,
        extra: later ? `Next clash: ${describeClash(later, orgNames)}` : null,
        date: later ? later.date : null,
      }
    }
    const severe = list.some((d) => d.level === 'severe')
    return {
      tone: severe ? 'bad' : 'warn',
      text: `${scope}: ${list.length} overloaded day${list.length === 1 ? '' : 's'}.`,
      extra: `First clash: ${describeClash(first, orgNames)}`,
      date: first.date,
    }
  }, [data, days, today, win, orgNames])

  const showDate = (iso) => {
    const d = parseDay(iso)
    if (!d) return
    if (view === 'month') setCursor({ year: d.getFullYear(), month: d.getMonth() })
    setFocus({ date: d })
  }

  // ---- opening a task ----------------------------------------------------
  const openTask = async (t) => {
    const base = `/api/orgs/${t.organization_id}/projects/${t.project_id}/tasks/${t.sub_project_id}/${t.id}`
    try {
      // The summary row has no assignee or description; the panel needs the full task.
      const [full, members] = await Promise.all([
        api.get(base),
        api.get(`/api/orgs/${t.organization_id}/members`).catch(() => ({ data: [] })),
      ])
      setOpen({ task: full.data, members: members.data, orgId: t.organization_id, projectId: t.project_id, subProjectId: t.sub_project_id })
    } catch (err) {
      setError(errorMessage(err, 'Could not open that task.'))
    }
  }

  const unscheduled = visibleTasks.filter((t) => !t.due_date && t.status !== 'done')
  const overdueTasks = visibleTasks.filter((t) => t.overdue)
  const firstLoad = loading && !data

  return (
    <div className="space-y-4">
      {error && (
        <div role="alert" className="flex items-center justify-between gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
          <span>{error}</span>
          <button onClick={load} className="shrink-0 px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded">Try again</button>
        </div>
      )}

      {!online && (
        <div role="status" data-testid="offline-note" className="text-sm text-slate-200 bg-slate-700/60 border border-slate-600 rounded px-3 py-2">
          You are offline. What you see is the last plan saved on this device and may be out of date.
        </div>
      )}

      {firstLoad && !error && <p className="text-slate-400">Loading...</p>}

      {data && (
        <>
          {/* Headline */}
          {banner && (
            <div
              data-testid="timeline-banner"
              data-tone={banner.tone}
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm ${
                banner.tone === 'good' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : banner.tone === 'warn' ? 'bg-amber-500/10 border-amber-500/40 text-amber-100'
                    : 'bg-red-500/10 border-red-500/40 text-red-100'
              }`}
            >
              {banner.tone === 'good' ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertTriangle size={16} aria-hidden="true" />}
              <span className="font-semibold">{banner.text}</span>
              {banner.extra && <span>{banner.extra}</span>}
              {banner.date && (
                <button onClick={() => showDate(banner.date)} className="px-2 py-0.5 text-xs bg-slate-700/80 hover:bg-slate-600 text-white rounded">Show</button>
              )}
            </div>
          )}

          {/* Controls */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label="View" className="inline-flex rounded overflow-hidden border border-slate-600">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => updatePrefs({ view: v.id })}
                    aria-pressed={view === v.id}
                    className={`px-3 py-1 text-xs ${view === v.id ? 'bg-brand-600 text-white' : 'bg-slate-900 text-slate-300 hover:bg-slate-700'}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              {view !== 'month' && (
                <label className="text-xs text-slate-400 flex items-center gap-1.5">
                  Range
                  <select
                    value={prefs.range}
                    onChange={(e) => updatePrefs({ range: e.target.value })}
                    aria-label="Range"
                    className="bg-slate-900 border border-slate-600 rounded px-1.5 py-1 text-xs text-white"
                  >
                    {Object.entries(RANGES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
                  </select>
                </label>
              )}

              <label className="text-xs text-slate-300 flex items-center gap-1.5">
                <input type="checkbox" checked={prefs.showDone} onChange={(e) => updatePrefs({ showDone: e.target.checked })} />
                Show done
              </label>

              <button
                onClick={() => setSettingsOpen((o) => !o)}
                aria-expanded={settingsOpen}
                className="ml-auto inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded"
              >
                <Settings2 size={13} aria-hidden="true" /> Working week
              </button>
              {loading && <span className="text-xs text-slate-500" role="status">Updating…</span>}
            </div>

            {settingsOpen && (
              <div className="border border-slate-700 rounded p-3 bg-slate-900/60 space-y-2" data-testid="week-settings">
                <p className="text-xs text-slate-400">
                  Used only to judge how full each day is. Saved on this device, not shared with anyone.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <div role="group" aria-label="Working days" className="flex flex-wrap gap-2">
                    {WEEKDAY_LABELS.map((d) => (
                      <label key={d.n} className="text-xs text-slate-200 flex items-center gap-1">
                        <input type="checkbox" checked={prefs.workDays.includes(d.n)} onChange={() => toggleWorkDay(d.n)} aria-label={d.label} />
                        {d.label}
                      </label>
                    ))}
                  </div>
                  <label className="text-xs text-slate-200 flex items-center gap-1.5">
                    Hours per day
                    <input
                      type="number" min={1} max={24} step={0.5}
                      value={hoursDraft}
                      aria-label="Hours per day"
                      onChange={(e) => setHoursDraft(e.target.value)}
                      onBlur={commitHours}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      className="w-16 bg-slate-900 border border-slate-600 rounded px-1.5 py-1 text-xs text-white"
                    />
                  </label>
                </div>
              </div>
            )}

            {orgList.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Organisations">
                {orgList.map(([id, name]) => {
                  const off = hidden.has(id)
                  return (
                    <button
                      key={id}
                      onClick={() => toggleOrg(id)}
                      aria-pressed={!off}
                      title={off ? `Show ${name}` : `Hide ${name}`}
                      data-org-chip={id}
                      className={`text-[11px] px-2 py-0.5 rounded-full border ${orgColor(id).chip} ${off ? 'opacity-40 line-through' : ''}`}
                    >
                      {name}
                    </button>
                  )
                })}
                {hidden.size > 0 && (
                  <span className="text-[11px] text-slate-500">Hidden organisations still count in the daily load and the warnings.</span>
                )}
              </div>
            )}

            <p className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
              {Object.entries(LEVEL_STYLE).map(([k, s]) => (
                <span key={k} className="inline-flex items-center gap-1"><span className={`inline-block w-3 h-3 rounded-sm ${s.cell}`} />{s.text}</span>
              ))}
              <span>~ guessed effort (add an estimate on the task)</span>
              <span>Red ring = involved in a clash</span>
            </p>
          </div>

          {/* The chosen view */}
          <div className={`bg-slate-800 border border-slate-700 rounded-lg p-4 ${loading ? 'opacity-70' : ''}`}>
            {view !== 'month' && tasks.length === 0 && !loading && days.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center" data-testid="timeline-empty">
                Nothing is assigned to you in this range{prefs.showDone ? '' : ' (done tasks are hidden)'}. Tasks show up here once they are assigned to you in any of your organisations.
              </p>
            ) : view === 'timeline' ? (
              <MyTimelineView
                tasks={visibleTasks} days={days} sprints={visibleSprints} win={win} workDays={prefs.workDays} today={today}
                orgNames={orgNames} clashTaskIds={clashTaskIds} focusDate={focus?.date} onOpenTask={openTask}
              />
            ) : view === 'agenda' ? (
              <MyAgendaView
                tasks={visibleTasks} days={days} win={win} today={today}
                clashTaskIds={clashTaskIds} focusDate={focus?.date} onOpenTask={openTask}
              />
            ) : (
              <MyMonthView
                tasks={visibleTasks} days={days} cursor={cursor} onCursor={setCursor} today={today}
                clashTaskIds={clashTaskIds} onOpenTask={openTask}
              />
            )}
          </div>

          {view !== 'agenda' && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-4 empty:hidden">
              <TaskListSection
                title="Overdue" testId="overdue-list" tasks={overdueTasks} clashTaskIds={clashTaskIds} onOpenTask={openTask}
                hint="Still open after their due date. Their remaining work is counted on today."
              />
              <TaskListSection
                title="No due date" testId="unscheduled-list" tasks={unscheduled} clashTaskIds={clashTaskIds} onOpenTask={openTask}
                hint="These have no place on the calendar and are not counted in the daily load. Give them a due date to plan them."
              />
            </div>
          )}

          {warnings.length > 0 && (
            <details className="bg-slate-800 border border-slate-700 rounded-lg p-4" data-testid="warnings-panel">
              <summary className="cursor-pointer text-sm font-semibold text-white">Heads-up list ({warnings.length})</summary>
              <ul className="mt-2 space-y-1.5">
                {warnings.map((w, i) => (
                  <li key={i} data-kind={w.kind} data-severity={w.severity} className="text-xs text-slate-300 flex items-start gap-2">
                    <span className={`shrink-0 mt-0.5 inline-block w-2 h-2 rounded-full ${w.severity === 'red' ? 'bg-red-500' : w.severity === 'amber' ? 'bg-amber-400' : 'bg-slate-500'}`} aria-hidden="true" />
                    <span className="flex-1">{describeWarning(w, taskById, orgNames)}</span>
                    <button onClick={() => showDate(w.date)} className="shrink-0 text-brand-300 hover:underline">Show</button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {open && (
        <TaskDetailPanel
          orgId={open.orgId}
          projectId={open.projectId}
          subProjectId={open.subProjectId}
          task={open.task}
          members={open.members}
          onClose={() => setOpen(null)}
          onTaskUpdate={(updated) => {
            // Keep the drawer open on the saved values, then redraw the plan:
            // a changed date or estimate can move the load on other days.
            setOpen((cur) => (cur ? { ...cur, task: updated } : cur))
            load()
          }}
        />
      )}
    </div>
  )
}

function describeClash(day, orgNames) {
  const n = day.task_ids.length
  const orgs = day.org_ids.length
  const cap = day.capacity ? `${hoursText(day.hours)} of ${hoursText(day.capacity)}` : `${hoursText(day.hours)} on a day off`
  return `${shortDay(parseDay(day.date))}, ${n} task${n === 1 ? '' : 's'}${orgs > 1 ? ` across ${orgs} organisations` : ''} (${cap}).`
}
