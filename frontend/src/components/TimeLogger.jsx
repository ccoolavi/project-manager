import { useState, useEffect } from 'react'
import { Plus, Trash2, Clock } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import { useLocalization } from '../context/LocalizationContext'

export default function TimeLogger() {
  const { currentOrg } = useOrg()
  const { formatDuration, formatDate } = useLocalization()
  const [entries, setEntries] = useState([])
  const [duration, setDuration] = useState('')
  const [category, setCategory] = useState('development')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchEntries()
  }, [currentOrg?.id])

  const fetchEntries = async () => {
    if (!currentOrg) return
    setLoading(true)
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/time`)
      setEntries(res.data)
    } catch (err) {
      console.error('Failed to fetch time entries:', err)
    }
    setLoading(false)
  }

  const logTime = async () => {
    if (!duration || isNaN(duration)) return
    try {
      const res = await api.post(`/api/orgs/${currentOrg.id}/time`, {
        duration_minutes: parseInt(duration),
        category: category,
        date: new Date().toISOString()
      })
      setEntries([...entries, res.data])
      setDuration('')
    } catch (err) {
      console.error('Failed to log time:', err)
    }
  }

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0)
  const totalHours = (totalMinutes / 60).toFixed(1)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-brand-500/10 border border-brand-500/30 rounded-lg p-4">
          <p className="text-sm text-slate-400">Total Time Logged</p>
          <p className="text-2xl font-bold text-brand-400">{formatDuration(totalMinutes)}</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
          <p className="text-sm text-slate-400">Entries</p>
          <p className="text-2xl font-bold text-emerald-400">{entries.length}</p>
        </div>
      </div>

      <div className="space-y-2">
        <input
          type="number"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="Minutes"
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white"
        >
          <option value="development">Development</option>
          <option value="meeting">Meeting</option>
          <option value="research">Research</option>
          <option value="break">Break</option>
        </select>
        <button
          onClick={logTime}
          className="w-full px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex items-center justify-center gap-2"
        >
          <Clock size={18} /> Log Time
        </button>
      </div>

      <div className="space-y-2">
        {entries.slice().reverse().map(entry => (
          <div key={entry.id} className="flex justify-between items-center bg-slate-800 p-3 rounded-lg border border-slate-700">
            <div>
              <p className="font-medium text-white">{formatDuration(entry.duration_minutes)}</p>
                <p className="text-xs text-slate-500">{formatDate(entry.date)}</p>
              <p className="text-xs text-slate-400">{entry.category}</p>
            </div>
            <button
              onClick={() => setEntries(entries.filter(e => e.id !== entry.id))}
              className="p-1 hover:bg-red-500/20 rounded text-red-400"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
