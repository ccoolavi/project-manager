import { useState, useEffect } from 'react'
import { Building2, ArrowRight, Pencil, LogOut, Plus } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import { errorMessage } from '../utils/errors'
import { useToast } from '../components/Toast'

export default function MyOrganizationsPage({ onSwitched }) {
  const { switchOrg, createOrg, fetchOrgs } = useOrg()
  const toast = useToast()
  const [leavingId, setLeavingId] = useState(null) // which organisation is waiting for "are you sure?"
  const [creating, setCreating] = useState(false)
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
    const name = renameValue.trim()
    if (!name) {
      setError('An organization needs a name.')
      return
    }
    setError('')
    try {
      await api.patch(`/api/orgs/${orgId}`, { name })
      setRenamingId(null)
      await fetchOrgs() // the selector at the top of the screen must show the new name too
      await load()
    } catch (err) {
      setError(errorMessage(err, 'Could not rename that organization.'))
    }
  }

  const leave = async (org) => {
    setError('')
    try {
      await api.delete(`/api/orgs/${org.id}/members/me`)
      setLeavingId(null)
      toast.success(`You left ${org.name}.`)
      // Refresh the shared list: if this was the organisation on screen, the app moves to another one (or offers to
      // create a new one) instead of carrying on with an organisation the person no longer belongs to.
      await fetchOrgs()
      await load()
    } catch (err) {
      setLeavingId(null)
      setError(errorMessage(err, 'Could not leave that organization.'))
    }
  }

  const handleCreate = async () => {
    if (creating) return
    if (!newOrgName.trim()) {
      setError('Type a name for the new organization first.')
      return
    }
    setError('')
    setCreating(true)
    try {
      await createOrg(newOrgName.trim())
      setNewOrgName('')
      await load()
    } catch (err) {
      setError(errorMessage(err, 'Could not create that organization.'))
    }
    setCreating(false)
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(org.id)
                      if (e.key === 'Escape') setRenamingId(null)
                    }}
                    aria-label={`New name for ${org.name}`}
                    autoFocus
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
                {leavingId === org.id ? (
                  <>
                    <span className="text-xs text-red-300 hidden sm:inline">
                      {org.member_count <= 1 ? 'You are the only member: nobody will be able to open it.' : 'Leave this organization?'}
                    </span>
                    <button onClick={() => leave(org)} aria-label={`Confirm leaving ${org.name}`} className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded">
                      Leave
                    </button>
                    <button onClick={() => setLeavingId(null)} aria-label="Cancel leaving" className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={() => setLeavingId(org.id)} aria-label={`Leave ${org.name}`} className="p-1.5 hover:bg-red-500/20 rounded text-red-400">
                    <LogOut size={16} />
                  </button>
                )}
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
          <button onClick={handleCreate} disabled={creating} className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg">
            Create
          </button>
        </div>
      </div>
    </div>
  )
}
