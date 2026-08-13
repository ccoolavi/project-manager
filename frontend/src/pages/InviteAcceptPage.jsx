import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * Landing point for an invitation link.
 *
 * Invitations are keyed to an email address rather than to a link token, so the
 * work happens on the dashboard, where PendingInvites shows every invitation
 * waiting for the signed-in account. This page only routes people there, sending
 * them via login first if they are not signed in yet.
 */
export default function InviteAcceptPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (loading) return
    navigate(user ? '/dashboard' : '/login', { replace: true })
  }, [user, loading, navigate])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white mb-2">You have an invitation</h1>
        <p className="text-slate-400">
          {loading
            ? 'One moment...'
            : user
              ? 'Taking you to your dashboard, where you can accept it.'
              : 'Sign in with the email address the invitation was sent to.'}
        </p>
      </div>
    </div>
  )
}
