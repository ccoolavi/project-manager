import React, { createContext, useState, useEffect } from 'react'
import api from '../utils/api'
import { getDeviceId } from '../utils/deviceId'

export const AuthContext = createContext(null)

function storeSession(data) {
  const { access_token, refresh_token, user: userData } = data
  localStorage.setItem('access_token', access_token)
  localStorage.setItem('refresh_token', refresh_token)
  localStorage.setItem('user', JSON.stringify(userData))
  return userData
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const userData = localStorage.getItem('user')
    if (token && userData) {
      setUser(JSON.parse(userData))
    }
    setLoading(false)
  }, [])

  /**
   * Logs in with an email address. When the device has not signed
   * into this account before, the server holds the login and asks for an
   * emailed code instead of returning tokens — in that case this resolves to
   * `{ otpRequired: true, message }` rather than a user object, and the
   * caller should show an OTP step and call `verifyLoginOtp`.
   */
  const login = async (identifier, password) => {
    const res = await api.post('/api/auth/login', {
      identifier,
      password,
      device_id: getDeviceId()
    })
    if (res.data.otp_required) {
      return { otpRequired: true, message: res.data.message }
    }
    const userData = storeSession(res.data)
    setUser(userData)
    return userData
  }

  /** Completes a login that `login()` held for a new-device email challenge. */
  const verifyLoginOtp = async (identifier, code) => {
    const res = await api.post('/api/auth/otp/email/verify-login', {
      identifier,
      code,
      device_id: getDeviceId()
    })
    const userData = storeSession(res.data)
    setUser(userData)
    return userData
  }

  const register = async (name, email, password, confirm_password) => {
    const res = await api.post('/api/auth/register', {
      name, email, password, confirm_password,
      device_id: getDeviceId()
    })
    const userData = storeSession(res.data)
    setUser(userData)
    return userData
  }

  // The API layer raises this when the session cannot be renewed (refresh token expired or refused, or signed out elsewhere).
  useEffect(() => {
    const onExpired = () => {
      if (typeof caches !== 'undefined') caches.delete('api-cache').catch(() => {})
      ;['access_token', 'refresh_token', 'user', 'current_org'].forEach((k) => localStorage.removeItem(k))
      setUser(null)
      window.dispatchEvent(
        new CustomEvent('kaizenpm:toast', { detail: { type: 'info', message: 'Your session ended. Please sign in again.' } })
      )
    }
    window.addEventListener('kaizenpm:session-expired', onExpired)
    return () => window.removeEventListener('kaizenpm:session-expired', onExpired)
  }, [])

  const logout = () => {
    // The service worker keeps recent API answers for offline use. They belong to whoever was signed in, so they must not
    // outlive the session: the next person to use this device would otherwise be offered them while offline.
    if (typeof caches !== 'undefined') caches.delete('api-cache').catch(() => {})
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('user')
    localStorage.removeItem('current_org')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyLoginOtp, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
