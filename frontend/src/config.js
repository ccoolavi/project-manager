export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'KaizenPM'

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  MEMBER: 'member'
}

export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done']
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent']
export const PROJECT_STATUSES = ['active', 'in_progress', 'completed', 'archived']
