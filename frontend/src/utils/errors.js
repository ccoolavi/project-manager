/**
 * One place that turns "something failed" into a sentence a person can act on.
 *
 * It never returns an object. The server reports validation problems as a LIST of objects (FastAPI/pydantic), and rendering
 * that list in React throws, which used to blank the whole app (for example when an email was mistyped on the sign-up page).
 */
const FIELD_LABELS = {
  email: 'Email',
  password: 'Password',
  confirm_password: 'Confirm password',
  name: 'Name',
  title: 'Title',
  identifier: 'Email',
  code: 'Code',
  phone: 'Phone number',
  duration_minutes: 'Minutes',
  story_points: 'Story points',
  due_date: 'Due date',
  start_date: 'Start date'
}

const label = (field) =>
  FIELD_LABELS[field] || (field ? field.charAt(0).toUpperCase() + field.slice(1).replace(/_/g, ' ') : '')

/** True when the request never got an answer (server unreachable, offline, tunnel down). */
export function isNetworkError(err) {
  return (
    !err?.response &&
    (err?.code === 'ERR_NETWORK' || !!err?.request || (typeof navigator !== 'undefined' && !navigator.onLine))
  )
}

const clip = (s, n = 180) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

export function errorMessage(err, fallback = 'Something went wrong. Please try again.') {
  if (!err) return fallback
  if (typeof err === 'string') return clip(err)
  const res = err.response
  if (!res) {
    return isNetworkError(err)
      ? "Can't reach the server right now. Check your connection and try again."
      : fallback
  }
  const detail = res.data && res.data.detail
  if (typeof detail === 'string' && detail.trim()) return clip(detail.trim())
  if (Array.isArray(detail) && detail.length) {
    const parts = detail
      .map((d) => {
        if (typeof d === 'string') return d
        const field = Array.isArray(d?.loc)
          ? [...d.loc].reverse().find((x) => typeof x === 'string' && !['body', 'query', 'path'].includes(x))
          : ''
        const msg = String(d?.msg || d?.message || '').replace(/^Value error,\s*/i, '')
        return field ? `${label(field)}: ${msg}` : msg
      })
      .filter(Boolean)
    if (parts.length) return clip([...new Set(parts)].slice(0, 3).join(' · '))
  }
  if (detail && typeof detail === 'object') {
    const m = detail.message || detail.msg || detail.error
    if (typeof m === 'string' && m.trim()) return clip(m.trim())
  }
  switch (res.status) {
    case 401:
      return 'Your session has ended. Please sign in again.'
    case 403:
      return "You don't have permission to do that."
    case 404:
      return 'That item no longer exists. Refresh the page and try again.'
    case 408:
    case 504:
      return 'The server took too long to answer. Please try again.'
    case 413:
      return 'That is too large to send.'
    case 428:
      return 'Please confirm with the code we emailed you, then try again.'
    case 429:
      return 'Too many attempts. Please wait a minute and try again.'
    default:
      return res.status >= 500 ? 'The server had a problem. Please try again in a moment.' : fallback
  }
}
