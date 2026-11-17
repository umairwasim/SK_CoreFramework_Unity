import { cx, formatDate, priorityRank, relativeTime, statusRank } from '../lib/format.ts'
import { useQuest, visibleTasks } from '../store.ts'
import { PRIORITY_META, STATUS_META } from '../types.ts'
import { TypeChip } from './ui.tsx'

export function ListView() {
  const tasks = useQuest((s) => s.tasks)
  const filters = useQuest((s) => s.filters)
  const settings = useQuest((s) => s.settings)
  const milestones = useQuest((s) => s.milestones)
  const selectedTaskId = useQuest((s) => s.selectedTaskId)
  const selectTask = useQuest((s) => s.selectTask)
  const sort = useQuest((s) => s.listSort)
  const setListSort = useQuest((s) => s.setListSort)
  const rows = visibleTasks({ tasks, filters, settings, milestones }).slice().sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    if (sort.key === 'priority') return (priorityRank(a.priority) - priorityRank(b.priority)) * dir
    if (sort.key === 'status') return (statusRank(a.status) - statusRank(b.status)) * dir
    if (sort.key === 'updatedAt') return a.updatedAt.localeCompare(b.updatedAt) * dir
    return String(a[sort.key]).localeCompare(String(b[sort.key]), 'tr') * dir
  })

  const headers = [
    ['key', 'No'],
    ['title', 'Başlık'],
    ['type', 'Tür'],
    ['status', 'Durum'],
    ['priority', 'Öncelik'],
    ['assignee', 'Kişi'],
    ['updatedAt', 'Güncelleme'],
  ] as const

  return (
    <div className="list-wrap">
      <table className="ledger">
        <thead>
          <tr>
            {headers.map(([key, label]) => (
              <th key={key} onClick={() => setListSort(key)}>
                {label}
                {sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
              </th>
            ))}
            <th>Milestone</th>
            <th>Derleme</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((task) => {
            const milestone = milestones.find((item) => item.id === task.milestoneId)
            return (
              <tr
                key={task.id}
                className={cx(selectedTaskId === task.id && 'is-selected')}
                onClick={() => selectTask(task.id, true)}
              >
                <td className="key">{task.key}</td>
                <td className="title-cell">{task.title}</td>
                <td><TypeChip type={task.type} /></td>
                <td>{STATUS_META[task.status].label}</td>
                <td>{PRIORITY_META[task.priority].label}</td>
                <td>{task.assignee || '—'}</td>
                <td title={formatDate(task.updatedAt)}>{relativeTime(task.updatedAt)}</td>
                <td>{milestone?.name ?? '—'}</td>
                <td className="key">{task.buildFixed || task.buildFound || '—'}</td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={9}>Filtreye uyan görev yok.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
