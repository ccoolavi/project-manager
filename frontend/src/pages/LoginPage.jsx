import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { validate, loginSchema } from '../utils/validation'

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  // Set once the server holds the login for a new-device email challenge.
  const [awaitingOtp, setAwaitingOtp] = useState(false)
  const { login, verifyLoginOtp } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const validation = validate(loginSchema, { identifier, password })
    if (!validation.success) {
      setError(validation.error)
      return
    }

    setLoading(true)
    try {
      const result = await login(identifier, password)
      if (result?.otpRequired) {
        setAwaitingOtp(true)
        setInfo(result.message || 'We emailed you a code to confirm this device.')
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    setError('')
    if (!code.trim()) {
      setError('Enter the code we emailed you')
      return
    }
    setLoading(true)
    try {
      await verifyLoginOtp(identifier, code.trim())
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'That code did not work')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <h1 className="text-3xl font-bold text-white mb-2 text-center">KaizenPM</h1>
          <p className="text-slate-400 text-center mb-8">Project & Habit Management</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-6">
              {error}
            </div>
          )}

          {!awaitingOtp ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email or phone</label>
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                  placeholder="your@email.com or phone number"
                  autoComplete="username"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Logging in...' : 'Log In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4">
              {info && (
                <div className="bg-brand-500/10 border border-brand-500/30 text-brand-300 px-4 py-3 rounded-lg text-sm">
                  {info}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Enter the 6-digit code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 tracking-widest text-center text-lg"
                  placeholder="000000"
                  autoFocus
                  maxLength={6}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white font-semibold rounded-lg transition disabled:opacity-50"
              >
                {loading ? 'Verifying...' : 'Verify and continue'}
              </button>
              <button
                type="button"
                onClick={() => { setAwaitingOtp(false); setCode(''); setError('') }}
                className="w-full text-sm text-slate-400 hover:text-white"
              >
                Use a different account
              </button>
            </form>
          )}

          <p className="text-center text-slate-400 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
