import { createContext, useContext, useEffect, useRef, useState } from 'react'

const TimerContext = createContext(null)

export function TimerProvider({ children }) {
  // timers: [{ engagementId, engagementLabel, startedAt }]
  const [timers, setTimers] = useState(() => {
    try {
      // Migrate old single-timer format → array
      const legacy = localStorage.getItem('mgr_timer')
      if (legacy) {
        const old = JSON.parse(legacy)
        localStorage.removeItem('mgr_timer')
        if (old) {
          const arr = [old]
          localStorage.setItem('mgr_timers', JSON.stringify(arr))
          return arr
        }
      }
      return JSON.parse(localStorage.getItem('mgr_timers') || '[]')
    } catch {
      return []
    }
  })

  // tick forces re-renders every second so elapsed values are live
  const [tick, setTick] = useState(0)
  const intervalRef = useRef(null)

  useEffect(() => {
    if (timers.length > 0) {
      intervalRef.current = setInterval(() => setTick(t => t + 1), 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [timers.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = newTimers => {
    localStorage.setItem('mgr_timers', JSON.stringify(newTimers))
    setTimers(newTimers)
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  const startTimer = (engagementId, engagementLabel) => {
    if (timers.find(t => t.engagementId === engagementId)) return // already running
    persist([...timers, { engagementId, engagementLabel, startedAt: Date.now() }])
  }

  const stopTimer = engagementId => {
    const timer = timers.find(t => t.engagementId === engagementId)
    if (!timer) return 0
    const secs  = Math.floor((Date.now() - timer.startedAt) / 1000)
    const hours = secs > 0 ? Math.max(0.25, Math.round(secs / 900) * 0.25) : 0
    persist(timers.filter(t => t.engagementId !== engagementId))
    return hours
  }

  const getTimerElapsed = engagementId => {
    const timer = timers.find(t => t.engagementId === engagementId)
    // eslint-disable-next-line no-unused-expressions
    tick // read tick to ensure re-render drives this
    return timer ? Math.floor((Date.now() - timer.startedAt) / 1000) : 0
  }

  const fmt = s => {
    const h   = Math.floor(s / 3600)
    const m   = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // ── Backward-compat aliases (Layout.jsx, EngagementDetail.jsx etc.) ─────────
  const active  = timers[0] || null
  // eslint-disable-next-line no-unused-expressions
  tick // ensure elapsed is live
  const elapsed = active ? Math.floor((Date.now() - active.startedAt) / 1000) : 0
  const start   = startTimer                          // start(engId, label)
  const stop    = () => active ? stopTimer(active.engagementId) : 0

  return (
    <TimerContext.Provider value={{
      // Multi-timer API
      timers, tick, startTimer, stopTimer, getTimerElapsed, fmt,
      // Backward-compat
      active, elapsed, start, stop,
    }}>
      {children}
    </TimerContext.Provider>
  )
}

export const useTimer = () => useContext(TimerContext)
