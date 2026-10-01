import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { errorMessage } from '../utils/errors'

/**
 * Small, plain-language notifications ("toasts"). Every action that can fail reports its failure here, so a button never
 * silently does nothing. Anything outside React (the API layer, the offline queue) can raise one with a window event:
 *   window.dispatchEvent(new CustomEvent('kaizenpm:toast', { detail: { type: 'error', message: '...' } }))
 */
const ToastContext = createContext(null)
const MAX_TOASTS = 4
const DURATION = { success: 4500, info: 5000, error: 9000 }
let nextId = 1

const STYLES = {
  success: { box: 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100', Icon: CheckCircle2, icon: 'text-emerald-400' },
  info: { box: 'border-sky-500/40 bg-slate-900/95 text-slate-100', Icon: Info, icon: 'text-sky-400' },
  error: { box: 'border-red-500/50 bg-red-950/90 text-red-100', Icon: AlertTriangle, icon: 'text-red-400' }
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    setToasts((cur) => cur.filter((t) => t.id !== id))
  }, [])

  const notify = useCallback(
    (message, type = 'info') => {
      if (!message || typeof message !== 'string') return
      const kind = STYLES[type] ? type : 'info'
      setToasts((cur) => {
        const same = cur.find((t) => t.message === message && t.type === kind)
        if (same) {
          clearTimeout(timers.current.get(same.id)) // an identical message just refreshes its timer, it does not stack
          timers.current.set(same.id, setTimeout(() => dismiss(same.id), DURATION[kind]))
          return cur
        }
        const id = nextId++
        timers.current.set(id, setTimeout(() => dismiss(id), DURATION[kind]))
        return [...cur, { id, message, type: kind }].slice(-MAX_TOASTS)
      })
    },
    [dismiss]
  )

  const api = useMemo(
    () => ({
      notify,
      success: (m) => notify(m, 'success'),
      info: (m) => notify(m, 'info'),
      error: (m) => notify(m, 'error'),
      // Report a failed request. A write that was parked on this device already got its own "saved on this device"
      // notice from the queue event, so it is not reported a second time as a failure.
      fromError: (err, fallback) => {
        if (err?.queued) return
        notify(errorMessage(err, fallback), 'error')
      },
      dismiss
    }),
    [notify, dismiss]
  )

  useEffect(() => {
    const onToast = (e) => notify(e.detail?.message, e.detail?.type || 'info')
    const onQueued = () => notify('Saved on this device. It will be sent as soon as the connection is back.', 'info')
    const onSynced = () => notify('Your offline changes have been saved.', 'success')
    window.addEventListener('kaizenpm:toast', onToast)
    window.addEventListener('kaizenpm:queued', onQueued)
    window.addEventListener('kaizenpm:synced', onSynced)
    const live = timers.current
    return () => {
      window.removeEventListener('kaizenpm:toast', onToast)
      window.removeEventListener('kaizenpm:queued', onQueued)
      window.removeEventListener('kaizenpm:synced', onSynced)
      live.forEach((t) => clearTimeout(t))
      live.clear()
    }
  }, [notify])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-label="Notifications"
        role="region"
        className="pointer-events-none fixed right-3 top-16 z-[70] flex w-[min(92vw,22rem)] flex-col gap-2"
      >
        {toasts.map((t) => {
          const { box, Icon, icon } = STYLES[t.type]
          return (
            <div
              key={t.id}
              role={t.type === 'error' ? 'alert' : 'status'}
              data-toast={t.type}
              className={`pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-xl ${box}`}
            >
              <Icon size={16} className={`mt-0.5 shrink-0 ${icon}`} aria-hidden="true" />
              <p className="min-w-0 flex-1 break-words">{t.message}</p>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

const NOOP = {
  notify() {},
  success() {},
  info() {},
  error() {},
  fromError() {},
  dismiss() {}
}

/** Safe outside a provider (e.g. in isolated component tests): it simply does nothing. */
export function useToast() {
  return useContext(ToastContext) || NOOP
}
