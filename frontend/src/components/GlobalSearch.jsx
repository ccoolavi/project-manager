import { useState, useEffect, useRef } from 'react'
import { Search, FileText, CheckSquare, Heart, Lightbulb, X } from 'lucide-react'
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
 *
 * On a wide screen the box sits in the top bar. On a phone there is no room for it there, so a search button opens it as
 * a full-width panel under the bar (it used to be hidden on phones, which left no way to search at all).
 */
export default function GlobalSearch() {
  const { currentOrg } = useOrg()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const desktopRef = useRef(null)
  const mobileRef = useRef(null)
  const latest = useRef(0) // only the newest request may update the list, however late an older one answers

  useEffect(() => {
    const onClickOutside = (e) => {
      const inside = [desktopRef.current, mobileRef.current].some((el) => el && el.contains(e.target))
      if (!inside) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2 || !currentOrg) {
      latest.current += 1
      setResults([])
      setFailed(false)
      setLoading(false)
      return
    }
    setLoading(true)
    const handle = setTimeout(async () => {
      const mine = ++latest.current
      try {
        const res = await api.get(`/api/orgs/${currentOrg.id}/search`, { params: { q } })
        if (mine !== latest.current) return
        setResults(res.data)
        setFailed(false)
        setOpen(true)
      } catch {
        if (mine !== latest.current) return
        setResults([])
        setFailed(true)
        setOpen(true)
      }
      if (mine === latest.current) setLoading(false)
    }, 300)
    return () => clearTimeout(handle)
  }, [query, currentOrg?.id])

  const close = () => {
    setOpen(false)
    setMobileOpen(false)
  }

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
    close()
    setQuery('')
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') close()
    if (e.key === 'Enter' && results.length > 0) select(results[0])
  }

  const box = (inline) => (
    <>
      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => (results.length > 0 || failed) && setOpen(true)}
        onKeyDown={onKeyDown}
        autoFocus={inline}
        placeholder="Search this organisation..."
        aria-label="Search"
        className="w-full pl-9 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm placeholder-slate-500 focus:outline-none focus:border-brand-500"
      />
      {open && (
        <div
          className={`${inline ? 'mt-2' : 'absolute top-full mt-1'} w-full bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50`}
        >
          {loading && <p className="px-3 py-2 text-xs text-slate-500">Searching...</p>}
          {!loading && failed && (
            <p className="px-3 py-2 text-xs text-amber-300">Search is not available right now. Please try again.</p>
          )}
          {!loading && !failed && results.length === 0 && query.trim().length >= 2 && (
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
    </>
  )

  return (
    <>
      <div ref={desktopRef} className="relative hidden md:block w-56 lg:w-72">
        {box(false)}
      </div>

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close search' : 'Open search'}
          aria-expanded={mobileOpen}
          className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
        >
          {mobileOpen ? <X size={20} /> : <Search size={20} />}
        </button>
        {mobileOpen && (
          <div
            ref={mobileRef}
            className="fixed inset-x-0 z-50 border-b border-slate-800 bg-slate-900 p-3"
            style={{ top: '3.5rem' }}
          >
            <div className="relative">{box(true)}</div>
          </div>
        )}
      </div>
    </>
  )
}
