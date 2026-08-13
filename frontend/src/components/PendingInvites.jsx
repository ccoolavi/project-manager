import { useState, useEffect } from 'react'
import { Mail, Check, X } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'

/**
 * Invitations waiting for the signed-in user.
 *
 * Someone can be invited before they have an account. When they sign up later,
 * nothing in the organisation-scoped screens can surface that invitation,
 * because they are not a member yet. This banner is how they find out.
 */
export default function PendingInvites() {
  const { fetchOrgs } = useOrg()
  const [invites, setInvites] = useState([])
  const [busy, setBusy] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      const res = await api.get('/api/invites/mine')
      setInvites(res.data)
    } catch {
      setInvites([])
    }
  }

  const respond = async (invite, action) => {
    setBusy(invite.id)
    setMessage('')
    try {
      const res = await api.post(`/api/invites/${invite.id}/${action}`)
      setMessage(res.data?.message || 'Done')
      await load()
      if (action === 'accept') await fetchOrgs()
    } catch (err) {
      setMessage(err?.response?.data?.detail || 'That did not work. Please try again.')
    }
    setBusy(null)
  }

  if (invites.length === 0 && !message) return null

  return (
    <div className="mb-6 space-y-2">
      {invites.map((inv) => (
        <div
          key={inv.id}
          className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between p-4 bg-brand-500/10 border border-brand-500/40 rounded-lg"
        >
          <div className="flex items-start gap-3">
            <Mail size={18} className="text-brand-400 mt-0.5 shrink-0" />
            <p className="text-sm text-slate-200">
              You have been invited to join{' '}
              <span className="font-semibold text-white">{inv.organization_name}</span>{' '}
              as <span className="capitalize">{inv.role}</span>.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => respond(inv, 'accept')}
              disabled={busy === inv.id}
              className="px-3 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm rounded-lg flex items-center gap-1"
            >
              <Check size={14} /> Join
            </button>
            <button
              onClick={() => respond(inv, 'decline')}
              disabled={busy === inv.id}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm rounded-lg flex items-center gap-1"
            >
              <X size={14} /> No thanks
            </button>
          </div>
        </div>
      ))}
      {message && <p className="text-sm text-emerald-400">{message}</p>}
    </div>
  )
}
