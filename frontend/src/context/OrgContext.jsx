import React, { createContext, useState } from 'react'
import api from '../utils/api'

export const OrgContext = createContext(null)

export function OrgProvider({ children }) {
  const [currentOrg, setCurrentOrg] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(false)
  // Distinguishes "we have not asked the server yet" from "the server says you
  // have no organisations". Without it the dashboard cannot tell a returning
  // member from a brand-new user, and shows the first-run modal to everyone.
  const [initialized, setInitialized] = useState(false)

  /**
   * Ask the server for a token scoped to `orgId`, so that org_id, role and
   * permissions in the JWT describe the organisation actually on screen.
   */
  const scopeTokenToOrg = async (orgId) => {
    try {
      const res = await api.post(`/api/auth/refresh?org_id=${orgId}`)
      localStorage.setItem('access_token', res.data.access_token)
      localStorage.setItem('refresh_token', res.data.refresh_token)
    } catch (error) {
      // Non-fatal: the server re-checks permissions on every request anyway.
      console.error('Could not scope session to organisation:', error)
    }
  }

  const fetchOrgs = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/orgs')
      setOrgs(res.data)
      if (res.data.length > 0) {
        const saved = localStorage.getItem('current_org')
        const org = saved ? res.data.find(o => o.id === parseInt(saved)) || res.data[0] : res.data[0]
        setCurrentOrg(org)
        localStorage.setItem('current_org', org.id)
        await scopeTokenToOrg(org.id)
      } else {
        setCurrentOrg(null)
      }
    } catch (error) {
      console.error('Failed to fetch orgs:', error)
    }
    setLoading(false)
    setInitialized(true)
  }

  const switchOrg = async (orgId) => {
    const org = orgs.find(o => o.id === orgId)
    if (org) {
      setCurrentOrg(org)
      localStorage.setItem('current_org', orgId)
      await scopeTokenToOrg(orgId)
    }
  }

  const createOrg = async (name, description = '') => {
    const res = await api.post('/api/orgs', { name, description })
    setOrgs([...orgs, res.data])
    setCurrentOrg(res.data)
    localStorage.setItem('current_org', res.data.id)
    // The sign-up token carries no org claims; without this the new owner would
    // have an empty permission list until their next login.
    await scopeTokenToOrg(res.data.id)
    return res.data
  }

  return (
    <OrgContext.Provider value={{
      currentOrg, orgs, loading, initialized, fetchOrgs, switchOrg, createOrg
    }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = React.useContext(OrgContext)
  if (!ctx) throw new Error('useOrg must be inside OrgProvider')
  return ctx
}
