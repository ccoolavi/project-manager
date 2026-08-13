import { useState, useEffect } from 'react'
import { History } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import { useLocalization } from '../context/LocalizationContext'
import { hasRole } from '../utils/permissions'

/** Turn a stored row into a sentence, rather than showing raw column values. */
function describe(entry) {
  const what = entry.entity_type === 'member' ? 'someone' : `a ${entry.entity_type}`
  const name = entry.changes?.name || entry.changes?.title || entry.changes?.email

  switch (entry.action) {
    case 'created':
      return name ? `created the ${entry.entity_type} "${name}"` : `created ${what}`
    case 'deleted':
      return name ? `deleted the ${entry.entity_type} "${name}"` : `deleted ${what}`
    case 'invited':
      return `invited ${name || 'someone'}${entry.changes?.role ? ` as ${entry.changes.role}` : ''}`
    case 'removed':
      return 'removed someone from the organisation'
    case 'joined':
      return 'joined the organisation'
    default:
      return `${entry.action} ${what}`
  }
}

export default function ActivityLog() {
  const { currentOrg } = useOrg()
  const { formatDateTime } = useLocalization()
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const canView = hasRole('owner', 'admin')

  useEffect(() => {
    if (currentOrg && canView) load()
    else setLoading(false)
  }, [currentOrg?.id])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/audit-logs`)
      setEntries(res.data)
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? 'Only owners and admins can see the activity log.'
          : 'Could not load recent activity.'
      )
    }
    setLoading(false)
  }

  if (!canView) return null

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
      <div className="flex items-center gap-2 mb-1">
        <History size={18} className="text-brand-400" />
        <h2 className="text-xl font-bold text-white">Recent activity</h2>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Who changed what in {currentOrg?.name}.
      </p>

      {error && (
        <div className="px-3 py-2 bg-red-500/10 border border-red-500/40 rounded-lg text-sm text-red-300">
          {error}
        </div>
      )}
      {loading && <p className="text-sm text-slate-400">Loading...</p>}
      {!loading && !error && entries.length === 0 && (
        <p className="text-sm text-slate-400">Nothing has happened here yet.</p>
      )}

      <div className="space-y-1 max-h-80 overflow-y-auto">
        {entries.map((e) => (
          <div
            key={e.id}
            className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded"
          >
            <p className="text-sm text-slate-200">
              <span className="font-medium text-white">{e.actor}</span> {describe(e)}
            </p>
            <span className="text-xs text-slate-500 shrink-0">
              {formatDateTime(e.timestamp)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
