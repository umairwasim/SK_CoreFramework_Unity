import { daysLabel, formatDate, progressOf } from '../lib/format.ts'
import { projectMilestones, useQuest } from '../store.ts'
import { MILESTONE_META, TYPE_META, type TaskType } from '../types.ts'
import { Icon } from './Icons.tsx'

export function MilestoneView() {
  const milestones = useQuest((s) => s.milestones)
  const tasks = useQuest((s) => s.tasks)
  const settings = useQuest((s) => s.settings)
  const list = projectMilestones({ milestones, settings })
  const openMilestoneModal = useQuest((s) => s.openMilestoneModal)
  const setActiveMilestone = useQuest((s) => s.setActiveMilestone)
  const setFilters = useQuest((s) => s.setFilters)
  const setView = useQuest((s) => s.setView)
  const askConfirm = useQuest((s) => s.askConfirm)
  const deleteMilestone = useQuest((s) => s.deleteMilestone)

  return (
    <div className="ms-grid">
      {list.map((milestone) => {
        const related = tasks.filter((task) => task.milestoneId === milestone.id)
        const open = related.filter((task) => task.status !== 'done')
        const pct = progressOf(related)
        const due = daysLabel(milestone.targetDate)
        const counts = (['bug', 'feature', 'asset', 'polish'] as TaskType[]).map((type) => ({
          type,
          n: related.filter((task) => task.type === type && task.status !== 'done').length,
        }))
        return (
          <article key={milestone.id} className="ms-card">
            <div className={`status-pill ${milestone.status}`}>{MILESTONE_META[milestone.status]}</div>
            <h3>{milestone.name}</h3>
            <p>{milestone.description || 'Açıklama yok.'}</p>
            <div className="quest-side" style={{ textAlign: 'left', marginTop: 10 }}>
              <strong className={due.tone === 'late' ? 'tone-late' : due.tone === 'soon' ? 'tone-soon' : ''}>
                {due.text}
              </strong>
              {formatDate(milestone.targetDate)}
            </div>
            <div className="meter" style={{ marginTop: 10 }}>
              <span style={{ width: `${pct}%` }} />
            </div>
            <div className="quest-counts">
              <span>{pct}% · {related.length} görev</span>
              {counts.filter((item) => item.n).map((item) => (
                <span key={item.type}>{item.n} {TYPE_META[item.type].label.toLocaleLowerCase('tr-TR')}</span>
              ))}
            </div>
            <ul className="mini-tasks">
              {open.slice(0, 4).map((task) => (
                <li key={task.id}>{task.key} · {task.title}</li>
              ))}
            </ul>
            <div className="ms-actions">
              <button
                className="btn-primary"
                type="button"
                onClick={() => {
                  setActiveMilestone(milestone.id)
                  setFilters({ milestoneId: milestone.id })
                  setView('board')
                }}
              >
                Panoda aç
              </button>
              <button className="btn-ghost" type="button" onClick={() => openMilestoneModal({ mode: 'edit', id: milestone.id })}>
                Düzenle
              </button>
              <button
                className="btn-danger"
                type="button"
                onClick={() =>
                  askConfirm({
                    title: `${milestone.name} silinsin mi?`,
                    body: 'Görevler silinmez, milestone bağı kalkar.',
                    confirmLabel: 'Sil',
                    tone: 'danger',
                    action: () => deleteMilestone(milestone.id),
                  })
                }
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
          </article>
        )
      })}
      <button className="dashed-card" type="button" onClick={() => openMilestoneModal({ mode: 'create' })}>
        <Icon name="flag" />
        <strong>Yeni milestone</strong>
        <span>Sprint değil. Vertical Slice, Alpha, Release.</span>
      </button>
    </div>
  )
}
