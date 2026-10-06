import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useGameStore } from '../store/useGameStore'
import { formatDate } from '../core/time'

/** Recent events with game dates; click to expand the longer history. */
export default function EventLog() {
  const log = useGameStore((s) => s.log)
  const [expanded, setExpanded] = useState(false)
  const recent = log.slice(expanded ? -20 : -4)
  if (!recent.length) return null

  return (
    <div className="absolute bottom-4 left-4 z-10 flex max-w-md flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-fit items-center gap-1 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 shadow-sm transition hover:bg-white"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        {expanded ? 'Collapse log' : 'Event log'}
      </button>
      <div
        className={`flex flex-col gap-1 ${expanded ? 'max-h-80 overflow-y-auto rounded-xl bg-white/70 p-1.5 shadow-sm' : 'pointer-events-none'}`}
      >
        {recent.map((e, i) => (
          <div
            key={`${e.tick}-${i}`}
            className="rounded-lg bg-white/90 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
          >
            <span className="mr-1.5 tabular-nums text-slate-400">
              {formatDate(e.tick)}
            </span>
            {e.message}
          </div>
        ))}
      </div>
    </div>
  )
}
