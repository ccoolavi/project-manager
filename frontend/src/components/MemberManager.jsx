import { useState, useEffect } from 'react'
import { UserPlus, Trash2, Shield } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS } from '../config'
import { hasRole } from '../utils/permissions'

const INVITABLE_ROLES = ['admin', 'editor', 'member', 'viewer']

export default function MemberManager() {
  const { currentOrg } = useOrg()
  const { user } = useAuth()
  const [members, setMembers] = useState([])
  const [invites, setInvites] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const canManage = hasRole('owner', 'admin')

  useEffect(() => {
    if (currentOrg) load()
  }, [currentOrg?.id])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/members`)
      setMembers(res.data)
    } catch {
      setError('Could not load the people in this organisation.')
    }
    try {
      const res = await api.get(`/api/orgs/${currentOrg.id}/invites`)
      setInvites(res.data)
    } catch {
      // Invite listing is admin-only; a normal member simply sees no pending list.
      setInvites([])
    }
    setLoading(false)
  }

  const invite = async () => {
    const trimmed = email.trim()
    if (!trimmed) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address.')
      return
    }
    setError('')
    setNotice('')
    try {
      const res = await api.post(`/api/orgs/${currentOrg.id}/members`, {
        email: trimmed,
        role
      })
      setNotice(res.data?.message || `Invitation sent to ${trimmed}.`)
      setEmail('')
      await load()
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? 'Only owners and admins can add people.'
          : err?.response?.data?.detail || 'Could not send the invitation.'
      )
    }
  }

  const remove = async (memberId, name) => {
    setError('')
    setNotice('')
    try {
      await api.delete(`/api/orgs/${currentOrg.id}/members/${memberId}`)
      setNotice(`${name} was removed from ${currentOrg.name}.`)
      await load()
    } catch (err) {
      setError(
        err?.response?.status === 403
          ? 'Only owners and admins can remove people.'
          : 'Could not remove that person.'
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-1">
          <Shield size={18} className="text-brand-400" />
          <h2 className="text-xl font-bold text-white">People</h2>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          Everyone who can see {currentOrg?.name}.
        </p>

        {error && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/40 rounded-lg text-sm text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 px-3 py-2 bg-emerald-500/10 border border-emerald-500/40 rounded-lg text-sm text-emerald-300">
            {notice}
          </div>
        )}

        {loading && <p className="text-sm text-slate-400">Loading...</p>}

        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-lg"
            >
              <div>
                <p className="text-white font-medium">
                  {m.user?.name || m.user?.email || `User ${m.user_id}`}
                  {m.user?.email === user?.email && (
                    <span className="ml-2 text-xs text-slate-500">(you)</span>
                  )}
                </p>
                <p className="text-xs text-slate-400">{m.user?.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 text-xs rounded bg-brand-500/20 text-brand-300 capitalize">
                  {m.role}
                </span>
                {canManage && m.role !== 'owner' && m.user?.email !== user?.email && (
                  <button
                    onClick={() => remove(m.id, m.user?.name || m.user?.email)}
                    aria-label={`Remove ${m.user?.email}`}
                    className="p-1 hover:bg-red-500/20 rounded text-red-400"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {!loading && members.length === 0 && (
            <p className="text-sm text-slate-400">No one else here yet.</p>
          )}
        </div>
      </div>

      {canManage && (
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-1">
            <UserPlus size={18} className="text-brand-400" />
            <h2 className="text-xl font-bold text-white">Add someone</h2>
          </div>
          <p className="text-sm text-slate-400 mb-4">
            They will join {currentOrg?.name} straight away if they already have an
            account; otherwise their invitation waits until they sign up.
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && invite()}
              placeholder="their@email.com"
              aria-label="Email address to invite"
              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Role"
              className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white capitalize focus:outline-none focus:border-brand-500"
            >
              {INVITABLE_ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <button
              onClick={invite}
              className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg"
            >
              Invite
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">{ROLE_LABELS[role]}</p>

          {invites.filter((i) => i.status === 'pending').length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-white mb-2">Waiting to join</h3>
              <div className="space-y-1">
                {invites
                  .filter((i) => i.status === 'pending')
                  .map((i) => (
                    <div
                      key={i.id}
                      className="flex justify-between items-center text-sm px-3 py-2 bg-slate-900 border border-slate-700 rounded"
                    >
                      <span className="text-slate-300">{i.email}</span>
                      <span className="text-xs text-slate-500 capitalize">{i.role}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
