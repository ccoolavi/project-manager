/**
 * Offline write queue.
 *
 * When a create/update/delete fails because the device is offline, it is parked
 * in IndexedDB and replayed once connectivity returns. Reads are not queued —
 * they either hit the network or fall back to the service worker cache.
 *
 * Each queued request carries a client-generated idempotency key so that a
 * replay which actually succeeded the first time cannot create a duplicate.
 */

const DB_NAME = 'kaizenpm-offline'
const STORE = 'queue'
const DB_VERSION = 1

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const result = fn(store)
    tx.oncomplete = () => {
      db.close()
      resolve(result?.result ?? result)
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

/** The signed-in person's id, so a parked change is only ever sent by the person who made it. */
function currentUserId() {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null')?.id ?? null
  } catch {
    return null
  }
}

export async function enqueue(entry) {
  return withStore('readwrite', (store) =>
    store.add({
      ...entry,
      userId: currentUserId(),
      idempotencyKey:
        entry.idempotencyKey ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      queuedAt: new Date().toISOString()
    })
  )
}

/**
 * What is waiting for the person signed in now. Changes parked by someone else on this device stay parked until that person
 * signs in again: replaying them under a different account would attribute them to the wrong person (or fail).
 * Entries from before owners were recorded have no userId and are treated as the current person's, as they always were.
 */
export async function listQueue() {
  const all = await withStore('readonly', (store) => store.getAll())
  const me = currentUserId()
  return all.filter((item) => item.userId == null || item.userId === me)
}

export async function removeFromQueue(id) {
  return withStore('readwrite', (store) => store.delete(id))
}

export async function queueLength() {
  const items = await listQueue().catch(() => [])
  return items.length
}

let flushing = false

/**
 * Replay everything queued. `send` performs one request and resolves on success.
 * A 4xx other than 408/429 is treated as permanently rejected and dropped,
 * because retrying it forever would wedge the queue behind a bad request.
 */
export async function flushQueue(send, onProgress) {
  if (flushing || !navigator.onLine) return { sent: 0, dropped: 0 }
  flushing = true
  let sent = 0
  let dropped = 0
  try {
    const items = await listQueue()
    for (const item of items) {
      try {
        await send(item)
        await removeFromQueue(item.id)
        sent++
      } catch (err) {
        const status = err?.response?.status
        if (status && status >= 400 && status < 500 && ![408, 429].includes(status)) {
          await removeFromQueue(item.id)
          dropped++
        } else {
          break // still offline or the server is unwell; try again later
        }
      }
      onProgress?.(await queueLength())
    }
  } finally {
    flushing = false
  }
  return { sent, dropped }
}

export function isOfflineError(error) {
  return !navigator.onLine || (!error?.response && error?.request)
}
