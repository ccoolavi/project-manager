import { useState, useEffect } from 'react'
import { Lock, X, Plus } from 'lucide-react'
import api from '../utils/api'

/**
 * "Blocked by" section of the Task Detail Panel: the tasks this one is
 * waiting on, as dismissable chips, plus a dropdown to add another blocker
 * drawn from other tasks in the same project (the server rejects anything
 * outside it, but filtering client-side avoids the round trip failing).
 */
export default function TaskDependencies({ orgId, projectId, subProjectId, task, onBlockedChange }) {
  const [deps, setDeps] = useState([])
  const [candidates, setCandidates] = useState([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const depsUrl = `/api/orgs/${orgId}/projects/${projectId}/tasks/${subProjectId}/${task.id}/dependencies`

  useEffect(() => {
    load()
  }, [task.id])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [depsRes, projectRes] = await Promise.all([
        api.get(depsUrl),
        loadProjectTasks()
      ])
      setDeps(depsRes.data)
      setCandidates(
        projectRes.filter((t) => t.id !== task.id && !depsRes.data.some((d) => d.depends_on_id === t.id))
      )
    } catch {
      setError('Could not load dependencies.')
    }
    setLoading(false)
  }

  const loadProjectTasks = async () => {
    const subsRes = await api.get(`/api/orgs/${orgId}/projects/${projectId}/sub-projects`)
    const lists = await Promise.all(
      subsRes.data.map((s) => api.get(`/api/orgs/${orgId}/projects/${projectId}/tasks/${s.id}`))
    )
    return lists.flatMap((r) => r.data)
  }

  const addDependency = async () => {
    if (!selected) return
    setError('')
    try {
      const res = await api.post(depsUrl, { depends_on_id: Number(selected) })
      setDeps([...deps, res.data])
      setCandidates(candidates.filter((c) => c.id !== Number(selected)))
      setSelected('')
      onBlockedChange?.()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not add that dependency.')
    }
  }

  const removeDependency = async (dep) => {
    setError('')
    try {
      await api.delete(`${depsUrl}/${dep.id}`)
      setDeps(deps.filter((d) => d.id !== dep.id))
      onBlockedChange?.()
    } catch {
      setError('Could not remove that dependency.')
    }
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-white flex items-center gap-1.5">
        <Lock size={14} className={task.blocked ? 'text-amber-400' : 'text-slate-500'} />
        Blocked by
      </h4>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {loading && <p className="text-xs text-slate-500">Loading...</p>}

      {!loading && deps.length === 0 && (
        <p className="text-xs text-slate-500">Not waiting on anything.</p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {deps.map((d) => (
          <span
            key={d.id}
            className={`inline-flex items-center gap-1 pl-2 pr-1 py-1 rounded-full text-xs border ${
              d.depends_on_status === 'done'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}
          >
            {d.depends_on_title}
            <button
              onClick={() => removeDependency(d)}
              aria-label={`Remove dependency on ${d.depends_on_title}`}
              className="hover:text-white"
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>

      {candidates.length > 0 && (
        <div className="flex gap-2 pt-1">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Add a blocking task"
            className="flex-1 px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-xs"
          >
            <option value="">Add a blocking task...</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          <button
            onClick={addDependency}
            disabled={!selected}
            aria-label="Add dependency"
            className="px-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded"
          >
            <Plus size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
