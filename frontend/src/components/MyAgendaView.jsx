import { useEffect, useMemo } from 'react'
import { Lock, AlertTriangle } from 'lucide-react'
import { dayKey, hoursText, LEVEL_STYLE, isOverloaded, orgColor, parseDay, shortDay } from '../utils/timelineDates'

const STATUS_WORDS = { todo: 'To do', in_progress: 'In progress', review: 'In review', done: 'Done' }

export function TaskRow({ task, clash, onOpenTask }) {
  const guessed = task.effort_source !== 'estimate'
  const due = parseDay(task.due_date)
  return (
    <button
      type="button"
      onClick={() => onOpenTask(task)}
      data-task-id={task.id}
      data-clash={clash ? 'true' : undefined}
      className={`w-full text-left flex items-center gap-2 px-2.5 py-2 rounded border bg-slate-900/60 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-400 ${clash ? 'border-red-500/60' : 'border-slate-700'} ${task.status === 'done' ? 'opacity-50' : ''}`}
    >
      <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border max-w-[8rem] truncate ${orgColor(task.organization_id).chip}`}>{task.organization_name}</span>
      <span className={`flex-1 min-w-0 truncate text-sm text-white ${task.status === 'done' ? 'line-through' : ''}`}>{task.title}</span>
      {task.blocked && <Lock size={12} className="shrink-0 text-slate-400" aria-label="Blocked" />}
      {clash && <AlertTriangle size={12} className="shrink-0 text-red-400" aria-label="Involved in a clash" />}
      <span className="shrink-0 text-[11px] text-slate-400" title={guessed ? 'Guessed effort: add an estimate on the task' : 'Your estimate'}>
        {hoursText(task.effort_hours, guessed)}
      </span>
      <span className="hidden sm:inline shrink-0 text-[11px] text-slate-500 w-20 text-right">{STATUS_WORDS[task.status] || task.status}</span>
      {task.overdue && due && <span className="shrink-0 text-[11px] text-amber-400">due {shortDay(due)}</span>}
    </button>
  )
}

/** A titled list of tasks (used for Overdue and No-due-date, in every view). */
export function TaskListSection({ title, hint, tasks, clashTaskIds, onOpenTask, testId }) {
  if (tasks.length === 0) return null
  return (
    <section className="space-y-1.5" data-testid={testId} aria-label={title}>
      <h3 className="text-sm font-semibold text-white">{title} <span className="text-slate-500 font-normal">({tasks.length})</span></h3>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {tasks.map((t) => <TaskRow key={t.id} task={t} clash={clashTaskIds.has(t.id)} onOpenTask={onOpenTask} />)}
    </section>
  )
}

/**
 * The same plan as a dated list: works on a phone, and reads in order. Each
 * day shows how full it is (from the server's numbers) so the clash is next
 * to the tasks that cause it.
 */
export default function MyAgendaView({ tasks, days, win, today, clashTaskIds, focusDate, onOpenTask }) {
  const loadByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])

  const groups = useMemo(() => {
    const map = new Map()
    for (const t of tasks) {
      if (t.overdue) continue // listed under Overdue
      const due = parseDay(t.due_date)
      if (!due) continue // listed under No due date
      const key = dayKey(due)
      if (due < win.from || due > win.to) continue
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(t)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [tasks, win])

  const overdue = tasks.filter((t) => t.overdue)
  const unscheduled = tasks.filter((t) => !t.due_date && t.status !== 'done')

  useEffect(() => {
    if (!focusDate) return
    const el = document.getElementById(`agenda-day-${dayKey(focusDate)}`)
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' })
  }, [focusDate])

  return (
    <div className="space-y-4" data-testid="my-agenda">
      <TaskListSection
        title="Overdue" testId="overdue-list" tasks={overdue} clashTaskIds={clashTaskIds} onOpenTask={onOpenTask}
        hint="Still open after their due date. Their remaining work is counted on today."
      />

      {groups.length === 0 && overdue.length === 0 && unscheduled.length === 0 && (
        <p className="text-sm text-slate-500 py-6 text-center">Nothing assigned to you in this range.</p>
      )}

      {groups.map(([key, list]) => {
        const info = loadByDate.get(key)
        const date = parseDay(key)
        const over = info && isOverloaded(info.level)
        return (
          <section key={key} id={`agenda-day-${key}`} className="space-y-1.5" aria-label={shortDay(date)} data-date={key} data-level={info?.level}>
            <h3 className="text-sm font-semibold text-white flex flex-wrap items-center gap-2">
              <span className={key === dayKey(today) ? 'text-brand-300' : ''}>{key === dayKey(today) ? 'Today · ' : ''}{shortDay(date)}</span>
              {info && (
                <span className={`text-[11px] font-normal px-1.5 py-0.5 rounded ${LEVEL_STYLE[info.level].cell} text-white`}>
                  {hoursText(info.hours)} of {info.capacity ? hoursText(info.capacity) : 'a day off'} · {LEVEL_STYLE[info.level].text}
                </span>
              )}
              {over && info.org_ids.length > 1 && <span className="text-[11px] font-normal text-red-300">clash across {info.org_ids.length} organisations</span>}
            </h3>
            {list.map((t) => <TaskRow key={t.id} task={t} clash={clashTaskIds.has(t.id)} onOpenTask={onOpenTask} />)}
          </section>
        )
      })}

      <TaskListSection
        title="No due date" testId="unscheduled-list" tasks={unscheduled} clashTaskIds={clashTaskIds} onOpenTask={onOpenTask}
        hint="These have no place on the calendar and are not counted in the daily load. Give them a due date to plan them."
      />
    </div>
  )
}
