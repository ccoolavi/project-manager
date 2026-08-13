import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { OrgProvider, useOrg } from './context/OrgContext'
import { LocalizationProvider } from './context/LocalizationContext'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardPage from './pages/DashboardPage'
import InviteAcceptPage from './pages/InviteAcceptPage'
import { useEffect } from 'react'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  return user ? children : <Navigate to="/login" />
}

function AppRoutes() {
  const { user, loading } = useAuth()
  const { fetchOrgs } = useOrg()

  useEffect(() => {
    if (user && !loading) {
      fetchOrgs()
    }
  }, [user, loading])

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/dashboard" />} />
      <Route path="/register" element={!user ? <RegisterPage /> : <Navigate to="/dashboard" />} />
      <Route path="/invite/:token" element={<InviteAcceptPage />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" />} />
    </Routes>
  )
}

export default function App() {
  return (
    <Router>
      <LocalizationProvider>
        <AuthProvider>
          <OrgProvider>
            <AppRoutes />
          </OrgProvider>
        </AuthProvider>
      </LocalizationProvider>
    </Router>
  )
}
