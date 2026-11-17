export const TASK_TYPES = ['bug', 'feature', 'asset', 'polish'] as const
export type TaskType = (typeof TASK_TYPES)[number]

export const STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const
export type Status = (typeof STATUSES)[number]

export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
export type Priority = (typeof PRIORITIES)[number]

export const MILESTONE_STATUSES = ['planned', 'active', 'completed'] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

export type Project = {
  id: string
  name: string
  prefix: string
  color: string
  description: string
  createdAt: string
}

export type Milestone = {
  id: string
  projectId: string
  name: string
  targetDate: string | null
  status: MilestoneStatus
  description: string
}

export type Task = {
  id: string
  key: string
  projectId: string
  milestoneId: string | null
  title: string
  description: string
  type: TaskType
  status: Status
  priority: Priority
  assignee: string
  buildFound: string
  buildFixed: string
  position: number
  createdAt: string
  updatedAt: string
}

export type Annotation =
  | { id: string; tool: 'pen'; color: string; width: number; points: [number, number][] }
  | {
      id: string
      tool: 'arrow' | 'rect' | 'ellipse'
      color: string
      width: number
      x: number
      y: number
      w: number
      h: number
    }
  | { id: string; tool: 'text'; color: string; size: number; x: number; y: number; text: string }

export type Attachment = {
  id: string
  taskId: string
  filePath: string
  fileType: string
  dataUrl: string
  originalDataUrl: string
  annotations: Annotation[]
  createdAt: string
}

export type Build = {
  id: string
  projectId: string
  name: string
  createdAt: string
}

export type Activity = {
  id: string
  taskId: string
  text: string
  createdAt: string
}

export type Settings = {
  currentUser: string
  activeProjectId: string
  activeMilestoneId: string | null
}

export type Filters = {
  query: string
  types: TaskType[]
  priorities: Priority[]
  statuses: Status[]
  milestoneId: string
  assignee: string
  build: string
}

export type ViewId = 'board' | 'list' | 'milestones'

export type ProjectModal = null | { mode: 'create' } | { mode: 'edit'; id: string }
export type MilestoneModal = null | { mode: 'create' } | { mode: 'edit'; id: string }

export type ConfirmState = {
  title: string
  body: string
  confirmLabel: string
  tone: 'danger' | 'default'
  action: () => void
}

export type Toast = { id: string; message: string }

export const TYPE_META: Record<TaskType, { label: string; hint: string }> = {
  bug: { label: 'Hata', hint: 'Ayıklanacak bug' },
  feature: { label: 'Özellik', hint: 'Yeni mekanik' },
  asset: { label: 'Asset', hint: '2D, 3D veya ses' },
  polish: { label: 'Cila', hint: 'Görsel / işitsel iyileştirme' },
}

export const STATUS_META: Record<Status, { label: string; hint: string; key: string }> = {
  backlog: { label: 'Backlog', hint: 'Henüz sıraya girmedi', key: '1' },
  todo: { label: 'Yapılacak', hint: 'Sıradaki iş', key: '2' },
  in_progress: { label: 'Devam Eden', hint: 'Üzerinde çalışılıyor', key: '3' },
  review: { label: 'İnceleme', hint: 'Test ve inceleme', key: '4' },
  done: { label: 'Tamamlandı', hint: 'Bitti', key: '5' },
}

export const PRIORITY_META: Record<Priority, { label: string; rank: number }> = {
  low: { label: 'Düşük', rank: 1 },
  medium: { label: 'Orta', rank: 2 },
  high: { label: 'Yüksek', rank: 3 },
  critical: { label: 'Kritik', rank: 4 },
}

export const MILESTONE_META: Record<MilestoneStatus, string> = {
  planned: 'Planlandı',
  active: 'Aktif',
  completed: 'Tamamlandı',
}

export const PROJECT_COLORS = [
  '#e0b072',
  '#e07a4c',
  '#e25b4a',
  '#e0a45a',
  '#8eb7e8',
  '#7dcec0',
  '#c4b2f2',
  '#d7c4a3',
]

export const emptyFilters = (): Filters => ({
  query: '',
  types: [],
  priorities: [],
  statuses: [],
  milestoneId: 'all',
  assignee: 'all',
  build: 'all',
})

export function filtersActive(filters: Filters) {
  return (
    filters.query.trim() !== '' ||
    filters.types.length > 0 ||
    filters.priorities.length > 0 ||
    filters.statuses.length > 0 ||
    filters.milestoneId !== 'all' ||
    filters.assignee !== 'all' ||
    filters.build !== 'all'
  )
}
