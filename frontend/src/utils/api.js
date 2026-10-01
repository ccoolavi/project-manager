import axios from 'axios'
import { getApiUrl, loadRuntimeConfig } from '../config'
import { enqueue, isOfflineError } from './offlineQueue'

const api = axios.create({
  headers: {
    'Content-Type': 'application/json'
  }
})

const WRITE_METHODS = ['post', 'put', 'patch', 'delete']

// Sign-in, registration, token refresh and one-time-code calls are never parked for later: they carry passwords and codes
// (which must not be written to the device's storage), and replaying a stale sign-in attempt makes no sense. They simply fail.
const isAuthCall = (url = '') => /(^|\/)api\/auth\//.test(String(url))

const newKey = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`

// Resolved per request rather than fixed at module load, so the runtime config
// in config.json wins even though this module is imported before it is fetched.
api.interceptors.request.use((config) => {
  config.baseURL = getApiUrl()
  return config
})

// Add JWT to requests. Every write also carries an Idempotency-Key: if the same request is sent twice (an automatic retry,
// or an offline replay of something that actually went through) the server answers the second one from its record of
// the first instead of creating a duplicate.
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    if (WRITE_METHODS.includes(config.method) && !config.headers['Idempotency-Key']) {
      config.headers['Idempotency-Key'] = newKey()
    }
    return config
  },
  (error) => Promise.reject(error)
)

let renewing = null // the one renewal in flight, shared by every request that gets a 401 at the same moment

/**
 * Access tokens last minutes; the refresh token lasts days. When a request is refused as expired, trade the refresh token
 * for new tokens once and retry, instead of throwing the person back to the sign-in page every half hour.
 * Resolves to the new access token; to null when the server REFUSED the renewal (the session really is over); or to
 * undefined when the server simply could not be reached (a blip must not sign anyone out).
 */
async function renewSession() {
  if (renewing) return renewing
  const refresh = localStorage.getItem('refresh_token')
  if (!refresh) return null
  renewing = axios
    .post(`${getApiUrl()}/api/auth/token/refresh`, { refresh_token: refresh }, { timeout: 15000 })
    .then((res) => {
      localStorage.setItem('access_token', res.data.access_token)
      localStorage.setItem('refresh_token', res.data.refresh_token)
      return res.data.access_token
    })
    .catch((err) => (err?.response ? null : undefined))
    .finally(() => {
      renewing = null
    })
  return renewing
}

/** Re-read config.json (the API address changes when the tunnel is replaced). Resolves to the address now in use. */
export async function refreshApiUrl() {
  return loadRuntimeConfig()
}

// Handle 401s, recover from a changed API address, and park writes that failed because the server cannot be reached.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // The server answers a request that carries no token at all with 403 "Not authenticated" (not 401): that happens when
    // another browser tab signed out. It means the same thing - the session is over.
    const noToken = error.response?.status === 403 && error.response?.data?.detail === 'Not authenticated'
    if (error.response?.status === 401 || noToken) {
      const original = error.config
      if (original && !isAuthCall(original.url) && !original._renewed) {
        original._renewed = true
        const token = await renewSession()
        if (token) {
          original.headers.Authorization = `Bearer ${token}`
          return api.request(original)
        }
        if (token === undefined) return Promise.reject(error) // could not ask: keep the session, report this request's failure
      }
      if (original && isAuthCall(original.url)) return Promise.reject(error) // a wrong password is not an ended session
      // Tell the app, so its own "signed in" state is cleared too. Wiping storage alone left people on a dashboard where
      // every action failed until they reloaded the page.
      window.dispatchEvent(new CustomEvent('kaizenpm:session-expired'))
      return Promise.reject(error)
    }
    const cfg = error.config

    // The request never got an answer. The API address may have just changed, so look it up again once and retry.
    if (cfg && !error.response && error.request && !cfg._addressRetried) {
      cfg._addressRetried = true
      const before = getApiUrl()
      const after = await refreshApiUrl().catch(() => before)
      if (after && after !== before) {
        cfg.baseURL = after
        return api.request(cfg)
      }
    }

    if (cfg && WRITE_METHODS.includes(cfg.method) && !isAuthCall(cfg.url) && isOfflineError(error) && !cfg._replayed) {
      try {
        await enqueue({
          method: cfg.method,
          url: cfg.url,
          data: cfg.data ? JSON.parse(cfg.data) : undefined,
          idempotencyKey: cfg.headers && cfg.headers['Idempotency-Key']
        })
        error.queued = true // tells the caller (and the toast layer) this write is safely parked, not lost
        window.dispatchEvent(new CustomEvent('kaizenpm:queued'))
      } catch {
        // IndexedDB unavailable (private mode, quota) — surface the original error.
      }
    }
    return Promise.reject(error)
  }
)

/** Replay one queued write. Used by the sync runner. */
export function replayQueued(item) {
  return api.request({
    method: item.method,
    url: item.url,
    data: item.data,
    headers: { 'Idempotency-Key': item.idempotencyKey },
    _replayed: true
  })
}

export default api
