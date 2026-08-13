import { useState, useEffect } from 'react'
import { Plus, X, Trash2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import { useLocalization } from '../context/LocalizationContext'
import TaskDetailPanel from './TaskDetailPanel'

const COLUMNS = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'review', label: 'Review' },
  { status: 'done', label: 'Done' }
]

/**
 * Sprints belong to a whole project, not one section, so this picks a
 * project first (unlike KanbanBoard, which is handed a section directly by
 * ProjectList) and fans out across that project's sections for the task pool
 * "add to sprint" draws from — same pattern GanttView uses.
 */
export default function SprintBoard() {
  const { currentOrg } = useOrg()
  const { formatDate } = useLocalization()

  const [projects, setProjects] = useState([])
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [members, setMembers] = useState([])

  const [sprints, setSprints] = useState([])
  const [selectedSprintId, setSelectedSprintId] = useState(null)
  const [projectTasks, setProjectTasks] = useState([]) // [{ task, subProjectId }]
  const [sprintTasks, setSprintTasks] = useState([])
  const [burndown, setBurndown] = useState(null)

  const [showNewSprint, setShowNewSprint] = useState(false)
  const [newSprint, setNewSprint] = useState({ name: '', goal: '', start_date: '', end_date: '' })
  const [addTaskId, setAddTaskId] = useState('')
  const [openTask, setOpenTask] = useState(null) // { task, subProjectId }

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const selectedSprint = sprints.find((s) => s.id === selectedSprintId) || null

  useEffect(() => {
    if (currentOrg) loadProjects()
  }, [currentOrg?.id])

  useEffect(() => {
    if (selectedProjectId) loadSprintsAndTasks()
  }, [selectedProjectId])

  useEffect(() => {
    if (selectedSprintId) loadSprintDetail()
    else {
      setSprintTasks([])
      setBurndown(null)
    }
  }, [selectedSprintId])

  const loadProjects = async () => {
    setLoading(true)
    setError('')
    try {
      const [projectsRes, membersRes] = await Promise.all([
        api.get(`/api/orgs/${currentOrg.id}/projects`),
        api.get(`/api/orgs/${currentOrg.id}/members`)
      ])
      setProjects(projectsRes.data)
      setMembers(membersRes.data)
      if (projectsRes.data.length > 0) setSelectedProjectId(projectsRes.data[0].id)
      else setLoading(false)
    } catch {
      setError('Could not load projects.')
      setLoading(false)
    }
  }

  const loadSprintsAndTasks = async () => {
    setLoading(true)
    setError('')
    try {
      const [sprintsRes, subsRes] = await Promise.all([
        api.get(`/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sprints`),
        api.get(`/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sub-projects`)
      ])
      setSprints(sprintsRes.data)
      setSelectedSprintId(sprintsRes.data[0]?.id || null)

      const taskLists = await Promise.all(
        subsRes.data.map((s) =>
          api
            .get(`/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/tasks/${s.id}`)
            .then((r) => r.data.map((t) => ({ task: t, subProjectId: s.id })))
        )
      )
      setProjectTasks(taskLists.flat())
    } catch {
      setError('Could not load sprints.')
    }
    setLoading(false)
  }

  const loadSprintDetail = async () => {
    try {
      const [tasksRes, burndownRes] = await Promise.all([
        api.get(`/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sprints/${selectedSprintId}/tasks`),
        api.get(`/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sprints/${selectedSprintId}/burndown`)
      ])
      setSprintTasks(tasksRes.data)
      setBurndown(burndownRes.data)
    } catch {
      setError('Could not load this sprint.')
    }
  }

  const refreshSprintsList = async () => {
    const res = await api.get(`/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sprints`)
    setSprints(res.data)
  }

  const createSprint = async () => {
    if (!newSprint.name.trim() || !newSprint.start_date || !newSprint.end_date) {
      setError('A sprint needs a name, a start date and an end date.')
      return
    }
    setError('')
    try {
      const res = await api.post(`/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sprints`, {
        name: newSprint.name.trim(),
        goal: newSprint.goal.trim() || null,
        start_date: `${newSprint.start_date}T00:00:00`,
        end_date: `${newSprint.end_date}T00:00:00`
      })
      setSprints([res.data, ...sprints])
      setSelectedSprintId(res.data.id)
      setShowNewSprint(false)
      setNewSprint({ name: '', goal: '', start_date: '', end_date: '' })
    } catch {
      setError('Could not create the sprint.')
    }
  }

  const deleteSprint = async () => {
    if (!selectedSprint) return
    try {
      await api.delete(`/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sprints/${selectedSprint.id}`)
      await refreshSprintsList()
      setSelectedSprintId(null)
    } catch {
      setError('Could not delete the sprint.')
    }
  }

  const addTask = async () => {
    if (!addTaskId || !selectedSprintId) return
    setError('')
    try {
      await api.post(`/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sprints/${selectedSprintId}/tasks`, {
        task_id: Number(addTaskId)
      })
      setAddTaskId('')
      await Promise.all([loadSprintDetail(), refreshSprintsList()])
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not add that task.')
    }
  }

  const removeTask = async (taskId) => {
    try {
      await api.delete(
        `/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sprints/${selectedSprintId}/tasks/${taskId}`
      )
      await Promise.all([loadSprintDetail(), refreshSprintsList()])
    } catch {
      setError('Could not remove that task.')
    }
  }

  const sprintTaskIds = new Set(sprintTasks.map((t) => t.id))
  const availableTasks = projectTasks.filter((pt) => !sprintTaskIds.has(pt.task.id))
  const findSubProjectId = (taskId) => projectTasks.find((pt) => pt.task.id === taskId)?.subProjectId

  if (loading) return <p className="text-slate-400">Loading...</p>

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h2 className="text-xl font-bold text-white">Sprints</h2>
          <select
            value={selectedProjectId || ''}
            onChange={(e) => setSelectedProjectId(Number(e.target.value))}
            aria-label="Project"
            className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5 my-2">
            {error}
          </p>
        )}

        {projects.length === 0 && (
          <p className="text-sm text-slate-500 py-4">Create a project first.</p>
        )}

        {projects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {sprints.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelectedSprintId(s.id)}
                className={`px-3 py-1.5 rounded-lg text-sm border ${
                  s.id === selectedSprintId
                    ? 'bg-brand-500/20 border-brand-500 text-brand-200'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
                }`}
              >
                {s.name}
              </button>
            ))}
            <button
              onClick={() => setShowNewSprint(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm bg-slate-700 hover:bg-slate-600 text-white"
            >
              <Plus size={14} /> New sprint
            </button>
          </div>
        )}

        {showNewSprint && (
          <div className="mt-4 p-4 bg-slate-900 border border-slate-700 rounded-lg space-y-2">
            <input
              value={newSprint.name}
              onChange={(e) => setNewSprint({ ...newSprint, name: e.target.value })}
              placeholder="Sprint name"
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
            />
            <input
              value={newSprint.goal}
              onChange={(e) => setNewSprint({ ...newSprint, goal: e.target.value })}
              placeholder="Goal (optional)"
              className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={newSprint.start_date}
                onChange={(e) => setNewSprint({ ...newSprint, start_date: e.target.value })}
                aria-label="Start date"
                className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
              />
              <input
                type="date"
                value={newSprint.end_date}
                onChange={(e) => setNewSprint({ ...newSprint, end_date: e.target.value })}
                aria-label="End date"
                className="flex-1 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={createSprint} className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-sm rounded-lg">
                Create
              </button>
              <button onClick={() => setShowNewSprint(false)} className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm rounded-lg">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {selectedSprint && (
        <>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{selectedSprint.name}</h3>
                {selectedSprint.goal && <p className="text-sm text-slate-400 mt-0.5">{selectedSprint.goal}</p>}
                <p className="text-xs text-slate-500 mt-1">
                  {formatDate(selectedSprint.start_date)} – {formatDate(selectedSprint.end_date)}
                </p>
              </div>
              <button
                onClick={deleteSprint}
                aria-label="Delete sprint"
                className="p-1.5 hover:bg-red-500/20 rounded text-red-400 shrink-0"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Story points</span>
                <span>{selectedSprint.completed_points} / {selectedSprint.total_points}</span>
              </div>
              <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500"
                  style={{
                    width: selectedSprint.total_points
                      ? `${(selectedSprint.completed_points / selectedSprint.total_points) * 100}%`
                      : '0%'
                  }}
                />
              </div>
            </div>

            {availableTasks.length > 0 && (
              <div className="flex gap-2 mt-4">
                <select
                  value={addTaskId}
                  onChange={(e) => setAddTaskId(e.target.value)}
                  aria-label="Add a task to this sprint"
                  className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-sm"
                >
                  <option value="">Add a task to this sprint...</option>
                  {availableTasks.map((pt) => (
                    <option key={pt.task.id} value={pt.task.id}>{pt.task.title}</option>
                  ))}
                </select>
                <button
                  onClick={addTask}
                  disabled={!addTaskId}
                  className="px-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded"
                >
                  <Plus size={14} />
                </button>
              </div>
            )}
          </div>

          {burndown && burndown.days.length > 1 && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
              <h4 className="text-sm font-semibold text-white mb-3">Burndown</h4>
              <div style={{ width: '100%', height: 200 }}>
                <ResponsiveContainer>
                  <LineChart data={burndown.days.map((d) => ({ ...d, label: formatDate(d.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                    <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 13 }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Line type="monotone" dataKey="remaining_points" name="Remaining points" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {COLUMNS.map((col) => (
              <div key={col.status} className="bg-slate-900/50 rounded-lg p-3">
                <h4 className="font-semibold text-white mb-2 text-sm">{col.label}</h4>
                <div className="space-y-2">
                  {sprintTasks.filter((t) => t.status === col.status).map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setOpenTask({ task: t, subProjectId: findSubProjectId(t.id) })}
                      role="button"
                      tabIndex={0}
                      className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 cursor-pointer hover:border-brand-500/50"
                    >
                      <div className="flex justify-between items-start gap-1">
                        <p className="text-white text-sm break-words">{t.title}</p>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeTask(t.id) }}
                          aria-label={`Remove ${t.title} from sprint`}
                          className="p-0.5 shrink-0 text-slate-500 hover:text-red-400"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      {t.story_points > 0 && (
                        <span className="text-xs text-slate-500">{t.story_points} pts</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!selectedSprint && sprints.length === 0 && projects.length > 0 && (
        <p className="text-sm text-slate-500">No sprints yet for this project.</p>
      )}

      {openTask && (
        <TaskDetailPanel
          orgId={currentOrg.id}
          projectId={selectedProjectId}
          subProjectId={openTask.subProjectId}
          task={openTask.task}
          members={members}
          onClose={() => setOpenTask(null)}
          onTaskUpdate={() => {
            setOpenTask(null)
            loadSprintDetail()
          }}
        />
      )}
    </div>
  )
}
