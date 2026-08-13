import { useState, useEffect, useRef } from 'react'
import { Search, FileText, CheckSquare, Heart, Lightbulb } from 'lucide-react'
import api from '../utils/api'
import { useOrg } from '../context/OrgContext'

const ICONS = {
  project: FileText,
  task: CheckSquare,
  habit: Heart,
  kaizen: Lightbulb
}

const TAB_FOR_TYPE = {
  project: 'projects',
  task: 'tasks',
  habit: 'habits',
  kaizen: 'kaizen'
}

/**
 * Debounced search across the current organisation. Selecting a result
 * switches the dashboard tab (and, for tasks, the selected project/section)
 * via a window event, since Navbar and DashboardPage do not share a common
 * router — this app uses tab state, not routes, for the workspace screens.
 */
export default function GlobalSearch() {
  const { currentOrg } = useOrg()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const boxRef = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || !currentOrg) {
      setResults([])
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      try {
        const res = await api.get(`/api/orgs/${currentOrg.id}/search`, { params: { q } })
        setResults(res.data)
        setOpen(true)
      } catch {
        setResults([])
      }
      setLoading(false)
    }, 300)
    return () => clearTimeout(handle)
  }, [query, currentOrg?.id])

  const select = (result) => {
    window.dispatchEvent(
      new CustomEvent('kaizenpm:navigate', {
        detail: {
          tab: TAB_FOR_TYPE[result.type],
          projectId: result.project_id,
          subProjectId: result.sub_project_id
        }
      })
    )
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={boxRef} className="relative hidden md:block w-56 lg:w-72">
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="Search this organisation..."
        aria-label="Search"
        className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-brand-500"
      />

      {open && (
        <div className="absolute top-full mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50">
          {loading && <p className="px-3 py-2 text-xs text-slate-500">Searching...</p>}
          {!loading && results.length === 0 && query.trim().length >= 2 && (
            <p className="px-3 py-2 text-xs text-slate-500">No matches for "{query.trim()}".</p>
          )}
          {results.map((r) => {
            const Icon = ICONS[r.type] || FileText
            return (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => select(r)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800 text-sm"
              >
                <Icon size={14} className="text-brand-400 shrink-0" />
                <span className="text-white truncate flex-1">{r.title}</span>
                <span className="text-xs text-slate-500 shrink-0">{r.subtitle}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
