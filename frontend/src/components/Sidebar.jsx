import { CheckSquare, Folder, Heart, Clock, Lightbulb, Compass, Users, BarChart3, GanttChartSquare, Settings } from 'lucide-react'

const tabs = [
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'projects', label: 'Projects', icon: Folder },
  { id: 'timeline', label: 'Timeline', icon: GanttChartSquare },
  { id: 'habits', label: 'Habits', icon: Heart },
  { id: 'time', label: 'Time', icon: Clock },
  { id: 'kaizen', label: 'Kaizen', icon: Lightbulb },
  { id: 'ikigai', label: 'Purpose', icon: Compass },
  { id: 'workload', label: 'Workload', icon: Users },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings }
]

/**
 * Navigation adapts to the screen rather than being squeezed onto it.
 *
 * On a phone a fixed 256px rail left roughly 140px for content on a 390px
 * screen, which made the app unusable. Below `lg` the rail is replaced by a
 * bottom bar: it costs no horizontal space and sits where a thumb can reach.
 */
export default function Sidebar({ activeTab, setActiveTab }) {
  return (
    <>
      {/* Desktop: vertical rail */}
      <aside className="hidden lg:block w-64 shrink-0 bg-slate-900 border-r border-slate-800 p-4">
        <nav className="space-y-2">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                  isActive ? 'bg-brand-500 text-white' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <Icon size={20} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Mobile: bottom bar. Scrolls horizontally so all seven fit without
          shrinking the tap targets below a comfortable size. */}
      <nav
        aria-label="Main"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-900/95 backdrop-blur border-t border-slate-800 overflow-x-auto"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 px-4 py-2 min-w-[4.5rem] transition ${
                  isActive ? 'text-brand-400' : 'text-slate-400'
                }`}
              >
                <Icon size={20} />
                <span className="text-[11px] leading-none">{tab.label}</span>
                <span
                  className={`h-0.5 w-6 rounded-full ${isActive ? 'bg-brand-400' : 'bg-transparent'}`}
                />
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
