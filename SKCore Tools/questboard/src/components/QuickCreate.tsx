import { useEffect, useState } from 'react'
import { projectMilestones, useQuest } from '../store.ts'
import { PRIORITIES, PRIORITY_META, STATUS_META, TASK_TYPES, TYPE_META, type Priority, type TaskType } from '../types.ts'

export function QuickCreate() {
  const open = useQuest((s) => s.quickCreateOpen)
  const status = useQuest((s) => s.quickCreateStatus)
  const lastType = useQuest((s) => s.lastType)
  const lastPriority = useQuest((s) => s.lastPriority)
  const settings = useQuest((s) => s.settings)
  const milestonesAll = useQuest((s) => s.milestones)
  const activeMilestoneId = settings.activeMilestoneId
  const milestones = projectMilestones({ milestones: milestonesAll, settings })
  const createTask = useQuest((s) => s.createTask)
  const closeTop = useQuest((s) => s.closeTop)
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TaskType>(lastType)
  const [priority, setPriority] = useState<Priority>(lastPriority)
  const [milestoneId, setMilestoneId] = useState<string>(activeMilestoneId ?? '')
  const [assignee, setAssignee] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle('')
    setType(useQuest.getState().lastType)
    setPriority(useQuest.getState().lastPriority)
    setMilestoneId(useQuest.getState().settings.activeMilestoneId ?? '')
    setAssignee(useQuest.getState().settings.currentUser)
    const timer = window.setTimeout(() => document.getElementById('quick-title')?.focus(), 20)
    return () => window.clearTimeout(timer)
  }, [open])

  if (!open) return null

  const submit = () => {
    createTask({ title, type, priority, status, milestoneId: milestoneId || null, assignee })
  }

  return (
    <>
      <div className="overlay-backdrop" onClick={closeTop} />
      <div className="modal" role="dialog" aria-label="Yeni görev">
        <div className="modal-head">
          <strong>Yeni görev</strong>
          <span className="row-meta" style={{ marginLeft: 'auto' }}>{STATUS_META[status].label}</span>
        </div>
        <form
          className="modal-body"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <input
            id="quick-title"
            className="text-input"
            style={{ fontSize: 18, marginBottom: 12 }}
            placeholder="Ne yapılacak?"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <div className="field" style={{ marginBottom: 10 }}>
            <span>Tür</span>
            <div className="seg">
              {TASK_TYPES.map((item) => (
                <button key={item} type="button" className={type === item ? 'active' : ''} onClick={() => setType(item)}>
                  {TYPE_META[item].label}
                </button>
              ))}
            </div>
          </div>
          <div className="field" style={{ marginBottom: 10 }}>
            <span>Öncelik</span>
            <div className="seg">
              {PRIORITIES.map((item) => (
                <button key={item} type="button" className={priority === item ? 'active' : ''} onClick={() => setPriority(item)}>
                  {PRIORITY_META[item].label}
                </button>
              ))}
            </div>
          </div>
          <div className="meta-grid">
            <label className="field">
              <span>Milestone</span>
              <select value={milestoneId} onChange={(event) => setMilestoneId(event.target.value)}>
                <option value="">Yok</option>
                {milestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>{milestone.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Kişi</span>
              <input value={assignee} onChange={(event) => setAssignee(event.target.value)} />
            </label>
          </div>
          <div className="modal-foot" style={{ padding: '12px 0 0', border: 0 }}>
            <span>Enter oluşturur</span>
            <div className="foot-actions">
              <button className="btn-ghost" type="button" onClick={closeTop}>Vazgeç</button>
              <button className="btn-primary" type="submit">Oluştur</button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}
