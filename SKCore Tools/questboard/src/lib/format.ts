import type { Filters, Milestone, Priority, Status, Task, TaskType } from '../types.ts'
import { PRIORITY_META, STATUS_META, TYPE_META } from '../types.ts'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

export function uid(prefix = '') {
  const id = crypto.randomUUID().replaceAll('-', '').slice(0, 10)
  return prefix ? `${prefix}_${id}` : id
}

export function nowIso() {
  return new Date().toISOString()
}

export function dayOffset(days: number, withTime = false) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  if (!withTime) {
    d.setHours(12, 0, 0, 0)
    return d.toISOString().slice(0, 10)
  }
  return d.toISOString()
}

export function fold(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .replaceAll('ş', 's')
    .replaceAll('ğ', 'g')
    .replaceAll('ç', 'c')
    .replaceAll('ö', 'o')
    .replaceAll('ü', 'u')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toLocaleUpperCase('tr-TR')
}

export function hueFrom(name: string) {
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash % 360
}

export function formatDate(iso: string | null) {
  if (!iso) return '—'
  const date = new Date(iso.includes('T') ? iso : `${iso}T12:00:00`)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function daysUntil(date: string | null) {
  if (!date) return null
  const target = new Date(`${date}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export function daysLabel(date: string | null): { text: string; tone: 'ok' | 'soon' | 'late' | 'none' } {
  const days = daysUntil(date)
  if (days === null) return { text: 'Tarih yok', tone: 'none' }
  if (days === 0) return { text: 'Bugün', tone: 'soon' }
  if (days === 1) return { text: 'Yarın', tone: 'soon' }
  if (days > 1 && days <= 10) return { text: `${days} gün kaldı`, tone: 'soon' }
  if (days > 10) return { text: `${days} gün kaldı`, tone: 'ok' }
  if (days === -1) return { text: '1 gün geçti', tone: 'late' }
  return { text: `${Math.abs(days)} gün geçti`, tone: 'late' }
}

export function relativeTime(iso: string) {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  const min = Math.round(diff / 60_000)
  if (Math.abs(min) < 1) return 'az önce'
  if (min < 60 && min > 0) return `${min} dk önce`
  const hr = Math.round(min / 60)
  if (hr < 24 && hr > 0) return `${hr} sa önce`
  const day = Math.round(hr / 24)
  if (day === 1) return 'dün'
  if (day > 1 && day < 21) return `${day} gün önce`
  return formatDate(iso)
}

export function slugFile(name: string) {
  const folded = fold(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return folded || 'questboard'
}

export function taskMatches(task: Task, filters: Filters, currentUser: string, milestones: Milestone[]) {
  if (filters.types.length && !filters.types.includes(task.type)) return false
  if (filters.priorities.length && !filters.priorities.includes(task.priority)) return false
  if (filters.statuses.length && !filters.statuses.includes(task.status)) return false
  if (filters.milestoneId === 'none' && task.milestoneId) return false
  if (
    filters.milestoneId !== 'all' &&
    filters.milestoneId !== 'none' &&
    task.milestoneId !== filters.milestoneId
  ) {
    return false
  }
  if (filters.assignee === 'me' && fold(task.assignee) !== fold(currentUser)) return false
  if (filters.assignee === 'unassigned' && task.assignee.trim()) return false
  if (
    filters.assignee !== 'all' &&
    filters.assignee !== 'me' &&
    filters.assignee !== 'unassigned' &&
    fold(task.assignee) !== fold(filters.assignee)
  ) {
    return false
  }
  if (filters.build !== 'all' && task.buildFound !== filters.build && task.buildFixed !== filters.build) {
    return false
  }
  const query = filters.query.trim()
  if (!query) return true
  const milestone = milestones.find((item) => item.id === task.milestoneId)
  const haystack = fold(
    [
      task.title,
      task.key,
      task.description,
      task.assignee,
      task.buildFound,
      task.buildFixed,
      TYPE_META[task.type].label,
      STATUS_META[task.status].label,
      PRIORITY_META[task.priority].label,
      milestone?.name ?? '',
    ].join(' '),
  )
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

export function prefixFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const raw = parts.length >= 2 ? parts.map((part) => part[0] ?? '').join('') : name.trim().slice(0, 3)
  const folded = fold(raw).replace(/[^a-z0-9]/g, '').toUpperCase()
  return (folded || 'QB').slice(0, 4)
}

export function statusRank(status: Status) {
  return STATUS_META[status] ? ['backlog', 'todo', 'in_progress', 'review', 'done'].indexOf(status) : 0
}

export function priorityRank(priority: Priority) {
  return PRIORITY_META[priority].rank
}

export function typeLabel(type: TaskType) {
  return TYPE_META[type].label
}

export function progressOf(tasks: Task[]) {
  if (!tasks.length) return 0
  return Math.round((tasks.filter((task) => task.status === 'done').length / tasks.length) * 100)
}

export function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`
  return value
}
