import { useEffect } from 'react'
import { useGameStore } from './store/useGameStore'
import { tickOnce, TICK_MS } from './core/GameLoop'
import ResourceBar from './components/hud/ResourceBar'
import TickControls from './components/hud/TickControls'
import AlertBar from './components/hud/AlertBar'
import RegionMap from './components/map/RegionMap'
import RegionPanel from './components/map/RegionPanel'
import EventLog from './components/EventLog'
import ResearchWindow from './components/windows/ResearchWindow'
import MarketWindow from './components/windows/MarketWindow'
import SavesWindow from './components/windows/SavesWindow'

export default function App() {
  const paused = useGameStore((s) => s.paused)
  const speed = useGameStore((s) => s.speed)
  const windows = useGameStore((s) => s.windows)

  useEffect(() => {
    if (paused) return
    const timer = setInterval(tickOnce, TICK_MS / speed)
    return () => clearInterval(timer)
  }, [paused, speed])

  // Space pauses/resumes time.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      useGameStore.getState().togglePause()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-screen flex-col overflow-hidden text-slate-800">
      <header className="z-30 flex flex-wrap items-center justify-between gap-3 border-b border-amber-200/60 bg-[#fbf3e4] px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-black tracking-tight text-indigo-900">
            Aethelgard
          </h1>
        </div>
        <ResourceBar />
        <TickControls />
      </header>

      <main className="relative flex-1">
        <RegionMap />
        <AlertBar />

        <div className="absolute left-4 top-4 z-20 flex max-h-full items-start gap-4">
          {windows.research && <ResearchWindow />}
          {windows.market && <MarketWindow />}
          {windows.saves && <SavesWindow />}
        </div>

        <RegionPanel />
        <EventLog />
      </main>
    </div>
  )
}
