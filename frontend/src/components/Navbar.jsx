import React from 'react';
import { 
  CheckCircle2 as LayoutKanban, 
  CheckSquare, 
  TrendingUp, 
  Clock, 
  Building2,
  Layers,
  Zap,
  LogOut,
  User as UserIcon,
  Heart
} from 'lucide-react';

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  user, 
  onLogout,
  organizations = [], 
  selectedOrgId, 
  setSelectedOrgId 
}) {
  const navItems = [
    { id: 'kanban', label: 'Kanban Board', icon: LayoutKanban },
    { id: 'sub_projects', label: 'Sub-Projects', icon: Layers },
    { id: 'organizations', label: 'Organizations', icon: Building2 },
    { id: 'habits', label: 'Habit Tracker', icon: CheckSquare },
    { id: 'kaizen', label: 'Kaizen Log', icon: TrendingUp },
    { id: 'time', label: 'Time Dashboard', icon: Clock },
    { id: 'ikigai', label: 'Ikigai', icon: Heart },
  ];

  const displayName = user?.name || user?.email || user?.username || 'User';

  return (
    <header className="sticky top-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          
          {/* Logo & Branding */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 p-0.5 shadow-glow flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Zap className="w-5 h-5 text-brand-400 fill-brand-400/20" />
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-white tracking-tight">KaizenPM</h1>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
                  v2.0 Multi-Org
                </span>
              </div>
              <p className="text-xs text-slate-400">PocketBase + Autonomous Agent</p>
            </div>
          </div>

          {/* Organization Switcher Dropdown */}
          <div className="flex items-center space-x-2 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5">
            <Building2 className="w-4 h-4 text-brand-400" />
            <select
              value={selectedOrgId || ''}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="bg-transparent text-xs font-semibold text-white focus:outline-none cursor-pointer max-w-[140px] sm:max-w-[180px] truncate"
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.id} className="bg-slate-900 text-slate-200">
                  {org.name}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Links */}
          <nav className="hidden lg:flex items-center space-x-1 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800/80">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                    isActive
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* User & Logout */}
          <div className="flex items-center space-x-3">
            <div className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-xs text-slate-300">
              <UserIcon className="w-3.5 h-3.5 text-brand-400" />
              <span className="max-w-[100px] truncate">{displayName}</span>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-slate-700/50 hover:border-rose-500/30 transition-all"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>

        {/* Mobile / Small Screen Navigation Bar */}
        <div className="lg:hidden flex items-center justify-around py-2 border-t border-slate-800 overflow-x-auto space-x-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center py-1 px-2.5 rounded-lg text-[10px] font-medium whitespace-nowrap ${
                  isActive ? 'text-brand-400 font-bold' : 'text-slate-400'
                }`}
              >
                <Icon className="w-4 h-4 mb-0.5" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
}
