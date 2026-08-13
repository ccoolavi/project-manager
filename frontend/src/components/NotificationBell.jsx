import { useState, useEffect, useRef, useCallback } from 'react'
import { Bell, CheckSquare, MessageSquare, UserPlus } from 'lucide-react'
import api from '../utils/api'
import { useLocalization } from '../context/LocalizationContext'

const POLL_INTERVAL_MS = 30000

const ICONS = {
  task_assigned: CheckSquare,
  comment_added: MessageSquare,
  invite_received: UserPlus
}

export default function NotificationBell() {
  const { formatRelativeDay } = useLocalization()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/notifications')
      setNotifications(res.data)
    } catch {
      // A missed poll isn't worth surfacing to the user; the next one retries.
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const markRead = async (id) => {
    setNotifications((current) => current.filter((n) => n.id !== id))
    try {
      await api.post(`/api/notifications/${id}/read`)
    } catch {
      load() // out of sync with the server — resync rather than leave a stale list
    }
  }

  const markAllRead = async () => {
    const previous = notifications
    setNotifications([])
    try {
      await api.post('/api/notifications/read-all')
    } catch {
      setNotifications(previous)
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications${notifications.length ? `, ${notifications.length} unread` : ''}`}
        className="relative p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
      >
        <Bell size={20} />
        {notifications.length > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[1rem] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 max-w-[90vw] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
            <span className="text-sm font-semibold text-white">Notifications</span>
            {notifications.length > 0 && (
              <button onClick={markAllRead} className="text-xs text-brand-400 hover:text-brand-300">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-slate-500">You're all caught up.</p>
            )}
            {notifications.map((n) => {
              const Icon = ICONS[n.type] || Bell
              return (
                <button
                  key={n.id}
                  onClick={() => markRead(n.id)}
                  className="w-full flex items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-800 border-b border-slate-800 last:border-0"
                >
                  <Icon size={16} className="text-brand-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{n.title}</p>
                    <p className="text-xs text-slate-400 truncate">{n.message}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">{formatRelativeDay(n.created_at)}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
