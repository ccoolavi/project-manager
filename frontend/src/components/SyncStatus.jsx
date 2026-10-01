import { useEffect, useRef, useState } from 'react'
import { CloudOff, RefreshCw, Check } from 'lucide-react'
import { flushQueue, queueLength } from '../utils/offlineQueue'
import { replayQueued, refreshApiUrl } from '../utils/api'

/**
 * A small, plain-language indicator: whether the device is offline, how many
 * changes are waiting, and when they have gone through. Deliberately says
 * "saved on this device" rather than exposing queues or retries.
 */
export default function SyncStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [pending, setPending] = useState(0)
  const pendingRef = useRef(0)
  const [syncing, setSyncing] = useState(false)
  const [justSynced, setJustSynced] = useState(false)

  const refresh = async () => {
    const n = await queueLength().catch(() => 0)
    pendingRef.current = n
    setPending(n)
  }

  const sync = async () => {
    if (!navigator.onLine) return
    setSyncing(true)
    await refreshApiUrl().catch(() => {}) // the API address may have changed while the changes were waiting
    const { sent, dropped } = await flushQueue(replayQueued, setPending)
    setSyncing(false)
    await refresh()
    if (dropped > 0) {
      // The server refused these (no longer allowed, or the item is gone). Say so instead of letting them vanish.
      window.dispatchEvent(
        new CustomEvent('kaizenpm:toast', {
          detail: {
            type: 'error',
            message: `${dropped} change${dropped === 1 ? '' : 's'} saved on this device could not be applied (you may no longer have access, or the item was removed).`
          }
        })
      )
    }
    if (sent > 0) {
      setJustSynced(true)
      setTimeout(() => setJustSynced(false), 4000)
      // Let open screens pull the server's version of the truth.
      window.dispatchEvent(new CustomEvent('kaizenpm:synced'))
    }
  }

  useEffect(() => {
    refresh()
    const goOnline = () => { setOnline(true); sync() }
    const goOffline = () => setOnline(false)
    const onQueued = () => refresh()

    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener('kaizenpm:queued', onQueued)
    if (navigator.onLine) sync()
    // Changes waiting while the device IS online mean the server could not be reached (for example its address just
    // changed). Keep trying quietly instead of waiting for a page reload.
    const retry = setInterval(() => {
      if (navigator.onLine && pendingRef.current > 0) sync()
    }, 15000)

    return () => {
      clearInterval(retry)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('kaizenpm:queued', onQueued)
    }
  }, [])

  if (online && pending === 0 && !justSynced) return null

  let tone = 'bg-amber-500/15 border-amber-500/40 text-amber-200'
  let icon = <CloudOff size={14} />
  let text = 'Offline — your changes are saved on this device'

  if (justSynced && pending === 0) {
    tone = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
    icon = <Check size={14} />
    text = 'All changes saved'
  } else if (syncing) {
    tone = 'bg-brand-500/15 border-brand-500/40 text-brand-200'
    icon = <RefreshCw size={14} className="animate-spin" />
    text = 'Saving your changes...'
  } else if (pending > 0) {
    text = online
      ? `${pending} change${pending === 1 ? '' : 's'} waiting to save`
      : `Offline — ${pending} change${pending === 1 ? '' : 's'} saved on this device`
  }

  return (
    <div
      role="status"
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${tone}`}
    >
      {icon}
      <span>{text}</span>
    </div>
  )
}
