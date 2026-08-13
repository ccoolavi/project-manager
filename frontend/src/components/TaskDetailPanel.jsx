import { X } from 'lucide-react'
import TaskComments from './TaskComments'

/**
 * Slide-in drawer for a single task's detail. Deliberately thin for now — it
 * shows the task and its comment thread; task editing (status, priority, dates,
 * assignee, story points) is layered on top of this same shell.
 */
export default function TaskDetailPanel({ orgId, projectId, subProjectId, task, onClose }) {
  if (!task) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close task details"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-800">
          <h3 className="text-lg font-semibold text-white break-words">{task.title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 shrink-0 text-slate-400 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <span
            className={`text-xs inline-block px-2 py-1 rounded capitalize ${
              task.priority === 'urgent' ? 'bg-red-500/20 text-red-300' :
              task.priority === 'high' ? 'bg-orange-500/20 text-orange-300' :
              task.priority === 'medium' ? 'bg-blue-500/20 text-blue-300' :
              'bg-slate-700 text-slate-300'
            }`}
          >
            {task.priority}
          </span>

          {task.description && (
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{task.description}</p>
          )}

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
