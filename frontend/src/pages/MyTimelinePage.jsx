import { useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import api from '../utils/api'
import TaskDetailPanel from '../components/TaskDetailPanel'

const ORG_COLORS = [
  'bg-blue-500/20 text-blue-300 border-blue-500/40',
  'bg-purple-500/20 text-purple-300 border-purple-500/40',
  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  'bg-amber-500/20 text-amber-300 border-amber-500/40',
  'bg-pink-500/20 text-pink-300 border-pink-500/40',
]

function colorForOrg(orgId, orgIdOrder) {
  const idx = orgIdOrder.indexOf(orgId)
  return ORG_COLORS[idx % ORG_COLORS.length]
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - startOffset)
  const days = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i))
  }
  return days
}

export default function MyTimelinePage() {
  const [tasks, setTasks] = useState([])
  const [sprints, setSprints] = useState([])
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth() }
  })
  const [openTask, setOpenTask] = useState(null)
  const [openTaskMembers, setOpenTaskMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/me/timeline')
      setTasks(res.data.tasks)
      setSprints(res.data.sprints)
    } catch {
      setError('Could not load your timeline.')
    }
    setLoading(false)
  }

  const orgIdOrder = useMemo(
    () => [...new Set(tasks.map((t) => t.organization_id))],
    [tasks]
  )

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

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const handleOpenTask = async (task) => {
    setOpenTask(task)
    try {
      const res = await api.get(`/api/orgs/${task.organization_id}/members`)
      setOpenTaskMembers(res.data)
    } catch {
      setOpenTaskMembers([])
    }
  }

  if (loading) return <p className="text-slate-400">Loading...</p>

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">{error}</p>
      )}

      {sprints.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-white mb-2">Active sprints touching your tasks</h3>
          <div className="space-y-1">
            {sprints.map((s) => (
              <div key={s.id} className="text-xs text-slate-300 flex justify-between">
                <span>{s.name} <span className="text-slate-500">({s.organization_name})</span></span>
                <span className="text-slate-500">
                  {new Date(s.start_date).toLocaleDateString()} &ndash; {new Date(s.end_date).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button onClick={goPrev} aria-label="Previous month" className="p-1.5 hover:bg-slate-700 rounded text-slate-300"><ChevronLeft size={18} /></button>
            <button onClick={goToday} className="px-2.5 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded">Today</button>
            <button onClick={goNext} aria-label="Next month" className="p-1.5 hover:bg-slate-700 rounded text-slate-300"><ChevronRight size={18} /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-800 text-xs text-slate-500 mb-1">
          {WEEKDAYS.map((w) => <div key={w} className="text-center py-1">{w}</div>)}
        </div>

        <div className="grid grid-cols-7 gap-px bg-slate-800 border border-slate-800 rounded overflow-hidden">
          {days.map((d) => {
            const inMonth = d.getMonth() === cursor.month
            const dayTasks = tasksByDay.get(dayKey(d)) || []
            return (
              <div key={d.toISOString()} className={`min-h-[6rem] p-1.5 ${inMonth ? 'bg-slate-900' : 'bg-slate-900/40'}`}>
                <span className={`text-xs inline-flex items-center justify-center w-5 h-5 rounded-full ${isSameDay(d, today) ? 'bg-brand-500 text-white font-semibold' : inMonth ? 'text-slate-300' : 'text-slate-600'}`}>
                  {d.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {dayTasks.slice(0, 3).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleOpenTask(t)}
                      title={`${t.title} (${t.organization_name})`}
                      className={`w-full text-left text-[11px] leading-tight px-1 py-0.5 rounded border truncate ${colorForOrg(t.organization_id, orgIdOrder)}`}
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

      {openTask && (
        <TaskDetailPanel
          orgId={openTask.organization_id}
          projectId={openTask.project_id}
          subProjectId={openTask.sub_project_id}
          task={openTask}
          members={openTaskMembers}
          onClose={() => setOpenTask(null)}
          onTaskUpdate={() => { setOpenTask(null); load() }}
        />
      )}
    </div>
  )
}
