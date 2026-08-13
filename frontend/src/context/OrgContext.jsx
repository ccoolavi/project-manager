import React, { createContext, useState } from 'react'
import api from '../utils/api'

export const OrgContext = createContext(null)

export function OrgProvider({ children }) {
  const [currentOrg, setCurrentOrg] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(false)

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
      }
    } catch (error) {
      console.error('Failed to fetch orgs:', error)
    }
    setLoading(false)
  }

  const switchOrg = (orgId) => {
    const org = orgs.find(o => o.id === orgId)
    if (org) {
      setCurrentOrg(org)
      localStorage.setItem('current_org', orgId)
    }
  }

  const createOrg = async (name, description = '') => {
    const res = await api.post('/api/orgs', { name, description })
    setOrgs([...orgs, res.data])
    setCurrentOrg(res.data)
    localStorage.setItem('current_org', res.data.id)
    return res.data
  }

  return (
    <OrgContext.Provider value={{
      currentOrg, orgs, loading, fetchOrgs, switchOrg, createOrg
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
