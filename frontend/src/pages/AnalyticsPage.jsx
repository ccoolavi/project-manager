import { useState, useEffect } from 'react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import { useLocalization } from '../context/LocalizationContext'

const STATUS_COLORS = { done: '#22c55e', todo: '#64748b' }
const CHART_TOOLTIP = {
  contentStyle: { background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 13 },
  labelStyle: { color: '#e2e8f0' }
}

function SummaryCard({ label, value, sub }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function AnalyticsPage() {
  const { currentOrg } = useOrg()
  const { formatDate } = useLocalization()
  const [tasks, setTasks] = useState(null)
  const [time, setTime] = useState([])
  const [velocity, setVelocity] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (currentOrg) load()
  }, [currentOrg?.id])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [t, tm, v] = await Promise.all([
        api.get(`/api/orgs/${currentOrg.id}/analytics/tasks`),
        api.get(`/api/orgs/${currentOrg.id}/analytics/time`),
        api.get(`/api/orgs/${currentOrg.id}/analytics/velocity`)
      ])
      setTasks(t.data)
      setTime(tm.data)
      setVelocity(v.data.map((w) => ({ ...w, label: formatDate(w.week_start) })))
    } catch {
      setError('Could not load analytics.')
    }
    setLoading(false)
  }

  if (loading) return <p className="text-slate-400">Loading...</p>
  if (error) return <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">{error}</p>

  const pieData = tasks
    ? [
        { name: 'Done', value: tasks.overall.done },
        { name: 'Remaining', value: tasks.overall.total - tasks.overall.done }
      ]
    : []

  const timeByCategory = Object.values(
    time.reduce((acc, row) => {
      acc[row.category] = acc[row.category] || { category: row.category, hours: 0 }
      acc[row.category].hours += row.hours
      return acc
    }, {})
  )

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Task completion"
          value={`${Math.round((tasks?.overall.completion_rate || 0) * 100)}%`}
          sub={`${tasks?.overall.done || 0} of ${tasks?.overall.total || 0} tasks`}
        />
        <SummaryCard
          label="Habit consistency"
          value={`${Math.round((habits?.completion_rate_30d || 0) * 100)}%`}
          sub="last 30 days"
        />
        <SummaryCard
          label="Time logged"
          value={`${time.reduce((s, r) => s + r.hours, 0).toFixed(1)}h`}
          sub="last 30 days"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Velocity — tasks completed per week</h3>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <LineChart data={velocity}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} />
                <YAxis allowDecimals={false} stroke="#94a3b8" fontSize={11} />
                <Tooltip {...CHART_TOOLTIP} />
                <Line type="monotone" dataKey="completed" stroke="#4370ff" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Task status distribution</h3>
          {tasks?.overall.total ? (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    <Cell fill={STATUS_COLORS.done} />
                    <Cell fill={STATUS_COLORS.todo} />
                  </Pie>
                  <Tooltip {...CHART_TOOLTIP} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-16 text-center">No tasks yet.</p>
          )}
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-3">Time by category — last 30 days</h3>
          {timeByCategory.length > 0 ? (
            <div style={{ width: '100%', height: 220 }}>
              <ResponsiveContainer>
                <BarChart data={timeByCategory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="category" stroke="#94a3b8" fontSize={11} />
                  <YAxis stroke="#94a3b8" fontSize={11} />
                  <Tooltip {...CHART_TOOLTIP} />
                  <Bar dataKey="hours" fill="#4370ff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-16 text-center">No time logged in the last 30 days.</p>
          )}
        </div>
      </div>

    </div>
  )
}
