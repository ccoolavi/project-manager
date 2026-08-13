import { CheckSquare, Folder, Heart, Clock, Lightbulb, Compass, Settings } from 'lucide-react'

const tabs = [
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'projects', label: 'Projects', icon: Folder },
  { id: 'habits', label: 'Habits', icon: Heart },
  { id: 'time', label: 'Time', icon: Clock },
  { id: 'kaizen', label: 'Kaizen', icon: Lightbulb },
  { id: 'ikigai', label: 'Purpose', icon: Compass },
  { id: 'settings', label: 'Settings', icon: Settings }
]

export default function Sidebar({ activeTab, setActiveTab }) {
  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 p-4">
      <nav className="space-y-2">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                isActive
                  ? 'bg-brand-500 text-white'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </nav>
    </aside>
  )
}
