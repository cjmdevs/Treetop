import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { TicketIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { authApi } from '../api/auth'

const inp = 'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow'
const lbl = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5'

export default function Register() {
  const navigate = useNavigate()

  const [key,      setKey]      = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return }

    setLoading(true)
    try {
      const { token: jwt } = await authApi.redeem({
        key:      key.trim(),
        password,
      })

      // Log them straight in
      localStorage.setItem('treetop_auth_token', jwt)
      setDone(true)
      setTimeout(() => navigate('/dashboard', { replace: true }), 1000)
    } catch (err) {
      setError(err.message || 'Registration failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gray-950 px-4"
      style={{
        backgroundImage:
          'radial-gradient(ellipse at 20% 50%, rgba(31,122,77,0.15) 0%, transparent 60%), ' +
          'radial-gradient(ellipse at 80% 20%, rgba(31,122,77,0.08) 0%, transparent 50%)',
      }}
    >
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-accent mb-4 shadow-lg shadow-accent/30">
            <span className="text-white font-bold text-xl tracking-tight select-none">T</span>
          </div>
          <h1 className="text-white text-2xl font-bold tracking-tight">Treetop Management</h1>
          <p className="text-gray-500 text-sm mt-1">Practice Management</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/40 p-8">
          <div className="flex items-center gap-2 mb-1">
            <TicketIcon className="w-5 h-5 text-accent flex-shrink-0" />
            <h2 className="text-gray-900 text-lg font-semibold">Create Account</h2>
          </div>
          <p className="text-gray-400 text-sm mb-6">
            Enter the invite key your admin provided and set your password.
            Your username and role are already assigned.
          </p>

          {error && (
            <div className="mb-4 flex items-start gap-2.5 px-3.5 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {done && (
            <div className="mb-4 flex items-center gap-2.5 px-3.5 py-3 bg-accent-light rounded-lg text-sm text-accent font-medium">
              <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
              Account created — signing you in…
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={lbl}>Invite Key</label>
              <input
                type="text"
                value={key}
                onChange={e => { setKey(e.target.value); setError('') }}
                placeholder="Paste your invite key"
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className={inp + ' font-mono text-xs'}
              />
            </div>

            <div>
              <label className={lbl}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                required placeholder="Min. 8 characters" autoComplete="new-password" className={inp} />
            </div>

            <div>
              <label className={lbl}>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                required placeholder="••••••••" autoComplete="new-password" className={inp} />
            </div>

            <button
              type="submit"
              disabled={loading || done}
              className="w-full bg-accent hover:bg-accent-dark disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-colors mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Creating account…</>
              ) : done ? (
                <><CheckCircleIcon className="w-4 h-4" />Done</>
              ) : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-gray-600 text-xs mt-6">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:text-accent-dark underline underline-offset-2">
            Sign in
          </Link>
        </p>
        <p className="text-center text-gray-700 text-xs mt-2">
          Treetop Management · 2026
        </p>
      </div>
    </div>
  )
}
