import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

const DAYS   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December']

function pad(n) { return String(n).padStart(2, '0') }
function toStr(y, m, d) { return `${y}-${pad(m+1)}-${pad(d)}` }

export default function CalendarWidget({
  selectedDate,
  onSelect,
  entryDates = [],
}) {
  const today    = new Date()
  const selParts = selectedDate ? selectedDate.split('-').map(Number) : null
  const initYear  = selParts ? selParts[0] : today.getFullYear()
  const initMonth = selParts ? selParts[1] - 1 : today.getMonth()

  const [viewYear,  setViewYear]  = useState(initYear)
  const [viewMonth, setViewMonth] = useState(initMonth)

  const entrySet = new Set(entryDates)

  const firstDay    = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const prev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const next = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isToday  = d => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
  const isSel    = d => d && selParts && d === selParts[2] && viewMonth === selParts[1]-1 && viewYear === selParts[0]
  const hasEntry = d => d && entrySet.has(toStr(viewYear, viewMonth, d))

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 select-none" style={{ width: 224 }}>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prev} className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeftIcon className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-gray-800">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button onClick={next} className="p-1 rounded hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronRightIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => (
          <div key={d} className="text-center text-xs font-medium text-gray-400 py-0.5">{d}</div>
        ))}
      </div>

      {/* Date cells */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          const dateStr  = d ? toStr(viewYear, viewMonth, d) : null
          const selected = isSel(d)
          const todayDay = isToday(d)
          const entry    = !selected && hasEntry(d)

          let cellCls = 'w-7 h-7 rounded-full text-xs font-medium transition-colors '
          if (selected)      cellCls += 'bg-accent text-white'
          else if (todayDay) cellCls += 'ring-2 ring-accent text-accent font-bold hover:bg-accent/10'
          else if (entry)    cellCls += 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          else               cellCls += 'text-gray-700 hover:bg-gray-100'

          return (
            <div key={i} className="flex items-center justify-center">
              {d ? (
                <button onClick={() => onSelect(dateStr)} className={cellCls}>
                  {d}
                </button>
              ) : <div className="w-7 h-7" />}
            </div>
          )
        })}
      </div>

      {/* Today button */}
      <button
        onClick={() => {
          setViewYear(today.getFullYear())
          setViewMonth(today.getMonth())
          onSelect(toStr(today.getFullYear(), today.getMonth(), today.getDate()))
        }}
        className="mt-2 w-full text-center text-xs text-accent font-medium hover:underline"
      >
        Today
      </button>
    </div>
  )
}
