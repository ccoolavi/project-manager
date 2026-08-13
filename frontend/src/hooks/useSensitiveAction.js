import { useCallback, useState } from 'react'
import api from '../utils/api'

/**
 * Wraps a destructive API call so that when the server responds 428
 * (Precondition Required — see backend/utils/action_otp.py), the user is asked
 * to enter the code just emailed to them, and the original call is retried
 * automatically once they do. Calls that don't need this guard (server has no
 * email on file for the user) pass straight through, since the server itself
 * decides whether to challenge.
 */
export function useSensitiveAction() {
  const [pending, setPending] = useState(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const guard = useCallback(async (actionFn) => {
    try {
      return await actionFn()
    } catch (err) {
      if (err?.response?.status === 428) {
        setError('')
        try {
          await api.post('/api/auth/otp/email/request-action')
        } catch {
          // The prompt still opens; the user can retry sending from there if needed.
        }
        setPending(() => actionFn)
        return undefined
      }
      throw err
    }
  }, [])

  const confirm = async () => {
    if (!code.trim()) {
      setError('Enter the code we emailed you')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.post('/api/auth/otp/email/verify-action', { code: code.trim() })
      const retry = pending
      setPending(null)
      setCode('')
      await retry()
    } catch (err) {
      setError(err.response?.data?.detail || 'That code did not work')
    }
    setBusy(false)
  }

  const cancel = () => {
    setPending(null)
    setCode('')
    setError('')
  }

  return { guard, prompting: !!pending, code, setCode, error, busy, confirm, cancel }
}
