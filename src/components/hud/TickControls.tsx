import {
  BookOpen,
  Landmark,
  Pause,
  Play,
  RefreshCw,
  Save,
  Scale,
} from 'lucide-react'
import { useGameStore } from '../../store/useGameStore'
import { ERA_LABEL } from '../../data/techs'
import { formatDate } from '../../core/time'
import type { GameSpeed } from '../../types/game'

const SPEEDS: GameSpeed[] = [1, 2, 4]

export default function TickControls() {
  const tick = useGameStore((s) => s.tick)
  const era = useGameStore((s) => s.era)
  const paused = useGameStore((s) => s.paused)
  const speed = useGameStore((s) => s.speed)
  const togglePause = useGameStore((s) => s.togglePause)
  const setSpeed = useGameStore((s) => s.setSpeed)
  const toggleWindow = useGameStore((s) => s.toggleWindow)
  const newGame = useGameStore((s) => s.newGame)

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-violet-700">
        <Landmark size={15} />
        <span className="text-sm font-semibold">{ERA_LABEL[era]}</span>
      </div>
      <span
        className="rounded-full bg-white px-3 py-1 text-sm font-medium tabular-nums shadow-sm"
        title={`Month ${tick + 1} — one tick is one month`}
      >
        {formatDate(tick)}
      </span>

      <button
        type="button"
        onClick={togglePause}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-white shadow-sm transition hover:bg-amber-500"
        title={paused ? 'Resume' : 'Pause'}
      >
        {paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
      <div className="flex overflow-hidden rounded-full bg-white shadow-sm">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`px-2.5 py-1 text-xs font-semibold transition ${
              speed === s
                ? 'bg-indigo-500 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => toggleWindow('research')}
        className="flex items-center gap-1.5 rounded-full bg-sky-500 px-3 py-1 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600"
      >
        <BookOpen size={15} /> Research
      </button>
      <button
        type="button"
        onClick={() => toggleWindow('market')}
        className="flex items-center gap-1.5 rounded-full bg-emerald-500 px-3 py-1 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600"
      >
        <Scale size={15} /> Market
      </button>
      <button
        type="button"
        onClick={() => toggleWindow('saves')}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100"
        title="Save / load games"
      >
        <Save size={15} />
      </button>
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              'Start a new map? Unsaved progress will be lost.',
            )
          ) {
            newGame()
          }
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm transition hover:bg-slate-100"
        title="New map"
      >
        <RefreshCw size={15} />
      </button>
    </div>
  )
}
