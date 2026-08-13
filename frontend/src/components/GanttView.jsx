import { useState, useEffect, useMemo } from 'react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import { useLocalization } from '../context/LocalizationContext'
import TaskDetailPanel from './TaskDetailPanel'

const PRIORITY_COLORS = {
  urgent: '#f87171', // red-400
  high: '#fb923c',   // orange-400
  medium: '#60a5fa', // blue-400
  low: '#94a3b8'      // slate-400
}

const DAY_MS = 86400000

/**
 * A lightweight custom Gantt — no charting library, since this is just
 * horizontal bars positioned along a fixed date axis and a library would be
 * more code than the feature itself at this scale.
 *
 * There is no single "all tasks in this org" endpoint yet (that arrives with
 * B10's calendar view), so this fans out across the existing
 * projects -> sub-projects -> tasks endpoints client-side. Fine at the scale
 * this app runs at — a handful of projects, each with a few sections.
 */
export default function GanttView() {
  const { currentOrg } = useOrg()
  const { formatDate } = useLocalization()
  const [rows, setRows] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [openTask, setOpenTask] = useState(null) // { task, projectId, subProjectId }

  const windowStart = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - 14)
    return d
  }, [])
  const windowEnd = useMemo(() => {
    const d = new Date(windowStart)
    d.setDate(d.getDate() + 56) // 2 weeks back + 6 weeks forward
    return d
  }, [windowStart])
  const totalDays = Math.round((windowEnd - windowStart) / DAY_MS)

  useEffect(() => {
    if (currentOrg) load()
  }, [currentOrg?.id])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [projectsRes, membersRes] = await Promise.all([
        api.get(`/api/orgs/${currentOrg.id}/projects`),
        api.get(`/api/orgs/${currentOrg.id}/members`)
      ])
      setMembers(membersRes.data)

      const allRows = []
      for (const project of projectsRes.data) {
        const subsRes = await api.get(`/api/orgs/${currentOrg.id}/projects/${project.id}/sub-projects`)
        const taskLists = await Promise.all(
          subsRes.data.map((sub) =>
            api
              .get(`/api/orgs/${currentOrg.id}/projects/${project.id}/tasks/${sub.id}`)
              .then((res) => res.data.map((t) => ({ task: t, projectId: project.id, subProjectId: sub.id })))
          )
        )
        allRows.push({
          projectId: project.id,
          projectName: project.name,
          tasks: taskLists.flat()
        })
      }
      setRows(allRows.filter((r) => r.tasks.length > 0))
    } catch {
      setError('Could not load the timeline.')
    }
    setLoading(false)
  }

  const barGeometry = (task) => {
    const start = task.start_date ? new Date(task.start_date) : new Date(task.created_at)
    const end = task.due_date ? new Date(task.due_date) : new Date(start.getTime() + DAY_MS)
    const clampedStart = Math.max(start, windowStart)
    const clampedEnd = Math.min(Math.max(end, start.getTime() + DAY_MS), windowEnd)
    const left = ((clampedStart - windowStart) / DAY_MS / totalDays) * 100
    const width = Math.max(1.2, ((clampedEnd - clampedStart) / DAY_MS / totalDays) * 100)
    return { left: `${left}%`, width: `${width}%` }
  }

  const weekMarkers = useMemo(() => {
    const marks = []
    for (let d = 0; d <= totalDays; d += 7) {
      const date = new Date(windowStart.getTime() + d * DAY_MS)
      marks.push({ left: `${(d / totalDays) * 100}%`, label: formatDate(date) })
    }
    return marks
  }, [windowStart, totalDays, formatDate])

  const todayOffset = ((Date.now() - windowStart) / DAY_MS / totalDays) * 100

  if (loading) return <p className="text-slate-400">Loading...</p>
  if (error) return <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{error}</p>

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <h2 className="text-xl font-bold text-white mb-1">Timeline</h2>
        <p className="text-sm text-slate-400 mb-4">
          Tasks with a start or due date, from two weeks ago to six weeks ahead. Click a bar for details.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No tasks to show yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <div style={{ minWidth: 640 }}>
              <div className="relative h-6 mb-1 text-xs text-slate-500 border-b border-slate-800">
                {weekMarkers.map((m, i) => (
                  <span key={i} className="absolute -translate-x-1/2" style={{ left: m.left }}>
                    {m.label}
                  </span>
                ))}
              </div>

              <div className="relative">
                {todayOffset >= 0 && todayOffset <= 100 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-brand-500 z-10"
                    style={{ left: `${todayOffset}%` }}
                    title="Today"
                  />
                )}

                {rows.map((group) => (
                  <div key={group.projectId} className="mb-3">
                    <p className="text-xs font-semibold text-slate-400 mb-1">{group.projectName}</p>
                    {group.tasks.map(({ task, projectId, subProjectId }) => {
                      const geo = barGeometry(task)
                      return (
                        <div key={task.id} className="relative h-8 mb-1 bg-slate-900/40 rounded">
                          <button
                            onClick={() => setOpenTask({ task, projectId, subProjectId })}
                            className="absolute top-1 bottom-1 rounded px-2 text-left text-xs text-white truncate hover:brightness-110"
                            style={{ ...geo, backgroundColor: PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium }}
                            title={task.title}
                          >
                            {task.title}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {openTask && (
        <TaskDetailPanel
          orgId={currentOrg.id}
          projectId={openTask.projectId}
          subProjectId={openTask.subProjectId}
          task={openTask.task}
          members={members}
          onClose={() => setOpenTask(null)}
          onTaskUpdate={(updated) => {
            setOpenTask((cur) => (cur ? { ...cur, task: updated } : cur))
            setRows((cur) =>
              cur.map((g) => ({
                ...g,
                tasks: g.tasks.map((r) => (r.task.id === updated.id ? { ...r, task: updated } : r))
              }))
            )
          }}
        />
      )}
    </div>
  )
}
