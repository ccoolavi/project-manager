import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronRight, MessageSquare, Lock, X } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import TaskDetailPanel from './TaskDetailPanel'
import { TASK_STATUSES, TASK_PRIORITIES } from '../config'

const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' }

export default function KanbanBoard({ projectId, subProjectId }) {
  const { currentOrg } = useOrg()
  const [tasks, setTasks] = useState([])
  const [newTask, setNewTask] = useState('')
  const [loading, setLoading] = useState(false)
  const [openTaskId, setOpenTaskId] = useState(null)
  const [members, setMembers] = useState([])
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

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
    }
    setLoading(false)
  }

  const createTask = async () => {
    if (!newTask.trim() || !subProjectId) return
    try {
      const res = await api.post(
        `/api/orgs/${currentOrg.id}/projects/${projectId}/tasks/${subProjectId}`,
        { title: newTask, status: 'todo', priority: 'medium' }
      )
      setTasks([...tasks, res.data])
      setNewTask('')
    } catch (err) {
      console.error('Failed to create task:', err)
    }
  }

  const updateTaskStatus = async (taskId, newStatus) => {
    try {
      const res = await api.put(
        `/api/orgs/${currentOrg.id}/projects/${projectId}/tasks/${subProjectId}/${taskId}`,
        { status: newStatus }
      )
      setTasks(tasks.map(t => t.id === taskId ? res.data : t))
    } catch (err) {
      console.error('Failed to update task:', err)
    }
  }

  const deleteTask = async (taskId) => {
    try {
      await api.delete(`/api/orgs/${currentOrg.id}/projects/${projectId}/tasks/${subProjectId}/${taskId}`)
      setTasks(tasks.filter(t => t.id !== taskId))
      if (openTaskId === taskId) setOpenTaskId(null)
    } catch (err) {
      console.error('Failed to delete task:', err)
    }
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
    if (selectedIds.size === 0) return
    setBulkBusy(true)
    try {
      await api.post(`/api/orgs/${currentOrg.id}/tasks/bulk`, {
        task_ids: [...selectedIds],
        action,
        value: value ?? null
      })
      setSelectedIds(new Set())
      await fetchTasks()
    } catch (err) {
      console.error('Bulk action failed:', err)
    }
    setBulkBusy(false)
  }

  const columns = {
    todo: tasks.filter(t => t.status === 'todo'),
    in_progress: tasks.filter(t => t.status === 'in_progress'),
    review: tasks.filter(t => t.status === 'review'),
    done: tasks.filter(t => t.status === 'done')
  }

  const openTask = tasks.find(t => t.id === openTaskId) || null

  const TaskCard = ({ task }) => (
    <div
      onClick={() => setOpenTaskId(task.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setOpenTaskId(task.id)}
      className={`bg-slate-800 border rounded-lg p-3 mb-2 cursor-pointer hover:border-brand-500/50 ${
        selectedIds.has(task.id) ? 'border-brand-500' : 'border-slate-700'
      }`}
    >
      <div className="flex justify-between items-start gap-2">
        <input
          type="checkbox"
          checked={selectedIds.has(task.id)}
          onChange={() => toggleSelected(task.id)}
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
          className="p-1 hover:bg-red-500/20 rounded text-red-400 shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )

  const Column = ({ title, status, tasks }) => (
    <div className="bg-slate-900/50 rounded-lg p-3 shrink-0 w-64 lg:w-auto lg:flex-1 min-h-96">
      <h3 className="font-semibold text-white mb-3 text-sm">{title}</h3>
      <div className="space-y-2">
        {tasks.map(task => (
          <div key={task.id} className="flex gap-1">
            <TaskCard task={task} />
            {status !== 'done' && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  const statuses = ['todo', 'in_progress', 'review', 'done']
                  const nextIdx = (statuses.indexOf(status) + 1) % statuses.length
                  updateTaskStatus(task.id, statuses[nextIdx])
                }}
                aria-label="Advance status"
                className="p-1 hover:bg-brand-500/20 rounded text-slate-400 hover:text-brand-400"
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
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500"
        />
        <button
          onClick={createTask}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center gap-2"
        >
          <Plus size={18} /> Add
        </button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4 -mx-1 px-1">
        <Column title="To Do" status="todo" tasks={columns.todo} />
        <Column title="In Progress" status="in_progress" tasks={columns.in_progress} />
        <Column title="Review" status="review" tasks={columns.review} />
        <Column title="Done" status="done" tasks={columns.done} />
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
