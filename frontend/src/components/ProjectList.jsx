import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, FolderOpen, Folder } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import { useSensitiveAction } from '../hooks/useSensitiveAction'
import SensitiveActionModal from './SensitiveActionModal'
import { errorMessage } from '../utils/errors'

export default function ProjectList({ selectedProjectId, selectedSubProjectId, onSelectProject }) {
  const { currentOrg } = useOrg()
  const [projects, setProjects] = useState([])
  const [subProjects, setSubProjects] = useState([])
  const [newProjectName, setNewProjectName] = useState('')
  const [newSectionName, setNewSectionName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const creatingProjectRef = useRef(false)
  const creatingSectionRef = useRef(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null) // the project waiting for "are you sure?"
  const sensitiveAction = useSensitiveAction()

  useEffect(() => {
    fetchProjects()
  }, [currentOrg?.id])

  // The board offers to create a section for a project that has none; reload this list when it does.
  useEffect(() => {
    const onSections = (e) => {
      const id = e.detail?.projectId
      if (id != null) fetchSubProjects(id)
    }
    window.addEventListener('kaizenpm:sections-changed', onSections)
    return () => window.removeEventListener('kaizenpm:sections-changed', onSections)
  }, [currentOrg?.id])

  const fetchProjects = async () => {
    if (!currentOrg) return
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/projects`)
      setProjects(res.data)
      if (res.data.length > 0) {
        // Switching tabs remounts this list: keep what the person had selected, and only fall back to the first project.
        const keep = res.data.find((p) => p.id === selectedProjectId)
        await fetchSubProjects((keep || res.data[0]).id, keep ? selectedSubProjectId : null)
      } else {
        setSubProjects([])
        onSelectProject(null, null)
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not load your projects. Please try again.'))
    }
    setLoading(false)
  }

  const fetchSubProjects = async (projectId, preferredSubId = null) => {
    setError('')
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/projects/${projectId}/sub-projects`)
      setSubProjects(res.data)
      const chosen = res.data.find((sp) => sp.id === preferredSubId) || res.data[0]
      onSelectProject(projectId, chosen?.id ?? null)
    } catch (err) {
      setError(errorMessage(err, 'Could not load sections for this project.'))
    }
  }

  const doCreateProject = async () => {
    if (!newProjectName.trim()) {
      setError('Type a name for the project first.')
      return
    }
    setError('')
    let project
    try {
      const res = await api.post(`/api/orgs/${currentOrg.id}/projects`, {
        name: newProjectName.trim(),
        status: 'active'
      })
      project = res.data
    } catch (err) {
      if (err.queued) setNewProjectName('') // saved on this device; the toast says so, do not let it be typed twice
      setError(
        err?.response?.status === 403
          ? 'You do not have permission to create projects here.'
          : errorMessage(err, 'Could not create the project. Please try again.')
      )
      return
    }
    setProjects((cur) => [...cur, project])
    setNewProjectName('')
    // Every project gets a default section so the task board is usable immediately: a first-time user should never have
    // to know what a "sub-project" is before they can add their first task.
    try {
      const sub = await api.post(
        `/api/orgs/${currentOrg.id}/projects/${project.id}/sub-projects`,
        { name: 'General', status: 'active' }
      )
      setSubProjects([sub.data])
      onSelectProject(project.id, sub.data.id)
    } catch (err) {
      // The project exists but its first section could not be added. Select the project anyway: the board then offers a
      // one-click "Create the General section" instead of a dead end.
      setSubProjects([])
      onSelectProject(project.id, null)
      setError('The project was created, but its first section could not be added. Use "Create the General section" on the board.')
    }
  }

  const doCreateSection = async () => {
    if (!selectedProjectId) {
      setError('Pick a project first, then add a section to it.')
      return
    }
    if (!newSectionName.trim()) {
      setError('Type a name for the section first.')
      return
    }
    setError('')
    try {
      const res = await api.post(
        `/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sub-projects`,
        { name: newSectionName.trim(), status: 'active' }
      )
      setSubProjects((cur) => [...cur, res.data])
      setNewSectionName('')
      onSelectProject(selectedProjectId, res.data.id)
    } catch (err) {
      if (err.queued) setNewSectionName('')
      setError(
        err?.response?.status === 403
          ? 'You do not have permission to add sections here.'
          : errorMessage(err, 'Could not add the section. Please try again.')
      )
    }
  }

  // A second click before the first request has finished must not create a second copy.
  const createProject = async () => {
    if (creatingProjectRef.current) return
    creatingProjectRef.current = true
    try {
      await doCreateProject()
    } finally {
      creatingProjectRef.current = false
    }
  }

  const createSection = async () => {
    if (creatingSectionRef.current) return
    creatingSectionRef.current = true
    try {
      await doCreateSection()
    } finally {
      creatingSectionRef.current = false
    }
  }

  const deleteProject = async (projectId) => {
    setError('')
    setConfirmDeleteId(null)
    try {
      await sensitiveAction.guard(async () => {
        await api.delete(`/api/orgs/${currentOrg.id}/projects/${projectId}`)
        setProjects((current) => current.filter((p) => p.id !== projectId))
        if (selectedProjectId === projectId) {
          setSubProjects([])
          onSelectProject(null, null)
        }
      })
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? 'Only the organisation owner can delete a project.'
          : errorMessage(err, 'Could not delete the project.')
      )
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createProject()}
          placeholder="New project..."
          aria-label="New project name"
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
        />
        <button
          onClick={createProject}
          aria-label="Create project"
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center gap-2"
        >
          <Plus size={18} />
        </button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/40 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && <p className="text-sm text-slate-400">Loading...</p>}

      {!loading && projects.length === 0 && (
        <p className="text-sm text-slate-400">
          No projects yet. Type a name above to create your first one.
        </p>
      )}

      <div className="space-y-2">
        {projects.map(project => (
          <div
            key={project.id}
            className={`p-3 rounded-lg border cursor-pointer transition ${
              selectedProjectId === project.id
                ? 'bg-brand-500/20 border-brand-500'
                : 'bg-slate-800 border-slate-700 hover:border-slate-600'
            }`}
            onClick={() => fetchSubProjects(project.id)}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Folder size={18} className={selectedProjectId === project.id ? 'text-brand-400' : 'text-slate-400'} />
                <div>
                  <p className="font-medium text-white">{project.name}</p>
                  <p className="text-xs text-slate-400">{project.status}</p>
                </div>
              </div>
              {confirmDeleteId === project.id ? (
                // Deleting removes the project AND every task in it, so ask once before doing it.
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => deleteProject(project.id)}
                    aria-label={`Confirm deleting ${project.name}`}
                    className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                  >
                    Delete project and its tasks
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    aria-label="Cancel deleting"
                    className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setConfirmDeleteId(project.id)
                  }}
                  aria-label={`Delete ${project.name}`}
                  className="p-1 hover:bg-red-500/20 rounded text-red-400"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedProjectId && (
        <div className="mt-4 pt-4 border-t border-slate-700">
          <h4 className="font-semibold text-white mb-1">Sections</h4>
          <p className="text-xs text-slate-500 mb-2">Group tasks within this project.</p>

          <div className="space-y-1 mb-3">
            {subProjects.map(sub => (
              <div
                key={sub.id}
                className={`flex items-center gap-2 p-2 rounded cursor-pointer transition ${
                  selectedSubProjectId === sub.id
                    ? 'bg-brand-500/20 text-brand-200'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
                onClick={() => onSelectProject(selectedProjectId, sub.id)}
              >
                <FolderOpen size={16} className="text-slate-400" />
                <span className="text-sm">{sub.name}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={newSectionName}
              onChange={(e) => setNewSectionName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createSection()}
              placeholder="New section..."
              aria-label="New section name"
              className="flex-1 px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
            <button
              onClick={createSection}
              aria-label="Create section"
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>
      )}

      <SensitiveActionModal {...sensitiveAction} />
    </div>
  )
}
