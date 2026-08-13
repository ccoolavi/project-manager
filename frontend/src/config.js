/**
 * The API base URL is resolved at *runtime* from `config.json`, which sits next
 * to the bundle on GitHub Pages, rather than being frozen into the JavaScript at
 * build time.
 *
 * The server is reached through a Cloudflare tunnel whose hostname changes when
 * the tunnel is rotated. Baking that hostname into the bundle meant every
 * rotation required a full rebuild and redeploy, and until that finished the
 * deployed app simply had no backend. Now a rotation only has to rewrite one
 * small JSON file.
 *
 * The build-time VITE_API_URL remains the fallback for local development and for
 * the case where config.json cannot be fetched.
 */

const BUILD_TIME_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8090'

let resolvedApiUrl = BUILD_TIME_API_URL

export function getApiUrl() {
  return resolvedApiUrl
}

export async function loadRuntimeConfig() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}config.json`, {
      cache: 'no-store'
    })
    if (res.ok) {
      const cfg = await res.json()
      if (cfg.apiUrl) {
        resolvedApiUrl = cfg.apiUrl.replace(/\/$/, '')
      }
    }
  } catch {
    // Offline or the file is missing — fall back to the build-time value so the
    // app still starts and the service worker can serve cached data.
  }
  return resolvedApiUrl
}

export const API_URL = BUILD_TIME_API_URL
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'KaizenPM'

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  MEMBER: 'member'
}

export const ROLE_LABELS = {
  owner: 'Owner — full control, including deleting the organisation',
  admin: 'Admin — manage people, projects and tasks',
  editor: 'Editor — create and edit projects and tasks',
  member: 'Member — view projects and add tasks',
  viewer: 'Viewer — read only'
}

export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done']
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent']
export const PROJECT_STATUSES = ['active', 'in_progress', 'completed', 'archived']
