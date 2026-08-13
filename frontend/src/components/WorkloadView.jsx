import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'

const SERIES = [
  { key: 'todo', label: 'To Do', color: '#64748b' },      // slate-500
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6' }, // blue-500
  { key: 'review', label: 'Review', color: '#f59e0b' },   // amber-500
  { key: 'done', label: 'Done', color: '#22c55e' }        // green-500
]

export default function WorkloadView() {
  const { currentOrg } = useOrg()
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (currentOrg) load()
  }, [currentOrg?.id])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/workload`)
      setData(res.data.map((row) => ({ ...row, name: row.user_name })))
    } catch {
      setError('Could not load workload data.')
    }
    setLoading(false)
  }

  const totalTasks = data.reduce((sum, row) => sum + row.total, 0)

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <h2 className="text-xl font-bold text-white mb-1">Team workload</h2>
        <p className="text-sm text-slate-400 mb-4">
          How assigned tasks are spread across {currentOrg?.name}.
        </p>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 mb-4">
            {error}
          </p>
        )}
        {loading && <p className="text-sm text-slate-400">Loading...</p>}

        {!loading && !error && totalTasks === 0 && (
          <p className="text-sm text-slate-400">No tasks assigned to anyone yet.</p>
        )}

        {!loading && !error && totalTasks > 0 && (
          <div style={{ width: '100%', height: Math.max(180, data.length * 60) }}>
            <ResponsiveContainer>
              <BarChart data={data} layout="vertical" margin={{ left: 16, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
                <XAxis type="number" allowDecimals={false} stroke="#94a3b8" fontSize={12} />
                <YAxis type="category" dataKey="name" stroke="#94a3b8" fontSize={12} width={110} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 13 }}
                  labelStyle={{ color: '#e2e8f0' }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                {SERIES.map((s) => (
                  <Bar key={s.key} dataKey={s.key} name={s.label} stackId="tasks" fill={s.color} radius={[0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {!loading && data.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-left">
                <th className="px-4 py-2 font-medium">Person</th>
                {SERIES.map((s) => (
                  <th key={s.key} className="px-4 py-2 font-medium text-right">{s.label}</th>
                ))}
                <th className="px-4 py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.user_id} className="border-b border-slate-800 last:border-0 text-slate-200">
                  <td className="px-4 py-2">{row.user_name}</td>
                  {SERIES.map((s) => (
                    <td key={s.key} className="px-4 py-2 text-right">{row[s.key]}</td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
