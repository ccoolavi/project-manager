import axios from 'axios'
import { getApiUrl } from '../config'

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

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      localStorage.removeItem('user')
      window.location.href = '/project-manager/#/login'
    }
    return Promise.reject(error)
  }
)

export default api
