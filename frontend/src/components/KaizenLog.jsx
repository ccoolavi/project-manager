import { useState, useEffect } from 'react'
import { Plus, Trash2, Lightbulb } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'

const CATEGORIES = ['productivity', 'mindset', 'workflow', 'health', 'other']

export default function KaizenLog() {
  const { currentOrg } = useOrg()
  const [logs, setLogs] = useState([])
  const [title, setTitle] = useState('')
  const [problem, setProblem] = useState('')
  const [solution, setSolution] = useState('')
  const [category, setCategory] = useState('productivity')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchLogs()
  }, [currentOrg?.id])

  const fetchLogs = async () => {
    if (!currentOrg) return
    setLoading(true)
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/kaizen`)
      setLogs(res.data)
    } catch (err) {
      console.error('Failed to fetch kaizen logs:', err)
    }
    setLoading(false)
  }

  const createLog = async () => {
    if (!title.trim() || !problem.trim() || !solution.trim()) return
    try {
      const res = await api.post(`/api/orgs/${currentOrg.id}/kaizen`, {
        title,
        problem,
        solution,
        category
      })
      setLogs([...logs, res.data])
      setTitle('')
      setProblem('')
      setSolution('')
      setCategory('productivity')
    } catch (err) {
      console.error('Failed to create kaizen log:', err)
    }
  }

  const deleteLog = async (logId) => {
    try {
      await api.delete(`/api/orgs/${currentOrg.id}/kaizen/${logId}`)
      setLogs(logs.filter(l => l.id !== logId))
    } catch (err) {
      console.error('Failed to delete log:', err)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
        <h3 className="font-semibold text-white">Log Improvement</h3>
        
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Improvement title..."
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
        />

        <textarea
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          placeholder="What was the problem?"
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white h-20"
        />

        <textarea
          value={solution}
          onChange={(e) => setSolution(e.target.value)}
          placeholder="What's the solution?"
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white h-20"
        />

        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
        >
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </option>
          ))}
        </select>

        <button
          onClick={createLog}
          className="w-full px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center justify-center gap-2"
        >
          <Plus size={18} /> Log Improvement
        </button>
      </div>

      <div className="space-y-3">
        {logs.map(log => (
          <div key={log.id} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-semibold text-white">{log.title}</h4>
                <span className="text-xs px-2 py-1 bg-brand-500/20 text-brand-300 rounded mt-1 inline-block">
                  {log.category}
                </span>
              </div>
              <button
                onClick={() => deleteLog(log.id)}
                className="p-1 hover:bg-red-500/20 rounded text-red-400"
              >
                <Trash2 size={16} />
              </button>
            </div>
            
            <div className="mt-3 space-y-2 text-sm">
              <div>
                <p className="text-slate-400 font-medium">Problem:</p>
                <p className="text-slate-200">{log.problem}</p>
              </div>
              <div>
                <p className="text-slate-400 font-medium">Solution:</p>
                <p className="text-slate-200">{log.solution}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {logs.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          <Lightbulb size={32} className="mx-auto mb-2 opacity-50" />
          <p>No improvements logged yet. Start capturing your learnings! 💡</p>
        </div>
      )}
    </div>
  )
}
