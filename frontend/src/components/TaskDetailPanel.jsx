import { useState, useEffect } from 'react'
import { X, Check } from 'lucide-react'
import api from '../utils/api'
import TaskComments from './TaskComments'
import TaskDependencies from './TaskDependencies'
import { TASK_STATUSES, TASK_PRIORITIES } from '../config'

const STATUS_LABELS = { todo: 'To Do', in_progress: 'In Progress', review: 'Review', done: 'Done' }

/** yyyy-mm-dd for an <input type="date">, or '' if unset. */
function toDateInput(iso) {
  if (!iso) return ''
  return iso.slice(0, 10)
}

/**
 * Full task-editing drawer. Every field change saves immediately via PUT —
 * there is no separate "Save" button — and local state updates once the
 * server confirms, so a failed save leaves the field showing the last known
 * good value rather than a change that silently didn't stick.
 */
export default function TaskDetailPanel({ orgId, projectId, subProjectId, task, members, onClose, onTaskUpdate }) {
  const [title, setTitle] = useState(task?.title || '')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setTitle(task?.title || ''), [task?.id])

  if (!task) return null

  const baseUrl = `/api/orgs/${orgId}/projects/${projectId}/tasks/${subProjectId}/${task.id}`

  const save = async (patch) => {
    setSaving(true)
    setError('')
    try {
      const res = await api.put(baseUrl, patch)
      onTaskUpdate?.(res.data)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } catch {
      setError('Could not save that change. It will be sent when you are back online.')
    }
    setSaving(false)
  }

  const saveTitle = () => {
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) save({ title: trimmed })
    else setTitle(task.title)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close task details"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-800">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
            aria-label="Task title"
            className="flex-1 bg-transparent text-lg font-semibold text-white focus:outline-none focus:bg-slate-800 rounded px-1 -mx-1"
          />
          <div className="flex items-center gap-2 shrink-0">
            {savedFlash && <Check size={16} className="text-emerald-400" />}
            <button onClick={onClose} aria-label="Close" className="p-1 text-slate-400 hover:text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Status</label>
              <select
                value={task.status}
                onChange={(e) => save({ status: e.target.value })}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Priority</label>
              <select
                value={task.priority}
                onChange={(e) => save({ priority: e.target.value })}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm capitalize"
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Start date</label>
              <input
                type="date"
                value={toDateInput(task.start_date)}
                onChange={(e) => save({ start_date: e.target.value ? `${e.target.value}T00:00:00` : null })}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Due date</label>
              <input
                type="date"
                value={toDateInput(task.due_date)}
                onChange={(e) => save({ due_date: e.target.value ? `${e.target.value}T00:00:00` : null })}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Assignee</label>
              <select
                value={task.assignee_id ?? ''}
                onChange={(e) => save({ assignee_id: e.target.value ? Number(e.target.value) : null })}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
              >
                <option value="">Unassigned</option>
                {(members || []).map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.user?.name || m.user?.email}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Story points</label>
              <input
                type="number"
                min={1}
                max={13}
                value={task.story_points || ''}
                placeholder="—"
                onChange={(e) => {
                  const v = e.target.value
                  if (v === '') return
                  const n = Math.min(13, Math.max(1, Number(v)))
                  save({ story_points: n })
                }}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm"
              />
            </div>
          </div>

          {task.description && (
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{task.description}</p>
          )}

          <TaskDependencies
            orgId={orgId}
            projectId={projectId}
            subProjectId={subProjectId}
            task={task}
            onBlockedChange={async () => {
              // Adding/removing a dependency changes the server-computed
              // `blocked` flag on this task; re-fetch it so the lock icon
              // here and on the Kanban card stay in sync.
              try {
                const res = await api.get(baseUrl)
                onTaskUpdate?.(res.data)
              } catch {
                // Non-fatal — the dependency itself already saved.
              }
            }}
          />

          <TaskComments
            orgId={orgId}
            projectId={projectId}
            subProjectId={subProjectId}
            taskId={task.id}
          />
        </div>
      </div>
    </div>
  )
}
