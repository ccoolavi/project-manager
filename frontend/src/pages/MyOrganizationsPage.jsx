import { useState, useEffect } from 'react'
import { Building2, ArrowRight, Pencil, LogOut, Plus } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'

export default function MyOrganizationsPage({ onSwitched }) {
  const { switchOrg, createOrg } = useOrg()
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [newOrgName, setNewOrgName] = useState('')

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/api/me/orgs')
      setOrgs(res.data)
    } catch {
      setError('Could not load your organizations.')
    }
    setLoading(false)
  }

  const handleSwitch = async (orgId) => {
    await switchOrg(orgId)
    onSwitched?.()
  }

  const startRename = (org) => {
    setRenamingId(org.id)
    setRenameValue(org.name)
  }

  const saveRename = async (orgId) => {
    try {
      await api.patch(`/api/orgs/${orgId}`, { name: renameValue })
      setRenamingId(null)
      await load()
    } catch {
      setError('Could not rename that organization.')
    }
  }

  const leave = async (orgId) => {
    try {
      await api.delete(`/api/orgs/${orgId}/members/me`)
      await load()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Could not leave that organization.')
    }
  }

  const handleCreate = async () => {
    if (!newOrgName.trim()) return
    await createOrg(newOrgName)
    setNewOrgName('')
    await load()
  }

  if (loading) return <p className="text-slate-400">Loading...</p>

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={18} className="text-brand-400" />
          <h2 className="text-xl font-bold text-white">My Organizations</h2>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/40 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {orgs.map((org) => (
            <div key={org.id} className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-lg">
              <div className="flex-1 min-w-0">
                {renamingId === org.id ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveRename(org.id)}
                    className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-white text-sm w-full"
                  />
                ) : (
                  <p className="text-white font-medium truncate">{org.name}</p>
                )}
                <p className="text-xs text-slate-400 capitalize">{org.role} &middot; {org.member_count} member{org.member_count === 1 ? '' : 's'}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {renamingId === org.id ? (
                  <button onClick={() => saveRename(org.id)} className="px-2 py-1 text-xs bg-brand-500 hover:bg-brand-600 text-white rounded">Save</button>
                ) : (
                  (org.role === 'owner' || org.role === 'admin') && (
                    <button onClick={() => startRename(org)} aria-label={`Rename ${org.name}`} className="p-1.5 hover:bg-slate-700 rounded text-slate-300">
                      <Pencil size={16} />
                    </button>
                  )
                )}
                <button onClick={() => leave(org.id)} aria-label={`Leave ${org.name}`} className="p-1.5 hover:bg-red-500/20 rounded text-red-400">
                  <LogOut size={16} />
                </button>
                <button onClick={() => handleSwitch(org.id)} className="px-3 py-1.5 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded flex items-center gap-1">
                  Open <ArrowRight size={14} />
                </button>
              </div>
            </div>
          ))}
          {orgs.length === 0 && <p className="text-sm text-slate-400">You don't belong to any organizations yet.</p>}
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-4">
          <Plus size={18} className="text-brand-400" />
          <h2 className="text-xl font-bold text-white">Create a new organization</h2>
        </div>
        <div className="flex gap-2">
          <input
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Organization name..."
            className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500"
          />
          <button onClick={handleCreate} className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg">
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
