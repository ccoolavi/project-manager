import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import KanbanBoard from './components/KanbanBoard';
import HabitTracker from './components/HabitTracker';
import KaizenLog from './components/KaizenLog';
import TimeManagement from './components/TimeManagement';
import Organizations from './components/Organizations';
import SubProjects from './components/SubProjects';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import {
  pb,
  checkBackendHealth,
  isAuthenticated,
  getCurrentUser,
  logoutUser,
} from './services/pocketbase';
import { Database, Server, Building2 } from 'lucide-react';

// ── Auth Context ───────────────────────────────────────────────
const AuthContext = createContext(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check existing auth on mount
    if (isAuthenticated()) {
      setUser(getCurrentUser());
      setToken(pb.authStore.token);
    }
    setLoading(false);

    // Listen for auth store changes (e.g. from other tabs)
    const unsubscribe = pb.authStore.onChange((newToken, model) => {
      setToken(newToken);
      setUser(model);
    });
    return unsubscribe;
  }, []);

  const login = useCallback(async (email, password) => {
    const authData = await pb.collection('users').authWithPassword(email, password);
    setUser(authData.record || authData.model);
    setToken(pb.authStore.token);
    return authData;
  }, []);

  const register = useCallback(async (data) => {
    const record = await pb.collection('users').create(data);
    const authData = await pb.collection('users').authWithPassword(data.email, data.password);
    setUser(authData.record || authData.model);
    setToken(pb.authStore.token);
    return record;
  }, []);

  const logout = useCallback(() => {
    logoutUser();
    setUser(null);
    setToken(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Protected Route ────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center space-x-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// ── Dashboard (Authenticated Main App) ─────────────────────────
function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState('kanban');
  const [pbConnected, setPbConnected] = useState(false);

  // Hierarchy States
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [projects, setProjects] = useState([]);
  const [subProjects, setSubProjects] = useState([]);

  // Core Data States
  const [tasks, setTasks] = useState([]);
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);

  // Load data from PocketBase after auth
  useEffect(() => {
    let cancelled = false;

    async function loadAllData() {
      const isOnline = await checkBackendHealth();
      if (cancelled) return;
      setPbConnected(isOnline);

      if (!isOnline) return;

      try {
        const [orgsRes, projRes, subRes, tasksRes] = await Promise.all([
          pb.collection('organizations').getFullList({ requestKey: null }),
          pb.collection('projects').getFullList({ requestKey: null }),
          pb.collection('sub_projects').getFullList({ requestKey: null }),
          pb.collection('tasks').getFullList({ requestKey: null }),
        ]);

        if (cancelled) return;

        if (orgsRes.length > 0) {
          setOrganizations(orgsRes);
          setSelectedOrgId((prev) => prev || orgsRes[0].id);
        }
        if (projRes.length > 0) setProjects(projRes);
        if (subRes.length > 0) setSubProjects(subRes);
        if (tasksRes.length > 0) setTasks(tasksRes);

        // Fetch optional collections (habits, logs, time_entries)
        const [h, l, timeData] = await Promise.all([
          pb.collection('habits').getFullList({ requestKey: null }).catch(() => []),
          pb.collection('kaizen_logs').getFullList({ requestKey: null }).catch(() => []),
          pb.collection('time_entries').getFullList({ requestKey: null }).catch(() => []),
        ]);

        if (cancelled) return;
        setHabits(h || []);
        setLogs(l || []);
        setTimeEntries(timeData || []);
      } catch (e) {
        if (cancelled) return;
        if (e?.status === 401) {
          // Token expired – logout and redirect to login
          logout();
          navigate('/login', { replace: true });
          return;
        }
        console.warn('Failed to fetch data from PocketBase:', e);
      }
    }

    loadAllData();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSetTasks = useCallback((updated) => setTasks(updated), []);
  const handleSetHabits = useCallback((updated) => setHabits(updated), []);
  const handleSetLogs = useCallback((updated) => setLogs(updated), []);
  const handleSetTimeEntries = useCallback((updated) => setTimeEntries(updated), []);

  const activeOrg = organizations.find((o) => o.id === selectedOrgId) || organizations[0];

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login', { replace: true });
  }, [logout, navigate]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-brand-500 selection:text-white">
      {/* Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
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
              <span
                className={`w-2 h-2 rounded-full ${
                  pbConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span className="text-slate-300 font-medium">
                Backend:{' '}
                <strong className={pbConnected ? 'text-emerald-400' : 'text-amber-400'}>
                  {pbConnected ? 'PocketBase Active' : 'Offline'}
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
    </div>
  );
}

// ── Root App (Router + Auth Provider) ──────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
