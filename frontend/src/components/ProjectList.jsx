import { useState, useEffect } from 'react'
import { Plus, Trash2, FolderOpen, Folder } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'

export default function ProjectList({ selectedProjectId, selectedSubProjectId, onSelectProject }) {
  const { currentOrg } = useOrg()
  const [projects, setProjects] = useState([])
  const [subProjects, setSubProjects] = useState([])
  const [newProjectName, setNewProjectName] = useState('')
  const [newSectionName, setNewSectionName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchProjects()
  }, [currentOrg?.id])

  const fetchProjects = async () => {
    if (!currentOrg) return
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/projects`)
      setProjects(res.data)
      if (res.data.length > 0) {
        await fetchSubProjects(res.data[0].id)
      } else {
        setSubProjects([])
        onSelectProject(null, null)
      }
    } catch (err) {
      setError('Could not load your projects. Please try again.')
    }
    setLoading(false)
  }

  const fetchSubProjects = async (projectId) => {
    setError('')
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/projects/${projectId}/sub-projects`)
      setSubProjects(res.data)
      onSelectProject(projectId, res.data[0]?.id ?? null)
    } catch (err) {
      setError('Could not load sections for this project.')
    }
  }

  const createProject = async () => {
    if (!newProjectName.trim()) return
    setError('')
    try {
      const res = await api.post(`/api/orgs/${currentOrg.id}/projects`, {
        name: newProjectName.trim(),
        status: 'active'
      })
      const project = res.data
      // Every project gets a default section so the task board is usable
      // immediately — a first-time user should never have to know what a
      // "sub-project" is before they can add their first task.
      const sub = await api.post(
        `/api/orgs/${currentOrg.id}/projects/${project.id}/sub-projects`,
        { name: 'General', status: 'active' }
      )
      setProjects([...projects, project])
      setSubProjects([sub.data])
      setNewProjectName('')
      onSelectProject(project.id, sub.data.id)
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? 'You do not have permission to create projects here.'
          : 'Could not create the project. Please try again.'
      )
    }
  }

  const createSection = async () => {
    if (!newSectionName.trim() || !selectedProjectId) return
    setError('')
    try {
      const res = await api.post(
        `/api/orgs/${currentOrg.id}/projects/${selectedProjectId}/sub-projects`,
        { name: newSectionName.trim(), status: 'active' }
      )
      setSubProjects([...subProjects, res.data])
      setNewSectionName('')
      onSelectProject(selectedProjectId, res.data.id)
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? 'You do not have permission to add sections here.'
          : 'Could not add the section. Please try again.'
      )
    }
  }

  const deleteProject = async (projectId) => {
    setError('')
    try {
      await api.delete(`/api/orgs/${currentOrg.id}/projects/${projectId}`)
      const remaining = projects.filter(p => p.id !== projectId)
      setProjects(remaining)
      if (selectedProjectId === projectId) {
        setSubProjects([])
        onSelectProject(null, null)
      }
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? 'Only the organisation owner can delete a project.'
          : 'Could not delete the project.'
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
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteProject(project.id)
                }}
                aria-label={`Delete ${project.name}`}
                className="p-1 hover:bg-red-500/20 rounded text-red-400"
              >
                <Trash2 size={16} />
              </button>
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
    </div>
  )
}
