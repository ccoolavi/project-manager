import { useAuth } from '../context/AuthContext'
import SyncStatus from './SyncStatus'
import { useOrg } from '../context/OrgContext'
import { LogOut } from 'lucide-react'

export default function Navbar() {
  const { user, logout } = useAuth()
  const { currentOrg, orgs, switchOrg } = useOrg()

  return (
    <nav className="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center">
      <div className="flex items-center gap-8">
        <h2 className="text-xl font-bold text-white">KaizenPM</h2>
        <select
          value={currentOrg?.id || ''}
          onChange={(e) => switchOrg(parseInt(e.target.value))}
          className="px-3 py-2 bg-slate-800 border border-slate-700 text-white rounded cursor-pointer"
        >
          {orgs.map(org => (
            <option key={org.id} value={org.id}>{org.name}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-4">
        <SyncStatus />
        <span className="text-slate-300">{user?.name}</span>
        <button
          onClick={logout}
          className="p-2 hover:bg-slate-800 rounded text-slate-400 hover:text-white"
          title="Logout"
        >
          <LogOut size={20} />
        </button>
      </div>
    </nav>
  )
}
