import type { Priority, TaskType } from '../types.ts'
import { PRIORITY_META, TYPE_META } from '../types.ts'
import { hueFrom, initials } from '../lib/format.ts'

export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  if (!name.trim()) return null
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, background: `hsl(${hueFrom(name)} 24% 32%)` }}
      title={name}
    >
      {initials(name)}
    </span>
  )
}

export function PriorityMarks({ priority }: { priority: Priority }) {
  const rank = PRIORITY_META[priority].rank
  return (
    <span className={`pri pri-${priority}`} title={PRIORITY_META[priority].label}>
      {[1, 2, 3, 4].map((step) => (
        <i key={step} className={step <= rank ? 'on' : ''} />
      ))}
    </span>
  )
}

export function TypeChip({ type }: { type: TaskType }) {
  return <span className={`type-chip type-${type}`}>{TYPE_META[type].label}</span>
}

export function Kbd({ children }: { children: string }) {
  return <kbd>{children}</kbd>
}
