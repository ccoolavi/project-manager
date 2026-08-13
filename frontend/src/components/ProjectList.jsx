import { useState, useEffect } from 'react'
import { Plus, Trash2, FolderOpen, Folder } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'

export default function ProjectList({ selectedProjectId, onSelectProject }) {
  const { currentOrg } = useOrg()
  const [projects, setProjects] = useState([])
  const [subProjects, setSubProjects] = useState([])
  const [newProjectName, setNewProjectName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [currentOrg?.id])

  const fetchProjects = async () => {
    if (!currentOrg) return
    setLoading(true)
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/projects`)
      setProjects(res.data)
      if (res.data.length > 0) {
        fetchSubProjects(res.data[0].id)
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err)
    }
    setLoading(false)
  }

  const fetchSubProjects = async (projectId) => {
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/projects/${projectId}/sub-projects`)
      setSubProjects(res.data)
      onSelectProject(projectId, res.data[0]?.id)
    } catch (err) {
      console.error('Failed to fetch sub-projects:', err)
    }
  }

  const createProject = async () => {
    if (!newProjectName.trim()) return
    try {
      const res = await api.post(`/api/orgs/${currentOrg.id}/projects`, {
        name: newProjectName,
        status: 'active'
      })
      setProjects([...projects, res.data])
      setNewProjectName('')
    } catch (err) {
      console.error('Failed to create project:', err)
    }
  }

  const deleteProject = async (projectId) => {
    try {
      await api.delete(`/api/orgs/${currentOrg.id}/projects/${projectId}`)
      setProjects(projects.filter(p => p.id !== projectId))
    } catch (err) {
      console.error('Failed to delete project:', err)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={newProjectName}
          onChange={(e) => setNewProjectName(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && createProject()}
          placeholder="New project..."
          className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
        />
        <button
          onClick={createProject}
          className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center gap-2"
        >
          <Plus size={18} />
        </button>
      </div>

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
          <h4 className="font-semibold text-white mb-2">Sub-Projects</h4>
          <div className="space-y-1">
            {subProjects.map(sub => (
              <div key={sub.id} className="flex items-center gap-2 p-2 hover:bg-slate-800 rounded cursor-pointer" onClick={() => onSelectProject(selectedProjectId, sub.id)}>
                <FolderOpen size={16} className="text-slate-400" />
                <span className="text-sm text-slate-300">{sub.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
