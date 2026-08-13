import { useState, useEffect } from 'react'
import { Send, Trash2 } from 'lucide-react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { useLocalization } from '../context/LocalizationContext'
import { hasRole } from '../utils/permissions'

/**
 * Comment thread for one task. Props identify the task through the full
 * org -> project -> section -> task chain the API requires.
 */
export default function TaskComments({ orgId, projectId, subProjectId, taskId }) {
  const { user } = useAuth()
  const { formatRelativeDay } = useLocalization()
  const [comments, setComments] = useState([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

  const base = `/api/orgs/${orgId}/projects/${projectId}/tasks/${subProjectId}/${taskId}/comments`
  const canModerate = hasRole('owner', 'admin')

  useEffect(() => {
    if (taskId) load()
  }, [taskId])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get(base)
      setComments(res.data)
    } catch {
      setError('Could not load comments.')
    }
    setLoading(false)
  }

  const post = async () => {
    const content = text.trim()
    if (!content) return
    setPosting(true)
    setError('')
    try {
      const res = await api.post(base, { content })
      setComments([...comments, res.data])
      setText('')
    } catch {
      setError('Could not post your comment. It will be saved and sent when you are back online.')
    }
    setPosting(false)
  }

  const remove = async (id) => {
    try {
      await api.delete(`${base}/${id}`)
      setComments(comments.filter((c) => c.id !== id))
    } catch {
      setError('Could not delete that comment.')
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-white">Comments</h4>

      {loading && <p className="text-xs text-slate-500">Loading...</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {comments.map((c) => (
          <div key={c.id} className="bg-slate-900 border border-slate-700 rounded-lg p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-300">
                  {c.user?.name || c.user?.email}
                  <span className="ml-2 text-slate-500">{formatRelativeDay(c.created_at)}</span>
                </p>
                <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{c.content}</p>
              </div>
              {(c.user_id === user?.id || canModerate) && (
                <button
                  onClick={() => remove(c.id)}
                  aria-label="Delete comment"
                  className="p-1 shrink-0 text-slate-500 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
        {!loading && comments.length === 0 && (
          <p className="text-xs text-slate-500">No comments yet.</p>
        )}
      </div>

      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              post()
            }
          }}
          rows={2}
          placeholder="Write a comment..."
          aria-label="Write a comment"
          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-brand-500 resize-none"
        />
        <button
          onClick={post}
          disabled={posting || !text.trim()}
          aria-label="Post comment"
          className="px-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white rounded-lg self-end py-2"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
