import { Outlet, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import Sidebar from './Sidebar'
import { useAuth } from '../context/AuthContext'
import {
  MagnifyingGlassIcon,
  XMarkIcon,
  ArrowRightStartOnRectangleIcon,
} from '@heroicons/react/24/outline'
import { searchApi } from '../api/search'

const TYPE_LABELS = { engagement: 'Engagement', note: 'Note', invoice: 'Invoice', staff: 'Staff' }

function SearchBar() {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen]       = useState(false)
  const debounceRef           = useRef(null)
  const wrapRef               = useRef(null)
  const navigate              = useNavigate()

  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (query.length < 2) { setResults([]); setOpen(false); return }
    debounceRef.current = setTimeout(() => {
      searchApi.query(query).then(r => { setResults(r); setOpen(r.length > 0) })
    }, 300)
  }, [query])

  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const grouped = results.reduce((acc, r) => {
    acc[r.type] = acc[r.type] || []
    acc[r.type].push(r)
    return acc
  }, {})

  const navigate_ = (r) => {
    setQuery('')
    setOpen(false)
    if (r.type === 'engagement') navigate(`/engagements/${r.id}`)
    else if (r.type === 'invoice') navigate(`/invoices/${r.id}`)
    else if (r.type === 'staff') navigate(`/staff/${encodeURIComponent(r.title)}`)
    else navigate('/notes')
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 w-64">
        <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="Search..."
          className="bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none w-full"
        />
        {query && (
          <button onClick={() => { setQuery(''); setOpen(false) }}>
            <XMarkIcon className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-96 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
          {Object.entries(grouped).map(([type, rows]) => (
            <div key={type}>
              <div className="px-4 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-gray-50 border-b border-gray-100">
                {TYPE_LABELS[type] || type}
              </div>
              {rows.map(r => (
                <button
                  key={`${type}-${r.id}`}
                  onClick={() => navigate_(r)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{r.title}</p>
                  {r.subtitle && <p className="text-xs text-gray-400 truncate">{r.subtitle}</p>}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Keyboard shortcuts: N = new engagement, T = time tracking
  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return
      if (e.key === 'n' || e.key === 'N') navigate('/engagements/new')
      if (e.key === 't' || e.key === 'T') navigate('/time-tracking')
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [navigate])

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
          <SearchBar />

          <div className="flex items-center gap-3">
            {/* User info + logout */}
            {user && (
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800 leading-tight">{user.full_name}</p>
                  <p className="text-xs text-gray-400 capitalize leading-tight">{user.role}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0 select-none">
                  {user.full_name?.charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={logout}
                  title="Sign out"
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
