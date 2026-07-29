import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import KanbanBoard from './components/KanbanBoard';
import HabitTracker from './components/HabitTracker';
import KaizenLog from './components/KaizenLog';
import TimeManagement from './components/TimeManagement';
import OtpVerification from './components/OtpVerification';
import Organizations from './components/Organizations';
import SubProjects from './components/SubProjects';
import { 
  TaskService, 
  HabitService, 
  KaizenService, 
  TimeService, 
  UserService,
  checkBackendHealth,
  pb
} from './services/pocketbase';
import { Database, Server, Building2 } from 'lucide-react';

const DEFAULT_ORGS = [
  { id: 'org_main', name: 'Kaizen Main Org', description: 'Primary engineering organization', owner: 'u_admin' },
  { id: 'org_devops', name: 'DevOps & Cloud', description: 'Infrastructure and automation projects', owner: 'u_admin' }
];

const DEFAULT_PROJECTS = [
  { id: 'proj_1', name: 'Project Manager Core', description: 'Main project management application', organization: 'org_main', status: 'active' },
  { id: 'proj_2', name: 'WhatsApp Service', description: 'OTP verification gateway', organization: 'org_devops', status: 'active' }
];

const DEFAULT_SUB_PROJECTS = [
  { id: 'sp_1', name: 'Frontend React SPA', description: 'Vite & Tailwind UI components', project: 'proj_1', status: 'active' },
  { id: 'sp_2', name: 'PocketBase Migration Schema', description: 'DB collections & hierarchy rules', project: 'proj_1', status: 'active' },
  { id: 'sp_3', name: 'Baileys Client', description: 'Node.js Baileys integration', project: 'proj_2', status: 'active' }
];

const DEFAULT_TASKS_HIERARCHICAL = [
  { id: 't_1', title: 'Implement Organization Switcher in Navbar', sub_project: 'sp_1', priority: 'high', status: 'done', due_date: '2026-07-29', description: 'Dropdown filter for org context' },
  { id: 't_2', title: 'Create 1700000001_organizations_schema.js', sub_project: 'sp_2', priority: 'urgent', status: 'done', due_date: '2026-07-29', description: 'PocketBase JS migration' },
  { id: 't_3', title: 'CLI command: create-org and list-orgs', sub_project: 'sp_1', priority: 'high', status: 'in_progress', due_date: '2026-07-30', description: 'Python CLI pm-cli integration' }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('kanban');
  const [isOtpOpen, setIsOtpOpen] = useState(false);
  const [pbConnected, setPbConnected] = useState(false);

  // Hierarchy States
  const [organizations, setOrganizations] = useState(DEFAULT_ORGS);
  const [selectedOrgId, setSelectedOrgId] = useState('org_main');
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [subProjects, setSubProjects] = useState(DEFAULT_SUB_PROJECTS);

  // Core Data States
  const [tasks, setTasks] = useState(DEFAULT_TASKS_HIERARCHICAL);
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [user, setUser] = useState(UserService.getUser());

  // Load initial data from PocketBase or fallback
  useEffect(() => {
    async function loadAllData() {
      const isOnline = await checkBackendHealth();
      setPbConnected(isOnline);

      if (isOnline) {
        try {
          const orgsRes = await pb.collection('organizations').getFullList();
          if (orgsRes.length > 0) {
            setOrganizations(orgsRes);
            setSelectedOrgId(orgsRes[0].id);
          }

          const projRes = await pb.collection('projects').getFullList();
          if (projRes.length > 0) setProjects(projRes);

          const subRes = await pb.collection('sub_projects').getFullList();
          if (subRes.length > 0) setSubProjects(subRes);

          const tasksRes = await pb.collection('tasks').getFullList();
          if (tasksRes.length > 0) setTasks(tasksRes);
        } catch (e) {
          console.warn('PB fetch error, falling back to local state:', e);
        }
      }

      const [h, l, timeData] = await Promise.all([
        HabitService.getAll(),
        KaizenService.getAll(),
        TimeService.getAll()
      ]);

      setHabits(h);
      setLogs(l);
      setTimeEntries(timeData);
    }
    loadAllData();
  }, []);

  const handleSetTasks = (updated) => {
    setTasks(updated);
  };

  const handleSetHabits = (updated) => {
    setHabits(updated);
    HabitService.saveAll(updated);
  };

  const handleSetLogs = (updated) => {
    setLogs(updated);
    KaizenService.saveAll(updated);
  };

  const handleSetTimeEntries = (updated) => {
    setTimeEntries(updated);
    TimeService.saveAll(updated);
  };

  const activeOrg = organizations.find(o => o.id === selectedOrgId) || organizations[0];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-brand-500 selection:text-white">
      {/* Navigation Bar with Org Switcher */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onOpenOtpModal={() => setIsOtpOpen(true)}
        organizations={organizations}
        selectedOrgId={selectedOrgId}
        setSelectedOrgId={setSelectedOrgId}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* Connection & Active Org Status Banner */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-slate-900/40 border border-slate-800/80 px-4 py-2.5 rounded-xl">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${pbConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span className="text-slate-300 font-medium">
                Backend: <strong className={pbConnected ? 'text-emerald-400' : 'text-amber-400'}>
                  {pbConnected ? 'PocketBase Active' : 'Offline / Standalone'}
                </strong>
              </span>
            </div>

            {activeOrg && (
              <div className="hidden sm:flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-brand-500/10 border border-brand-500/20 text-brand-300">
                <Building2 className="w-3 h-3 text-brand-400" />
                <span>Org: {activeOrg.name}</span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-4 text-slate-400">
            <span className="flex items-center space-x-1">
              <Server className="w-3.5 h-3.5 text-slate-500" />
              <span>Port 8090</span>
            </span>
            <span className="flex items-center space-x-1">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              <span>pb_data</span>
            </span>
          </div>
        </div>

        {/* Tab Views */}
        {activeTab === 'kanban' && (
          <KanbanBoard 
            tasks={tasks} 
            setTasks={handleSetTasks} 
            subProjects={subProjects}
            projects={projects}
            selectedOrgId={selectedOrgId}
            user={user}
          />
        )}

        {activeTab === 'sub_projects' && (
          <SubProjects 
            subProjects={subProjects}
            setSubProjects={setSubProjects}
            projects={projects}
            selectedOrgId={selectedOrgId}
            user={user}
          />
        )}

        {activeTab === 'organizations' && (
          <Organizations
            organizations={organizations}
            setOrganizations={setOrganizations}
            selectedOrgId={selectedOrgId}
            setSelectedOrgId={setSelectedOrgId}
            user={user}
          />
        )}

        {activeTab === 'habits' && (
          <HabitTracker habits={habits} setHabits={handleSetHabits} />
        )}

        {activeTab === 'kaizen' && (
          <KaizenLog logs={logs} setLogs={handleSetLogs} />
        )}

        {activeTab === 'time' && (
          <TimeManagement timeEntries={timeEntries} setTimeEntries={handleSetTimeEntries} />
        )}

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>&copy; 2026 KaizenPM. Multi-Organization & Hierarchy Management.</p>
          <div className="flex items-center space-x-3 text-slate-400">
            <span>React + Vite</span>
            <span>&bull;</span>
            <span>TailwindCSS</span>
            <span>&bull;</span>
            <span>PocketBase</span>
          </div>
        </div>
      </footer>

      {/* WhatsApp OTP Verification Modal */}
      <OtpVerification
        isOpen={isOtpOpen}
        onClose={() => setIsOtpOpen(false)}
        user={user}
        setUser={setUser}
      />
    </div>
  );
}
