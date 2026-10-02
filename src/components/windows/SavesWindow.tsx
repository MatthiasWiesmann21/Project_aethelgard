import { useState } from 'react'
import { FolderOpen, Save, Trash2 } from 'lucide-react'
import { useGameStore } from '../../store/useGameStore'
import { listSaves } from '../../core/persistence'
import { ERA_LABEL } from '../../data/techs'
import Window from './Window'

/** Named save slots + autosave — write/delete managed via the game store. */
export default function SavesWindow() {
  const toggleWindow = useGameStore((s) => s.toggleWindow)
  const saveAs = useGameStore((s) => s.saveAs)
  const loadSlot = useGameStore((s) => s.loadSlot)
  const deleteSlot = useGameStore((s) => s.deleteSlot)
  const [name, setName] = useState('')
  const [version, setVersion] = useState(0) // bump to re-read listSaves

  const saves = listSaves()
  const trimmed = name.trim()
  const canSave = trimmed.length > 0 && trimmed !== 'auto'

  const refresh = () => setVersion((v) => v + 1)
  void version

  return (
    <Window
      title="Save / Load"
      color="#64748B"
      onClose={() => toggleWindow('saves')}
    >
      <div className="mb-3 flex gap-1.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Save name…"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-indigo-300"
        />
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            saveAs(trimmed)
            setName('')
            refresh()
          }}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm font-semibold text-white transition enabled:hover:bg-indigo-600 disabled:opacity-40"
        >
          <Save size={14} /> Save
        </button>
      </div>

      {saves.length === 0 && (
        <p className="text-sm text-slate-500">
          No saves yet — the autosave appears here after ~10 months.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        {saves.map((s) => (
          <div
            key={s.name}
            className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-700">
                {s.name === 'auto' ? 'Autosave' : s.name}
              </div>
              <div className="text-[11px] text-slate-400">
                Month {s.tick + 1} · {ERA_LABEL[s.era]} ·{' '}
                {new Date(s.savedAt).toLocaleString()}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  loadSlot(s.name)
                  refresh()
                }}
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition hover:bg-emerald-100"
                title="Load this save"
              >
                <FolderOpen size={14} />
              </button>
              {s.name !== 'auto' && (
                <button
                  type="button"
                  onClick={() => {
                    deleteSlot(s.name)
                    refresh()
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-500 transition hover:bg-rose-100"
                  title="Delete this save"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Window>
  )
}
