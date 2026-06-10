import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StopIcon, ChevronUpIcon, ChevronDownIcon, PlusIcon, PauseIcon, PlayIcon } from '@heroicons/react/24/solid'
import { useTimer } from '../context/TimerContext'
import { engagementsApi } from '../api/engagements'

function NewTimerModal({ onStart, onClose }) {
  const [engagements, setEngagements] = useState([])
  const [engId, setEngId]             = useState('')

  useEffect(() => { engagementsApi.list().then(setEngagements).catch(() => {}) }, [])

  const selCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

  const handleStart = () => {
    const eng = engagements.find(e => e.id === parseInt(engId))
    if (!eng) return
    onStart(eng.id, `${eng.client_name} — ${eng.engagement_type}`)
    onClose()
  }

  return (
    <div className="px-4 pb-3 pt-2 border-t border-gray-100 bg-gray-50">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">New Timer</p>
      <select value={engId} onChange={e => setEngId(e.target.value)} className={selCls}>
        <option value="">Select engagement...</option>
        {engagements.map(e => (
          <option key={e.id} value={e.id}>{e.client_name} — {e.engagement_type}</option>
        ))}
      </select>
      <div className="flex gap-2 mt-2">
        <button onClick={onClose} className="flex-1 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100">Cancel</button>
        <button
          disabled={!engId}
          onClick={handleStart}
          className="flex-1 py-1.5 text-xs font-semibold text-white bg-accent rounded-lg hover:bg-accent-dark disabled:opacity-50"
        >
          Start Timer
        </button>
      </div>
    </div>
  )
}

export default function TimerPanel() {
  const { timers, startTimer, pauseTimer, stopTimer, getTimerElapsed, fmt } = useTimer()
  const [collapsed, setCollapsed] = useState(false)
  const [showNew, setShowNew]     = useState(false)
  const navigate                  = useNavigate()

  const runningCount = timers.filter(t => t.status === 'running').length

  if (timers.length === 0 && !showNew) return (
    <button
      onClick={() => setShowNew(true)}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-1.5 bg-accent text-white text-xs font-semibold px-3 py-2 rounded-full shadow-lg hover:bg-accent-dark transition-colors"
    >
      <PlusIcon className="w-3 h-3" />
      Start Timer
    </button>
  )

  const handleStop = timer => {
    const hours = stopTimer(timer.engagementId)
    navigate('/time-tracking', {
      state: { prefill: { engagementId: timer.engagementId, engagementLabel: timer.engagementLabel, hours } },
    })
  }

  const handleToggle = timer => {
    if (timer.status === 'running') {
      pauseTimer(timer.engagementId)
    } else {
      startTimer(timer.engagementId, timer.engagementLabel)
    }
  }

  return (
    <div
      className="fixed bottom-6 right-6 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
      style={{ minWidth: 296 }}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-900 text-white hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          {runningCount > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
            </span>
          )}
          <span className="text-sm font-semibold tracking-tight">
            {timers.length > 0
              ? `${timers.length} Timer${timers.length > 1 ? 's' : ''} · ${runningCount} Running`
              : 'New Timer'}
          </span>
        </div>
        {collapsed
          ? <ChevronUpIcon className="w-4 h-4 text-gray-400" />
          : <ChevronDownIcon className="w-4 h-4 text-gray-400" />}
      </button>

      {/* Timer rows */}
      {!collapsed && (
        <>
          <div className="divide-y divide-gray-100">
            {timers.map(timer => (
              <div key={timer.engagementId} className={`flex items-center gap-3 px-4 py-3 ${timer.status === 'paused' ? 'bg-gray-50' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className="text-sm font-medium text-gray-900 truncate leading-tight">
                      {timer.engagementLabel}
                    </p>
                    {timer.status === 'paused' && (
                      <span className="text-[10px] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded-full flex-shrink-0">Paused</span>
                    )}
                  </div>
                  <p className={`font-mono text-sm font-bold tracking-widest ${timer.status === 'running' ? 'text-accent' : 'text-gray-400'}`}>
                    {fmt(getTimerElapsed(timer.engagementId))}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => handleToggle(timer)}
                    title={timer.status === 'running' ? 'Pause' : 'Resume'}
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                  >
                    {timer.status === 'running'
                      ? <PauseIcon className="w-3.5 h-3.5" />
                      : <PlayIcon className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleStop(timer)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    <StopIcon className="w-3 h-3" />
                    Log
                  </button>
                </div>
              </div>
            ))}
          </div>
          {/* New timer toggle */}
          {showNew ? (
            <NewTimerModal onStart={startTimer} onClose={() => setShowNew(false)} />
          ) : (
            <div className="px-4 pb-3 pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowNew(true)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-accent border border-accent/30 rounded-lg hover:bg-accent/5 transition-colors"
              >
                <PlusIcon className="w-3 h-3" />
                New Timer
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
