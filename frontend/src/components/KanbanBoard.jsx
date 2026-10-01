import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, ChevronRight, ChevronLeft, MessageSquare, Lock, X, ArrowUpDown, Clock } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import TaskDetailPanel from './TaskDetailPanel'
import { useToast } from './Toast'
import { TASK_STATUSES, TASK_PRIORITIES } from '../config'

const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' }

export default function KanbanBoard({ projectId, subProjectId }) {
  const { currentOrg } = useOrg()
  const toast = useToast()
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [creating, setCreating] = useState(false)
  const creatingRef = useRef(false) // synchronous guard: two quick clicks can both run before React re-renders the disabled button
  const [creatingSection, setCreatingSection] = useState(false)
  const creatingSectionRef = useRef(false)
  const [loading, setLoading] = useState(false)
  const [openTaskId, setOpenTaskId] = useState(null)
  const [members, setMembers] = useState([])
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [filterAssignee, setFilterAssignee] = useState('')
  const [sortBy, setSortBy] = useState('')

  useEffect(() => {
    fetchTasks()
    setOpenTaskId(null)
    setSelectedIds(new Set())
  }, [subProjectId])

  useEffect(() => {
    if (!currentOrg) return
    api
      .get(`/api/orgs/${currentOrg.id}/members`)
      .then((res) => setMembers(res.data))
      .catch(() => setMembers([]))
  }, [currentOrg?.id])

  const fetchTasks = async () => {
    if (!subProjectId) return
    setLoading(true)
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/projects/${projectId}/tasks/${subProjectId}`)
      setTasks(res.data)
      setSelectedIds((cur) => new Set([...cur].filter((id) => res.data.some((t) => t.id === id))))
    } catch (err) {
      console.error('Failed to fetch tasks:', err)
      toast.fromError(err, 'Could not load the tasks.')
    }
    setLoading(false)
  }

  const base = `/api/orgs/${currentOrg?.id}/projects/${projectId}/tasks/${subProjectId}`
  const isPending = (id) => typeof id === 'string' // a task parked on this device (offline) until it can be sent

  const createTask = async () => {
    const title = newTask.trim()
    if (creatingRef.current) return
    if (!title) {
      toast.info('Type a task title first.')
      return
    }
    if (!subProjectId) return
    creatingRef.current = true
    setCreating(true)
    try {
      const res = await api.post(base, { title, status: 'todo', priority: 'medium' })
      setTasks((cur) => [...cur, res.data])
      setNewTask('')
    } catch (err) {
      if (err.queued) {
        // The server could not be reached, but the task is saved on this device and will be sent automatically.
        setTasks((cur) => [...cur, { id: `pending-${Date.now()}`, title, status: 'todo', priority: 'medium', _pending: true }])
        setNewTask('')
      } else {
        console.error('Failed to create task:', err)
        toast.fromError(err, 'Could not add the task.')
      }
    }
    creatingRef.current = false
    setCreating(false)
  }

  const updateTaskStatus = async (taskId, newStatus) => {
    if (isPending(taskId)) return
    try {
      const res = await api.put(`${base}/${taskId}`, { status: newStatus })
      setTasks((cur) => cur.map((t) => (t.id === taskId ? res.data : t)))
    } catch (err) {
      console.error('Failed to update task:', err)
      toast.fromError(err, 'Could not move the task.')
    }
  }

  const deleteTask = async (taskId) => {
    if (isPending(taskId)) {
      toast.info('This task is still waiting to be saved. Delete it once it has synced.')
      return
    }
    try {
      await api.delete(`${base}/${taskId}`)
      setTasks((cur) => cur.filter((t) => t.id !== taskId))
      if (openTaskId === taskId) setOpenTaskId(null)
    } catch (err) {
      console.error('Failed to delete task:', err)
      toast.fromError(err, 'Could not delete the task.')
    }
  }

  const createDefaultSection = async () => {
    if (!projectId || creatingSectionRef.current) return
    creatingSectionRef.current = true
    setCreatingSection(true)
    try {
      await api.post(`/api/orgs/${currentOrg.id}/projects/${projectId}/sub-projects`, { name: 'General', status: 'active' })
      // ProjectList owns the section list: ask it to reload and select the new section.
      window.dispatchEvent(new CustomEvent('kaizenpm:sections-changed', { detail: { projectId } }))
    } catch (err) {
      toast.fromError(err, 'Could not create the section.')
    }
    creatingSectionRef.current = false
    setCreatingSection(false)
  }

  const toggleSelected = (taskId) => {
    setSelectedIds((cur) => {
      const next = new Set(cur)
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
      return next
    })
  }

  const runBulk = async (action, value) => {
    if (selectedIds.size === 0 || bulkBusy) return
    setBulkBusy(true)
    try {
      await api.post(`/api/orgs/${currentOrg.id}/tasks/bulk`, {
        task_ids: [...selectedIds].filter((id) => !isPending(id)),
        action,
        value: value ?? null
      })
      setSelectedIds(new Set())
      await fetchTasks()
    } catch (err) {
      console.error('Bulk action failed:', err)
      toast.fromError(err, 'That change could not be applied to the selected tasks.')
    }
    setBulkBusy(false)
  }

  const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 }

  const visibleTasks = tasks
    .filter((t) => !search.trim() || t.title.toLowerCase().includes(search.trim().toLowerCase()))
    .filter((t) => !filterPriority || t.priority === filterPriority)
    .filter((t) => !filterAssignee || String(t.assignee_id) === filterAssignee)
    .sort((a, b) => {
      if (sortBy === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      if (sortBy === 'due_date') {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return new Date(a.due_date) - new Date(b.due_date)
      }
      if (sortBy === 'title') return a.title.localeCompare(b.title)
      return 0
    })

  const columns = {
    todo: visibleTasks.filter(t => t.status === 'todo'),
    in_progress: visibleTasks.filter(t => t.status === 'in_progress'),
    review: visibleTasks.filter(t => t.status === 'review'),
    done: visibleTasks.filter(t => t.status === 'done')
  }

  const openTask = tasks.find(t => t.id === openTaskId) || null

  const renderCard = (task) => (
    <div
      onClick={() => !task._pending && setOpenTaskId(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && !task._pending && setOpenTaskId(task.id)}
      className={`bg-slate-800 border rounded-lg p-3 mb-2 cursor-pointer hover:border-brand-500/50 ${
        selectedIds.has(task.id) ? 'border-brand-500' : 'border-slate-700'
      } ${task._pending ? 'opacity-70' : ''}`}
    >
      <div className="flex justify-between items-start gap-2">
        <input
          type="checkbox"
          checked={selectedIds.has(task.id)}
          onChange={() => toggleSelected(task.id)}
          disabled={!!task._pending}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${task.title}`}
          className="mt-1 shrink-0 accent-brand-500"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {task.blocked && (
              <Lock size={12} className="text-amber-400 shrink-0" aria-label="Blocked by another task" />
            )}
            <p className="text-white font-medium text-sm break-words">{task.title}</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs inline-block px-2 py-1 rounded ${
              task.priority === 'urgent' ? 'bg-red-500/20 text-red-300' :
              task.priority === 'high' ? 'bg-orange-500/20 text-orange-300' :
              task.priority === 'medium' ? 'bg-blue-500/20 text-blue-300' :
              'bg-slate-700 text-slate-300'
            }`}>
              {task.priority}
            </span>
            {task._pending && (
              <span className="flex items-center gap-1 text-xs text-amber-300">
                <Clock size={12} /> Waiting to save
              </span>
            )}
            {task.comment_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <MessageSquare size={12} />
                {task.comment_count}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); deleteTask(task.id) }}
          aria-label={`Delete ${task.title}`}
          disabled={!!task._pending}
          className="p-1 hover:bg-red-500/20 rounded text-red-400 shrink-0 disabled:opacity-40"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )

  const renderColumn = (title, status, columnTasks) => (
    <div className="bg-slate-900/50 rounded-lg p-3 shrink-0 w-64 lg:w-auto lg:flex-1 min-h-96">
      <h3 className="font-semibold text-white mb-3 text-sm">{title}</h3>
      <div className="space-y-2">
        {columnTasks.map(task => (
          <div key={task.id} className="flex gap-1">
            {status !== 'todo' && !task._pending && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const statuses = ['todo', 'in_progress', 'review', 'done']
                  const prevIdx = statuses.indexOf(status) - 1
                  updateTaskStatus(task.id, statuses[prevIdx])
                }}
                aria-label="Move status back"
                className="p-1 hover:bg-brand-500/20 rounded text-slate-400 hover:text-brand-400 self-start"
              >
                <ChevronLeft size={14} />
              </button>
            )}
            {renderCard(task)}
            {status !== 'done' && !task._pending && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const statuses = ['todo', 'in_progress', 'review', 'done']
                  const nextIdx = (statuses.indexOf(status) + 1) % statuses.length
                  updateTaskStatus(task.id, statuses[nextIdx])
                }}
                aria-label="Advance status"
                className="p-1 hover:bg-brand-500/20 rounded text-slate-400 hover:text-brand-400 self-start"
              >
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )

  if (!subProjectId) {
    if (projectId) {
      return (
        <div className="space-y-3 rounded-lg border border-slate-700 bg-slate-900/50 p-4 text-sm text-slate-300" data-testid="no-section">
          <p>This project has no section yet. Tasks live inside sections, so add one to start adding tasks.</p>
          <button
            type="button"
            onClick={createDefaultSection}
            disabled={creatingSection}
            className="rounded-lg bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {creatingSection ? 'Creating…' : 'Create the "General" section'}
          </button>
        </div>
      )
    }
    return (
      <div className="text-slate-400 text-sm">
        Pick a project to see its tasks, or create one to get started.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createTask()}
          placeholder="Add new task..."
          aria-label="New task title"
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500"
        />
        <button
          type="button"
          onClick={createTask}
          disabled={creating}
          aria-label="Add task"
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white rounded-lg flex items-center gap-2"
        >
          <Plus size={18} /> {creating ? 'Adding…' : 'Add'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          aria-label="Search tasks"
          className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm placeholder-slate-500 w-40"
        />
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          aria-label="Filter by priority"
          className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm capitalize"
        >
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterAssignee}
          onChange={(e) => setFilterAssignee(e.target.value)}
          aria-label="Filter by assignee"
          className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
        >
          <option value="">Everyone</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.user?.name || m.user?.email}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          <ArrowUpDown size={14} className="text-slate-500" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            aria-label="Sort tasks"
            className="px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
          >
            <option value="">Unsorted</option>
            <option value="priority">Priority</option>
            <option value="due_date">Due date</option>
            <option value="title">Title</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
        {renderColumn('To Do', 'todo', columns.todo)}
        {renderColumn('In Progress', 'in_progress', columns.in_progress)}
        {renderColumn('Review', 'review', columns.review)}
        {renderColumn('Done', 'done', columns.done)}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl px-4 py-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-white font-medium mr-1">
            {selectedIds.size} selected
          </span>

          <select
            disabled={bulkBusy}
            defaultValue=""
            onChange={(e) => e.target.value && runBulk('update_status', e.target.value)}
            aria-label="Change status for selected tasks"
            className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-sm"
          >
            <option value="" disabled>Change status...</option>
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>

          <select
            disabled={bulkBusy}
            defaultValue=""
            onChange={(e) => e.target.value && runBulk('set_priority', e.target.value)}
            aria-label="Change priority for selected tasks"
            className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-sm capitalize"
          >
            <option value="" disabled>Set priority...</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            disabled={bulkBusy}
            defaultValue=""
            onChange={(e) => e.target.value && runBulk('assign', e.target.value)}
            aria-label="Assign selected tasks"
            className="px-2 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-sm"
          >
            <option value="" disabled>Assign to...</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.user?.name || m.user?.email}</option>
            ))}
          </select>

          <button
            disabled={bulkBusy}
            onClick={() => runBulk('delete')}
            aria-label="Delete selected tasks"
            className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 disabled:opacity-50 text-red-300 text-sm rounded flex items-center gap-1"
          >
            <Trash2 size={14} /> Delete
          </button>

          <button
            onClick={() => setSelectedIds(new Set())}
            aria-label="Clear selection"
            className="p-1.5 text-slate-400 hover:text-white"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {openTask && (
        <TaskDetailPanel
          orgId={currentOrg.id}
          projectId={projectId}
          subProjectId={subProjectId}
          task={openTask}
          members={members}
          onClose={() => setOpenTaskId(null)}
          // Re-fetch the whole board rather than patching just the edited task:
          // changing one task's status can flip another task's server-computed
          // `blocked` flag (see TaskDependencies), and a single-row patch would
          // leave that other card showing a stale lock icon.
          onTaskUpdate={fetchTasks}
        />
      )}
    </div>
  )
}
