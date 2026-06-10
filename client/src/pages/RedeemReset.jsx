import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { passwordResetKeysApi } from '../api/passwordResetKeys'

export default function RedeemReset() {
  const [key, setKey]           = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const navigate                = useNavigate()

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setSaving(true)
    try {
      await passwordResetKeysApi.redeem({ key: key.trim(), newPassword: password })
      setSuccess(true)
    } catch (err) {
      setError(err.message || 'Failed to reset password.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

  if (success) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 w-full max-w-md text-center">
        <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Password updated</h1>
        <p className="text-sm text-gray-500 mb-6">Your password has been reset. Sign in with your new password.</p>
        <button onClick={() => navigate('/login')}
          className="px-6 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark transition-colors">
          Go to login
        </button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-lg p-8 w-full max-w-md">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Reset your password</h1>
        <p className="text-sm text-gray-500 mb-6">Enter the reset key your admin gave you, then choose a new password.</p>
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reset Key</label>
            <input required value={key} onChange={e => setKey(e.target.value)}
              className={inputCls} placeholder="Paste your reset key here" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input required type="password" value={password} onChange={e => setPassword(e.target.value)}
              className={inputCls} placeholder="Min 8 characters" minLength={8} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
            <input required type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              className={inputCls} placeholder="Repeat your new password" />
          </div>
          <button type="submit" disabled={saving}
            className="w-full py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-dark disabled:opacity-60 transition-colors">
            {saving ? 'Resetting…' : 'Reset Password'}
          </button>
        </form>
        <p className="text-xs text-gray-400 text-center mt-4">
          <button onClick={() => navigate('/login')} className="hover:underline">Back to login</button>
        </p>
      </div>
    </div>
  )
}
