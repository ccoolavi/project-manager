import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { dayKey, hoursText, isOverloaded, LEVEL_STYLE, monthGrid, orgColor, parseDay, shortDay } from '../utils/timelineDates'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The month calendar: tasks sit on their due date. Days the server marked
 * overloaded are outlined and say so, so this view agrees with the timeline.
 */
export default function MyMonthView({ tasks, days, cursor, onCursor, today, clashTaskIds, onOpenTask }) {
  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const loadByDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days])

  const tasksByDay = useMemo(() => {
    const map = new Map()
    for (const t of tasks) {
      const due = parseDay(t.due_date)
      if (!due) continue
      const key = dayKey(due)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(t)
    }
    return map
  }, [tasks])

  const goPrev = () => onCursor(cursor.month === 0 ? { year: cursor.year - 1, month: 11 } : { year: cursor.year, month: cursor.month - 1 })
  const goNext = () => onCursor(cursor.month === 11 ? { year: cursor.year + 1, month: 0 } : { year: cursor.year, month: cursor.month + 1 })
  const goToday = () => onCursor({ year: today.getFullYear(), month: today.getMonth() })
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div data-testid="my-month">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-white">{monthLabel}</h2>
        <div className="flex items-center gap-1">
          <button onClick={goPrev} aria-label="Previous month" className="p-1.5 hover:bg-slate-700 rounded text-slate-300"><ChevronLeft size={18} /></button>
          <button onClick={goToday} className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded">Today</button>
          <button onClick={goNext} aria-label="Next month" className="p-1.5 hover:bg-slate-700 rounded text-slate-300"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: 560 }}>
          <div className="grid grid-cols-7 gap-px text-xs text-slate-500 mb-1">
            {WEEKDAYS.map((w) => <div key={w} className="text-center py-1">{w}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px bg-slate-800 border border-slate-800 rounded overflow-hidden">
            {grid.map((d) => {
              const key = dayKey(d)
              const inMonth = d.getMonth() === cursor.month
              const dayTasks = tasksByDay.get(key) || []
              const info = loadByDate.get(key)
              const over = info && isOverloaded(info.level)
              const isToday = key === dayKey(today)
              return (
                <div
                  key={key}
                  data-date={key}
                  data-level={info?.level}
                  title={info ? `${shortDay(d)}: ${hoursText(info.hours)} of ${info.capacity ? hoursText(info.capacity) : 'a day off'} — ${LEVEL_STYLE[info.level].text}` : undefined}
                  className={`min-h-[6rem] p-1.5 ${inMonth ? 'bg-slate-900' : 'bg-slate-900/40'} ${over ? 'outline outline-2 -outline-offset-2 outline-red-500/70' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs inline-flex items-center justify-center w-5 h-5 rounded-full ${isToday ? 'bg-brand-500 text-white font-semibold' : inMonth ? 'text-slate-300' : 'text-slate-600'}`}>
                      {d.getDate()}
                    </span>
                    {info && inMonth && (
                      <span className={`text-[10px] px-1 rounded text-white ${LEVEL_STYLE[info.level].cell}`}>{Math.round(info.hours)}h</span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayTasks.slice(0, 3).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => onOpenTask(t)}
                        data-task-id={t.id}
                        title={`${t.title} (${t.organization_name})`}
                        className={`w-full text-left text-[11px] leading-tight px-1 py-0.5 rounded border truncate ${orgColor(t.organization_id).chip} ${clashTaskIds.has(t.id) ? 'ring-1 ring-red-400' : ''} ${t.status === 'done' ? 'opacity-50 line-through' : ''}`}
                      >
                        {t.title}
                      </button>
                    ))}
                    {dayTasks.length > 3 && <p className="text-[10px] text-slate-500 px-1">+{dayTasks.length - 3} more</p>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
