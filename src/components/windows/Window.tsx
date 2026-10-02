import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export default function Window({
  title,
  color,
  onClose,
  children,
}: {
  title: string
  color: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="flex max-h-[calc(100%-2rem)] w-104 flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
      <div
        className="flex items-center justify-between px-4 py-2.5 text-white"
        style={{ background: color }}
      >
        <h2 className="text-sm font-bold">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 transition hover:bg-white/20"
        >
          <X size={15} />
        </button>
      </div>
      <div className="overflow-y-auto p-4">{children}</div>
    </div>
  )
}
