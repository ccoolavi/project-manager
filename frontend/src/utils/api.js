import axios from 'axios'
import { getApiUrl } from '../config'
import { enqueue, isOfflineError } from './offlineQueue'

const api = axios.create({
  headers: {
    'Content-Type': 'application/json'
  }
})

// Resolved per request rather than fixed at module load, so the runtime config
// in config.json wins even though this module is imported before it is fetched.
api.interceptors.request.use((config) => {
  config.baseURL = getApiUrl()
  return config
})

// Add JWT to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

const WRITE_METHODS = ['post', 'put', 'patch', 'delete']

// Handle 401s, and park writes that failed because the device is offline.
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')
      window.location.href = '/project-manager/#/login'
      return Promise.reject(error)
    }

    const cfg = error.config
    if (cfg && WRITE_METHODS.includes(cfg.method) && isOfflineError(error) && !cfg._replayed) {
      try {
        await enqueue({
          method: cfg.method,
          url: cfg.url,
          data: cfg.data ? JSON.parse(cfg.data) : undefined
        })
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
