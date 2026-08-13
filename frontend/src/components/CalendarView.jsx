import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import TaskDetailPanel from './TaskDetailPanel'

const PRIORITY_COLORS = {
  urgent: 'bg-red-500/20 text-red-300 border-red-500/40',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  medium: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  low: 'bg-slate-600/30 text-slate-300 border-slate-600/50'
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Monday-first grid covering the full weeks that contain the given month. */
function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // 0 = Monday
  const gridStart = new Date(year, month, 1 - startOffset)
  const days = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
  }
  return days
}

export default function CalendarView() {
  const { currentOrg } = useOrg()
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [openTask, setOpenTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (currentOrg) load()
  }, [currentOrg?.id])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [tasksRes, membersRes] = await Promise.all([
        api.get(`/api/orgs/${currentOrg.id}/tasks`),
        api.get(`/api/orgs/${currentOrg.id}/members`)
      ])
      setTasks(tasksRes.data)
      setMembers(membersRes.data)
    } catch {
      setError('Could not load the calendar.')
    }
    setLoading(false)
  }

  const days = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])
  const today = new Date()

  const tasksByDay = useMemo(() => {
    const map = new Map()
    for (const task of tasks) {
      if (!task.due_date) continue
      const d = new Date(task.due_date)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(task)
    }
    return map
  }, [tasks])

  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

  const goPrev = () => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))
  const goNext = () => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))
  const goToday = () => setCursor({ year: today.getFullYear(), month: today.getMonth() })

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric'
  })

  if (loading) return <p className="text-slate-400">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button onClick={goPrev} aria-label="Previous month" className="p-1.5 hover:bg-slate-700 rounded text-slate-300">
              <ChevronLeft size={18} />
            </button>
            <button onClick={goToday} className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded">
              Today
            </button>
            <button onClick={goNext} aria-label="Next month" className="p-1.5 hover:bg-slate-700 rounded text-slate-300">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5 mb-3">
            {error}
          </p>
        )}

        <div className="grid grid-cols-7 gap-px bg-slate-800 text-xs text-slate-500 mb-1">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center py-1">{w}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-800 border border-slate-800 rounded overflow-hidden">
          {days.map((d) => {
            const inMonth = d.getMonth() === cursor.month
            const dayTasks = tasksByDay.get(dayKey(d)) || []
            return (
              <div
                key={d.toISOString()}
                className={`min-h-[6rem] p-1.5 ${inMonth ? 'bg-slate-900' : 'bg-slate-900/40'}`}
              >
                <span
                  className={`text-xs inline-flex items-center justify-center w-5 h-5 rounded-full ${
                    isSameDay(d, today)
                      ? 'bg-brand-500 text-white font-semibold'
                      : inMonth
                        ? 'text-slate-300'
                        : 'text-slate-600'
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setOpenTask(t)}
                      title={t.title}
                      className={`w-full text-left text-[11px] leading-tight px-1 py-0.5 rounded border truncate ${
                        PRIORITY_COLORS[t.priority] || PRIORITY_COLORS.medium
                      }`}
                    >
                      {t.title}
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <p className="text-[10px] text-slate-500 px-1">+{dayTasks.length - 3} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {openTask && (
        <TaskDetailPanel
          orgId={currentOrg.id}
          projectId={openTask.project_id}
          subProjectId={openTask.sub_project_id}
          task={openTask}
          members={members}
          onClose={() => setOpenTask(null)}
          onTaskUpdate={() => {
            setOpenTask(null)
            load()
          }}
        />
      )}
    </div>
  )
}
