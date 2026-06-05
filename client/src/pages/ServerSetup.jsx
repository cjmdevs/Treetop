import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { WifiIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { testConnection, setServerUrl, getServerUrl, hasServerUrl, normalizeUrl } from '../config/serverConfig'

export default function ServerSetup() {
  const navigate       = useNavigate()
  const [params]       = useSearchParams()
  const lostConnection = params.get('error') === 'unreachable'

  const [url,     setUrl]     = useState(getServerUrl())
  const [status,  setStatus]  = useState(null)   // null | 'testing' | 'ok' | 'error'
  const [message, setMessage] = useState('')

  // If redirected here after losing a connection, pre-fill and show context
  useEffect(() => {
    if (lostConnection) {
      setStatus('error')
      setMessage(`Lost connection to server at ${getServerUrl()} — check that the server is still running and reachable on your network.`)
    }
  }, [lostConnection])

  const handleTest = async (e) => {
    e?.preventDefault()
    const trimmed = url.trim()
    if (!trimmed) return

    if (!normalizeUrl(trimmed)) {
      setStatus('error')
      setMessage('Invalid address — enter something like 192.168.1.50:3001 or http://192.168.1.50:3001')
      return
    }

    setStatus('testing')
    setMessage('')

    const result = await testConnection(trimmed)

    if (result.ok) {
      setStatus('ok')
      setMessage(`Connected to ${result.url}`)
      setServerUrl(result.url)
      // Brief pause so the user sees the success state, then go to login
      setTimeout(() => navigate('/login', { replace: true }), 900)
    } else {
      setStatus('error')
      setMessage(result.error)
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
        {/* Brand identity */}
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
            <WifiIcon className="w-5 h-5 text-accent flex-shrink-0" />
            <h2 className="text-gray-900 text-lg font-semibold">Connect to Server</h2>
          </div>
          <p className="text-gray-400 text-sm mb-6">
            {lostConnection
              ? 'The connection to your server was lost. Update the address if the server moved.'
              : 'Enter the address of your Treetop Management server.'}
          </p>

          <form onSubmit={handleTest} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Server Address
              </label>
              <input
                type="text"
                value={url}
                onChange={e => { setUrl(e.target.value); setStatus(null); setMessage('') }}
                placeholder="http://192.168.1.50:3001"
                autoFocus
                autoComplete="off"
                spellCheck={false}
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 font-mono placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent transition-shadow"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Include the port if not 80 — e.g.{' '}
                <button
                  type="button"
                  onClick={() => setUrl('http://localhost:3001')}
                  className="text-accent hover:text-accent-dark underline underline-offset-2"
                >
                  http://localhost:3001
                </button>
              </p>
            </div>

            {/* Status feedback */}
            {status === 'error' && (
              <div className="flex items-start gap-2.5 px-3.5 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{message}</span>
              </div>
            )}
            {status === 'ok' && (
              <div className="flex items-center gap-2.5 px-3.5 py-3 bg-accent-light border border-accent-light rounded-lg text-sm text-accent font-medium">
                <CheckCircleIcon className="w-4 h-4 flex-shrink-0" />
                <span>{message}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'testing' || status === 'ok'}
              className="w-full bg-accent hover:bg-accent-dark disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm py-2.5 rounded-lg transition-colors mt-2 flex items-center justify-center gap-2"
            >
              {status === 'testing' ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Testing connection…
                </>
              ) : status === 'ok' ? (
                <>
                  <CheckCircleIcon className="w-4 h-4" />
                  Connected — redirecting…
                </>
              ) : (
                'Test & Connect'
              )}
            </button>
          </form>
        </div>

        {/* Footer hint — show only if they've previously configured a server */}
        {hasServerUrl() && !lostConnection && (
          <p className="text-center text-gray-600 text-xs mt-6">
            Currently connected to{' '}
            <span className="text-gray-400 font-mono">{getServerUrl()}</span>
          </p>
        )}
        <p className="text-center text-gray-700 text-xs mt-3">
          Treetop Management · 2026
        </p>
      </div>
    </div>
  )
}
