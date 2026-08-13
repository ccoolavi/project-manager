import { useAuth } from '../context/AuthContext'
import { useOrg } from '../context/OrgContext'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import { useState } from 'react'

export default function DashboardPage() {
  const { user } = useAuth()
  const { currentOrg } = useOrg()
  const [activeTab, setActiveTab] = useState('tasks')

  if (!currentOrg) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-white mb-4">No organization selected</p>
          <button className="px-6 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg">
            Create Organization
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Navbar />
      <div className="flex">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
        <main className="flex-1 p-8">
          <h1 className="text-3xl font-bold text-white mb-8">Welcome, {user?.name}</h1>
          <div className="text-slate-400">
            <p>Organization: {currentOrg?.name}</p>
            <p className="mt-4">Tab: {activeTab}</p>
          </div>
        </main>
      </div>
    </div>
  )
}
