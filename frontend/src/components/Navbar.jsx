import { useAuth } from '../context/AuthContext'
import SyncStatus from './SyncStatus'
import GlobalSearch from './GlobalSearch'
import { useOrg } from '../context/OrgContext'
import { LogOut } from 'lucide-react'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { currentOrg, orgs, switchOrg } = useOrg()

  return (
    <nav className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex justify-between items-center gap-3">
      {/* min-w-0 lets the org selector shrink instead of pushing the row wider
          than the screen, which was forcing sideways scrolling on phones. */}
      <div className="flex items-center gap-3 sm:gap-8 min-w-0">
        <h2 className="text-lg sm:text-xl font-bold text-white shrink-0">KaizenPM</h2>
        <select
          value={currentOrg?.id || ''}
          onChange={(e) => switchOrg(parseInt(e.target.value))}
          aria-label="Organisation"
          className="min-w-0 max-w-[10rem] sm:max-w-none truncate px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-800 border border-slate-700 text-white text-sm rounded cursor-pointer"
        >
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
      </div>

      <GlobalSearch />

      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <SyncStatus />
        {/* The name is a nicety, not information the user needs on a phone. */}
        <span className="hidden md:inline text-slate-300 truncate max-w-[12rem]">
          {user?.name}
        </span>
        <button
          onClick={logout}
          className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
          aria-label="Log out"
          title="Log out"
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  )
}
