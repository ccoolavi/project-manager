import { useEffect, useMemo, useRef } from 'react'
import { Lock } from 'lucide-react'
import LoadStrip from './LoadStrip'
import {
  addDays, dayKey, diffDays, hoursText, isoWeekday, isOverloaded, orgColor, parseDay, shortDay,
} from '../utils/timelineDates'

const BAR_H = 24
const ROW_H = 28

/** Greedy packing: each item goes on the first row whose last bar has ended. */
function packRows(items) {
  const rows = []
  const placed = items
    .slice()
    .sort((a, b) => a.startIdx - b.startIdx || a.endIdx - b.endIdx)
    .map((item) => {
      let r = rows.findIndex((last) => last < item.startIdx)
      if (r === -1) { rows.push(item.endIdx); r = rows.length - 1 } else { rows[r] = item.endIdx }
      return { ...item, row: r }
    })
  return { placed, rowCount: rows.length }
}

/**
 * Start-to-due bars for everything assigned to me, one lane per
 * organisation, over a day axis shared with the load strip. Overloaded days
 * are tinted down through every lane so a clash is visible at a glance, and
 * the tasks involved in a clash carry a red ring.
 */
export default function MyTimelineView({
  tasks, days, sprints, win, workDays, today, orgNames, clashTaskIds, focusDate, onOpenTask,
}) {
  const scrollRef = useRef(null)
  const { from, totalDays, dayWidth } = win
  const width = totalDays * dayWidth
  const todayIdx = diffDays(from, today)

  const lanes = useMemo(() => {
    const byOrg = new Map()
    for (const t of tasks) {
      const due = parseDay(t.due_date)
      if (!due) continue // unscheduled: listed below, not drawn
      let start = parseDay(t.start_date) || due
      if (start > due) start = due
      const startIdx = diffDays(from, start)
      const endIdx = diffDays(from, due)
      if (endIdx < 0 || startIdx > totalDays - 1) continue
      const item = { task: t, startIdx: Math.max(0, startIdx), endIdx: Math.min(totalDays - 1, endIdx), cutLeft: startIdx < 0, cutRight: endIdx > totalDays - 1 }
      if (!byOrg.has(t.organization_id)) byOrg.set(t.organization_id, [])
      byOrg.get(t.organization_id).push(item)
    }
    return [...byOrg.entries()]
      .map(([orgId, items]) => ({ orgId, name: orgNames.get(orgId) || `Organisation ${orgId}`, ...packRows(items) }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [tasks, from, totalDays, orgNames])

  const columns = useMemo(() => {
    const byDate = new Map(days.map((d) => [d.date, d]))
    return Array.from({ length: totalDays }, (_, i) => {
      const date = addDays(from, i)
      const info = byDate.get(dayKey(date))
      return { i, date, off: !workDays.includes(isoWeekday(date)), over: info && isOverloaded(info.level), severe: info?.level === 'severe' }
    })
  }, [days, from, totalDays, workDays])

  const sprintBars = useMemo(() => {
    return sprints
      .map((s) => {
        const a = parseDay(s.start_date), b = parseDay(s.end_date)
        if (!a || !b) return null
        const startIdx = Math.max(0, diffDays(from, a)), endIdx = Math.min(totalDays - 1, diffDays(from, b))
        if (endIdx < 0 || startIdx > totalDays - 1) return null
        return { s, startIdx, endIdx }
      })
      .filter(Boolean)
  }, [sprints, from, totalDays])

  // "Show me the clash": scroll the day into view.
  useEffect(() => {
    if (!focusDate || !scrollRef.current) return
    const idx = diffDays(from, focusDate)
    if (idx >= 0 && idx < totalDays) scrollRef.current.scrollLeft = Math.max(0, idx * dayWidth - 80)
  }, [focusDate, from, totalDays, dayWidth])

  const dayLabel = (c) => {
    if (dayWidth >= 28) return (
      <>
        <span className="block text-[9px] text-slate-500">{c.date.toLocaleDateString('en-IN', { weekday: 'narrow' })}</span>
        <span>{c.date.getDate()}</span>
      </>
    )
    return isoWeekday(c.date) === 1 ? `${c.date.getDate()} ${c.date.toLocaleDateString('en-IN', { month: 'short' })}` : ''
  }

  return (
    <div ref={scrollRef} className="overflow-x-auto" data-testid="my-timeline-scroll">
      <div style={{ width, minWidth: width }} className="relative">
        {/* Day axis */}
        <div className="flex text-[10px] text-slate-400 leading-tight text-center h-8 items-end border-b border-slate-800">
          {columns.map((c) => (
            <div key={c.i} style={{ width: dayWidth, minWidth: dayWidth }} className={`whitespace-nowrap ${dayKey(c.date) === dayKey(today) ? 'text-brand-300 font-semibold' : ''}`}>
              {dayLabel(c)}
            </div>
          ))}
        </div>

        <LoadStrip days={days} from={from} totalDays={totalDays} dayWidth={dayWidth} workDays={workDays} orgNames={orgNames} today={today} />

        {/* Everything below shares the same day columns. */}
        <div className="relative pt-2 pb-2" data-testid="my-timeline-lanes">
          <div className="absolute inset-0 flex pointer-events-none" aria-hidden="true">
            {columns.map((c) => (
              <div
                key={c.i}
                data-date={dayKey(c.date)}
                data-clash={c.over ? (c.severe ? 'severe' : 'over') : undefined}
                style={{ width: dayWidth, minWidth: dayWidth }}
                className={`h-full ${c.over ? (c.severe ? 'bg-red-500/15' : 'bg-orange-500/10') : c.off ? 'bg-slate-950/50' : ''}`}
              />
            ))}
          </div>
          {todayIdx >= 0 && todayIdx < totalDays && (
            <div className="absolute top-0 bottom-0 w-px bg-brand-500 z-10 pointer-events-none" style={{ left: todayIdx * dayWidth + dayWidth / 2 }} title="Today" />
          )}

          {sprintBars.length > 0 && (
            <div className="relative mb-2" style={{ height: sprintBars.length * 14 }} data-testid="sprint-strip">
              {sprintBars.map(({ s, startIdx, endIdx }, k) => (
                <div
                  key={s.id}
                  className={`absolute h-3 rounded-sm border text-[9px] leading-3 px-1 truncate ${orgColor(s.organization_id).chip}`}
                  style={{ left: startIdx * dayWidth, width: (endIdx - startIdx + 1) * dayWidth, top: k * 14 }}
                  title={`Sprint ${s.name} (${s.organization_name}): ${shortDay(parseDay(s.start_date))} to ${shortDay(parseDay(s.end_date))}`}
                >
                  {s.name}
                </div>
              ))}
            </div>
          )}

          {lanes.length === 0 && (
            <p className="relative text-sm text-slate-500 py-6 text-center" style={{ position: 'sticky', left: 0, width: 'min(100%, 80vw)' }}>
              Nothing with dates in this range.
            </p>
          )}

          {lanes.map((lane) => (
            <section key={lane.orgId} className="relative mb-3" aria-label={`${lane.name} tasks`} data-testid="timeline-lane" data-org-id={lane.orgId}>
              <p className="sticky left-0 text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1.5 w-max max-w-[80vw]">
                <span className={`inline-block w-2 h-2 rounded-full ${orgColor(lane.orgId).dot}`} />
                {lane.name}
              </p>
              <div className="relative" style={{ height: lane.rowCount * ROW_H }}>
                {lane.placed.map(({ task, startIdx, endIdx, row, cutLeft, cutRight }) => {
                  const clash = clashTaskIds.has(task.id)
                  const done = task.status === 'done'
                  const priorityEdge = task.priority === 'urgent' ? 'border-l-4 border-l-red-400' : task.priority === 'high' ? 'border-l-4 border-l-orange-400' : ''
                  const due = parseDay(task.due_date)
                  const guessed = task.effort_source !== 'estimate'
                  const label = [
                    task.title, lane.name,
                    `due ${shortDay(due)}`,
                    `${hoursText(task.effort_hours, guessed)} ${guessed ? 'guessed' : 'estimated'}`,
                    task.blocked ? 'blocked' : null,
                    task.overdue ? 'overdue' : null,
                    clash ? 'involved in a clash' : null,
                    done ? 'done' : null,
                  ].filter(Boolean).join(', ')
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => onOpenTask(task)}
                      title={label}
                      aria-label={label}
                      data-task-id={task.id}
                      data-clash={clash ? 'true' : undefined}
                      className={`absolute rounded border px-1.5 text-left text-[11px] text-white truncate hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-brand-400 ${orgColor(task.organization_id).bar} ${priorityEdge} ${clash ? 'ring-2 ring-red-400' : ''} ${done ? 'opacity-50 line-through' : ''} ${cutLeft ? 'rounded-l-none' : ''} ${cutRight ? 'rounded-r-none' : ''}`}
                      style={{
                        left: startIdx * dayWidth,
                        width: Math.max(dayWidth, (endIdx - startIdx + 1) * dayWidth) - 2,
                        top: row * ROW_H + (ROW_H - BAR_H) / 2,
                        height: BAR_H,
                        lineHeight: `${BAR_H - 2}px`,
                        backgroundImage: task.blocked ? 'repeating-linear-gradient(135deg, rgba(0,0,0,0.28) 0 4px, transparent 4px 8px)' : undefined,
                      }}
                    >
                      {task.blocked && <Lock size={10} className="inline mr-1 -mt-0.5" aria-hidden="true" />}
                      {task.title}
                      {dayWidth * (endIdx - startIdx + 1) > 110 && <span className="text-white/70"> · {hoursText(task.effort_hours, guessed)}</span>}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
