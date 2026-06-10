import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { TableCellsIcon, CalendarDaysIcon } from '@heroicons/react/24/outline'
import { useAuth } from '../context/AuthContext'
import { timeEntriesApi }  from '../api/timeEntries'
import { engagementsApi }  from '../api/engagements'
import { serviceCodesApi } from '../api/serviceCodes'
import { payPeriodsApi }   from '../api/payPeriods'

import EntryForm      from './time/EntryForm'
import DailyGrid      from './time/DailyGrid'
import TimesheetView  from './time/TimesheetView'
import BottomTabs     from './time/BottomTabs'
import CalendarWidget from './time/CalendarWidget'
import TimerPanel     from '../components/TimerPanel'

const TODAY = () => new Date().toISOString().split('T')[0]

export default function TimeTracking() {
  const location = useLocation()
  const { user } = useAuth()

  const [view, setView]            = useState('daily')
  const [selectedDate, setSelDate] = useState(TODAY())

  const [period,       setPeriod]      = useState(null)
  const [allPeriods,   setAllPeriods]  = useState([])
  const [engagements,  setEngagements] = useState([])
  const [serviceCodes, setCodes]       = useState([])
  const [entries,      setEntries]     = useState([])

  // Prefill from timer stop; editing entry from DailyGrid edit button
  const [prefill,       setPrefill]       = useState(null)
  const [editingEntry,  setEditingEntry]  = useState(null)
  useEffect(() => {
    if (location.state?.prefill) {
      setPrefill(location.state.prefill)
      window.history.replaceState({}, '')
    }
  }, [location.state])

  // Load static data
  useEffect(() => {
    engagementsApi.list().then(setEngagements)
    serviceCodesApi.list().then(setCodes)
    payPeriodsApi.list().then(setAllPeriods)
    payPeriodsApi.current().then(p => { if (p) setPeriod(p) })
  }, [])

  // Load entries for daily grid — always scoped to the logged-in user only.
  // Admin seeing "all staff" applies only to reports, never the personal time entry page.
  const loadEntries = useCallback(() => {
    if (!user?.full_name) return
    timeEntriesApi.list({ staff_member: user.full_name }).then(setEntries)
  }, [user?.full_name])

  useEffect(() => { loadEntries() }, [loadEntries])

  // Period navigation
  const periodIndexRef = useRef(null)
  useEffect(() => {
    if (period && allPeriods.length > 0) {
      periodIndexRef.current = allPeriods.findIndex(p => p.id === period.id)
    }
  }, [period, allPeriods])

  const handlePeriodChange = dir => {
    if (!allPeriods.length) return
    let idx = periodIndexRef.current ?? allPeriods.findIndex(p => p.id === period?.id)
    if (dir === 'prev')      idx = Math.max(0, idx - 1)
    else if (dir === 'next') idx = Math.min(allPeriods.length - 1, idx + 1)
    else {
      const today = TODAY()
      idx = allPeriods.findIndex(p => p.start_date <= today && p.end_date >= today)
      if (idx < 0) idx = periodIndexRef.current ?? 0
    }
    const p = allPeriods[idx]
    if (p) { setPeriod(p); periodIndexRef.current = idx }
  }

  const entryDates = [...new Set(entries.map(e => e.date))]

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">

      {/* Page header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">Time Tracking</h1>
        </div>
        {/* View toggle */}
        <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
          <button
            onClick={() => setView('daily')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              view === 'daily' ? 'bg-white text-accent shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <CalendarDaysIcon className="w-4 h-4" />
            Daily
          </button>
          <button
            onClick={() => setView('timesheet')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
              view === 'timesheet' ? 'bg-white text-accent shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <TableCellsIcon className="w-4 h-4" />
            Timesheet
          </button>
        </div>
      </div>

      {/* Main body */}
      <div className="flex-1 flex flex-col overflow-hidden p-5 gap-4">

        {/* Entry form — shown in daily view */}
        {view === 'daily' && (
          <EntryForm
            prefill={prefill}
            editing={editingEntry}
            engagements={engagements}
            serviceCodes={serviceCodes}
            onSaved={() => { setPrefill(null); setEditingEntry(null); loadEntries() }}
            onCancel={() => setEditingEntry(null)}
          />
        )}

        {/* Daily view: calendar + grid side by side */}
        {view === 'daily' && (
          <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
            {/* Calendar sidebar */}
            <div className="flex-shrink-0 w-56">
              <CalendarWidget
                selectedDate={selectedDate}
                onSelect={date => setSelDate(date)}
                entryDates={entryDates}
              />
            </div>
            {/* Daily grid */}
            <DailyGrid
              entries={entries}
              selectedDate={selectedDate}
              onDateChange={setSelDate}
              onRefresh={loadEntries}
              onEdit={setEditingEntry}
              serviceCodes={serviceCodes}
            />
          </div>
        )}

        {/* Timesheet view */}
        {view === 'timesheet' && (
          <TimesheetView
            period={period}
            onPeriodChange={handlePeriodChange}
            engagements={engagements}
            serviceCodes={serviceCodes}
          />
        )}
      </div>

      {/* Bottom tabs */}
      <BottomTabs period={period} />

      {/* Timer panel — docked to bottom-right, only on this page */}
      <TimerPanel />
    </div>
  )
}
