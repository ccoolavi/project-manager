import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import { useLocalization } from '../context/LocalizationContext'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import KanbanBoard from '../components/KanbanBoard'
import ProjectList from '../components/ProjectList'
import HabitTracker from '../components/HabitTracker'
import TimeLogger from '../components/TimeLogger'
import KaizenLog from '../components/KaizenLog'
import MemberManager from '../components/MemberManager'
import Ikigai from '../components/Ikigai'
import WorkloadView from '../components/WorkloadView'
import PendingInvites from '../components/PendingInvites'
import ActivityLog from '../components/ActivityLog'
import api from '../utils/api'

// Tab ids are lowercase slugs; these are the words the user should actually see.
const TAB_TITLES = {
  tasks: 'Tasks',
  projects: 'Projects',
  habits: 'Habits',
  time: 'Time',
  kaizen: 'Kaizen',
  ikigai: 'Purpose',
  workload: 'Workload',
  settings: 'Settings'
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { currentOrg, createOrg, initialized } = useOrg()
  const { formatDate } = useLocalization()
  const [activeTab, setActiveTab] = useState('tasks')
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [selectedSubProjectId, setSelectedSubProjectId] = useState(null)
  const [showCreateOrgModal, setShowCreateOrgModal] = useState(false)
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Only offer the first-run modal once the org list has actually loaded.
    // Keying this off `!currentOrg` alone left returning members permanently
    // stuck on "create your first organisation" after every page reload.
    setShowCreateOrgModal(initialized && !currentOrg)
  }, [currentOrg, initialized])

  useEffect(() => {
    // GlobalSearch lives in Navbar, outside this component's tree, and this
    // app uses tab state rather than routes for the workspace screens — a
    // window event is the simplest way for a search result to jump the
    // dashboard to the right tab and project/section.
    const onNavigate = (e) => {
      const { tab, projectId, subProjectId } = e.detail || {}
      if (tab) setActiveTab(tab)
      if (projectId != null) setSelectedProjectId(projectId)
      if (subProjectId != null) setSelectedSubProjectId(subProjectId)
    }
    window.addEventListener('kaizenpm:navigate', onNavigate)
    return () => window.removeEventListener('kaizenpm:navigate', onNavigate)
  }, [])

  const handleCreateOrg = async () => {
    if (!orgName.trim()) return
    setLoading(true)
    try {
      await createOrg(orgName)
      setOrgName('')
      setShowCreateOrgModal(false)
    } catch (err) {
      console.error('Failed to create org:', err)
      alert('Failed to create organization')
    }
    setLoading(false)
  }

  const handleSelectProject = (projectId, subProjectId) => {
    setSelectedProjectId(projectId)
    setSelectedSubProjectId(subProjectId)
  }

  if (showCreateOrgModal) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full mx-4">
          <h2 className="text-2xl font-bold text-white mb-2">Welcome, {user?.name}!</h2>
          <p className="text-slate-400 mb-6">Create your first organization to get started</p>

          <input
            type="text"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization name..."
            className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white mb-4"
          />

          <button
            onClick={handleCreateOrg}
            disabled={loading}
            className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Organization'}
          </button>
        </div>
      </div>
    )
  }

  if (!currentOrg) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">Loading your workspace...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      <div className="flex">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-28 lg:pb-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">{TAB_TITLES[activeTab] || activeTab}</h1>
                <p className="text-slate-400 mt-1">Org: <span className="text-brand-400">{currentOrg?.name}</span></p>
              </div>
            </div>

            <PendingInvites />

            {/* Tasks Tab */}
            {activeTab === 'tasks' && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 min-w-0">
                <div className="lg:col-span-1">
                  <ProjectList
                    selectedProjectId={selectedProjectId}
                    selectedSubProjectId={selectedSubProjectId}
                    onSelectProject={handleSelectProject}
                  />
                </div>
                <div className="lg:col-span-3 min-w-0">
                  <KanbanBoard
                    projectId={selectedProjectId}
                    subProjectId={selectedSubProjectId}
                  />
                </div>
              </div>
            )}

            {/* Projects Tab */}
            {activeTab === 'projects' && (
              <ProjectList
                selectedProjectId={selectedProjectId}
                selectedSubProjectId={selectedSubProjectId}
                onSelectProject={handleSelectProject}
              />
            )}

            {/* Habits Tab */}
            {activeTab === 'habits' && (
              <HabitTracker />
            )}

            {/* Time Tab */}
            {activeTab === 'time' && (
              <TimeLogger />
            )}

            {/* Kaizen Tab */}
            {activeTab === 'kaizen' && (
              <KaizenLog />
            )}

            {/* Ikigai / Purpose Tab */}
            {activeTab === 'ikigai' && (
              <Ikigai />
            )}

            {/* Workload Tab */}
            {activeTab === 'workload' && (
              <WorkloadView />
            )}

            {/* Settings Tab */}
            {activeTab === 'settings' && (
              <div className="space-y-6">
                <MemberManager />

                <ActivityLog />

                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h2 className="text-xl font-bold text-white mb-4">Organization Settings</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Organization</label>
                      <p className="text-white">{currentOrg?.name}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Member Since</label>
                      <p className="text-white">{formatDate(currentOrg?.created_at || new Date())}</p>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                  <h2 className="text-xl font-bold text-white mb-4">Account</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                      <p className="text-white">{user?.email}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Name</label>
                      <p className="text-white">{user?.name}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
