import { useGameStore } from '../store/useGameStore'

export default function EventLog() {
  const log = useGameStore((s) => s.log)
  const recent = log.slice(-4)
  if (!recent.length) return null

  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-1">
      {recent.map((e, i) => (
        <div
          key={`${e.tick}-${i}`}
          className="rounded-lg bg-white/85 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm"
        >
          <span className="mr-1.5 tabular-nums text-slate-400">
            T{e.tick}
          </span>
          {e.message}
        </div>
      ))}
    </div>
  )
}
