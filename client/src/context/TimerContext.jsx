import { createContext, useContext, useEffect, useRef, useState } from 'react'

const TimerContext = createContext(null)

// Module-level ref so AuthContext can call clearAllTimers() on logout without
// importing a hook (hooks cannot be called outside component bodies).
const _clearRef = { current: null }

/**
 * Clear all timers and wipe timer localStorage keys.
 * Safe to call before the provider mounts (ref will be null → no-op on state).
 * Called by AuthContext.logout and the Electron force-logout handler.
 */
export function clearAllTimers() {
  localStorage.removeItem('mgr_timers')
  localStorage.removeItem('mgr_timer') // legacy single-timer key
  _clearRef.current?.()
}

// Migrate old timer shape { engagementId, engagementLabel, startedAt }
// to new shape { engagementId, engagementLabel, status, accumulatedSeconds, lastStartedAt }
function migrateTimers(arr) {
  return arr.map(t => {
    if (t.status !== undefined) return t // already new shape
    return {
      engagementId:       t.engagementId,
      engagementLabel:    t.engagementLabel,
      status:             'running',
      accumulatedSeconds: 0,
      lastStartedAt:      t.startedAt ?? Date.now(),
    }
  })
}

export function TimerProvider({ children }) {
  const [timers, setTimers] = useState(() => {
    try {
      // Migrate old single-timer format → array
      const legacy = localStorage.getItem('mgr_timer')
      if (legacy) {
        const old = JSON.parse(legacy)
        localStorage.removeItem('mgr_timer')
        if (old) {
          const arr = migrateTimers([old])
          localStorage.setItem('mgr_timers', JSON.stringify(arr))
          return arr
        }
      }
      const stored = JSON.parse(localStorage.getItem('mgr_timers') || '[]')
      return migrateTimers(stored)
    } catch {
      return []
    }
  })

  // tick forces re-renders every second so elapsed values are live
  const [tick, setTick] = useState(0)
  const intervalRef = useRef(null)

  const anyRunning = timers.some(t => t.status === 'running')

  useEffect(() => {
    if (anyRunning) {
      intervalRef.current = setInterval(() => setTick(n => n + 1), 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [anyRunning]) // eslint-disable-line react-hooks/exhaustive-deps

  const persist = newTimers => {
    localStorage.setItem('mgr_timers', JSON.stringify(newTimers))
    setTimers(newTimers)
  }

  // Wire up the module-level clear ref so AuthContext can clear timers on logout
  _clearRef.current = () => persist([])

  // ── Public API ──────────────────────────────────────────────────────────────

  const getTimerElapsed = engagementId => {
    const t = timers.find(x => x.engagementId === engagementId)
    tick // read tick to ensure re-render drives this
    if (!t) return 0
    if (t.status === 'running') return t.accumulatedSeconds + Math.floor((Date.now() - t.lastStartedAt) / 1000)
    return t.accumulatedSeconds
  }

  // Start or resume a timer. Auto-pauses whichever timer is currently running.
  // Only ONE timer may run at a time.
  const startTimer = (engagementId, engagementLabel) => {
    const now = Date.now()
    // Pause the currently-running timer (if it's a different one)
    let updated = timers.map(t => {
      if (t.status === 'running' && t.engagementId !== engagementId) {
        return {
          ...t,
          status: 'paused',
          accumulatedSeconds: t.accumulatedSeconds + Math.floor((now - t.lastStartedAt) / 1000),
          lastStartedAt: null,
        }
      }
      return t
    })

    const existing = updated.find(t => t.engagementId === engagementId)
    if (existing) {
      if (existing.status === 'running') return // already running — no-op
      // Resume a paused timer
      updated = updated.map(t =>
        t.engagementId === engagementId
          ? { ...t, status: 'running', lastStartedAt: now }
          : t
      )
    } else {
      // Brand-new timer
      updated = [...updated, {
        engagementId,
        engagementLabel,
        status: 'running',
        accumulatedSeconds: 0,
        lastStartedAt: now,
      }]
    }
    persist(updated)
  }

  const pauseTimer = engagementId => {
    const now = Date.now()
    persist(timers.map(t => {
      if (t.engagementId !== engagementId || t.status !== 'running') return t
      return {
        ...t,
        status: 'paused',
        accumulatedSeconds: t.accumulatedSeconds + Math.floor((now - t.lastStartedAt) / 1000),
        lastStartedAt: null,
      }
    }))
  }

  const stopTimer = engagementId => {
    const t = timers.find(x => x.engagementId === engagementId)
    if (!t) return 0
    let totalSecs = t.accumulatedSeconds
    if (t.status === 'running') totalSecs += Math.floor((Date.now() - t.lastStartedAt) / 1000)
    const hours = totalSecs > 0 ? Math.max(0.25, Math.round(totalSecs / 900) * 0.25) : 0
    persist(timers.filter(x => x.engagementId !== engagementId))
    return hours
  }

  const fmt = s => {
    const h   = Math.floor(s / 3600)
    const m   = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // ── Backward-compat aliases (Layout.jsx, EngagementDetail.jsx etc.) ─────────
  const runningTimer = timers.find(t => t.status === 'running')
  const active       = runningTimer || timers[0] || null
  tick // ensure elapsed is live
  const elapsed = active ? getTimerElapsed(active.engagementId) : 0
  const start   = startTimer
  const stop    = () => active ? stopTimer(active.engagementId) : 0

  return (
    <TimerContext.Provider value={{
      // Multi-timer API
      timers, tick, startTimer, pauseTimer, stopTimer, getTimerElapsed, fmt,
      // Backward-compat
      active, elapsed, start, stop,
    }}>
      {children}
    </TimerContext.Provider>
  )
}

export const useTimer = () => useContext(TimerContext)
