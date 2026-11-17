import { useEffect, useRef, useState } from 'react'
import { readMediaFile } from '../lib/files.ts'
import { relativeTime } from '../lib/format.ts'
import { renderMarkdown } from '../lib/markdown.ts'
import { projectBuilds, projectMilestones, useQuest } from '../store.ts'
import {
  PRIORITIES,
  PRIORITY_META,
  STATUSES,
  STATUS_META,
  TASK_TYPES,
  TYPE_META,
  type Priority,
  type Status,
} from '../types.ts'
import { Icon } from './Icons.tsx'

export function TaskDrawer() {
  const open = useQuest((s) => s.drawerOpen)
  const selectedId = useQuest((s) => s.selectedTaskId)
  const tasks = useQuest((s) => s.tasks)
  const allAttachments = useQuest((s) => s.attachments)
  const allActivity = useQuest((s) => s.activity)
  const milestonesAll = useQuest((s) => s.milestones)
  const buildsAll = useQuest((s) => s.builds)
  const settings = useQuest((s) => s.settings)
  const task = tasks.find((item) => item.id === selectedId)
  const attachments = allAttachments.filter((item) => item.taskId === selectedId)
  const activity = allActivity.filter((item) => item.taskId === selectedId)
  const milestones = projectMilestones({ milestones: milestonesAll, settings })
  const builds = projectBuilds({ builds: buildsAll, settings })
  const updateTask = useQuest((s) => s.updateTask)
  const deleteTask = useQuest((s) => s.deleteTask)
  const duplicateTask = useQuest((s) => s.duplicateTask)
  const addAttachment = useQuest((s) => s.addAttachment)
  const removeAttachment = useQuest((s) => s.removeAttachment)
  const openAnnotator = useQuest((s) => s.openAnnotator)
  const addBuild = useQuest((s) => s.addBuild)
  const askConfirm = useQuest((s) => s.askConfirm)
  const closeTop = useQuest((s) => s.closeTop)
  const toast = useQuest((s) => s.toast)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assignee, setAssignee] = useState('')
  const [buildFound, setBuildFound] = useState('')
  const [buildFixed, setBuildFixed] = useState('')
  const [tab, setTab] = useState<'write' | 'preview'>('write')
  const [over, setOver] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!task) return
    setTitle(task.title)
    setDescription(task.description)
    setAssignee(task.assignee)
    setBuildFound(task.buildFound)
    setBuildFixed(task.buildFixed)
    setTab('write')
  }, [task?.id])

  useEffect(() => {
    if (!open) return
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(
        (file) => file.type.startsWith('image/') || file.type.startsWith('video/'),
      )
      if (!files.length || !task) return
      event.preventDefault()
      void attach(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [open, task?.id])

  if (!open || !task) return null

  const commitTitle = (value: string) => {
    const next = value.trim()
    if (next && next !== task.title) updateTask(task.id, { title: next })
  }
  const commitDescription = (value: string) => {
    if (value !== task.description) updateTask(task.id, { description: value })
  }
  const attach = async (files: File[]) => {
    for (const file of files) {
      try {
        const media = await readMediaFile(file)
        addAttachment(task.id, media)
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Eklenemedi')
      }
    }
  }
  const rememberBuild = (name: string) => {
    const trimmed = name.trim()
    if (trimmed && !builds.some((item) => item.name === trimmed)) addBuild(trimmed)
  }
  const wrap = (before: string, after = before) => {
    const el = areaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const next = `${description.slice(0, start)}${before}${description.slice(start, end)}${after}${description.slice(end)}`
    setDescription(next)
    commitDescription(next)
    requestAnimationFrame(() => {
      el.focus()
      el.selectionStart = start + before.length
      el.selectionEnd = end + before.length
    })
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={closeTop} />
      <aside className="drawer" role="dialog" aria-label={task.key}>
        <header className="drawer-head">
          <span className="key">{task.key}</span>
          <span className={`type-chip type-${task.type}`}>{TYPE_META[task.type].label}</span>
          <button className="icon-btn" type="button" style={{ marginLeft: 'auto' }} onClick={closeTop} aria-label="Kapat">
            <Icon name="close" />
          </button>
        </header>
        <div className="drawer-scroll">
          <textarea
            className="drawer-title"
            rows={2}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => commitTitle(title)}
          />
          <div className="meta-grid">
            <label className="field">
              <span>Durum</span>
              <select value={task.status} onChange={(event) => updateTask(task.id, { status: event.target.value as Status })}>
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{STATUS_META[status].label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Öncelik</span>
              <select value={task.priority} onChange={(event) => updateTask(task.id, { priority: event.target.value as Priority })}>
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>{PRIORITY_META[priority].label}</option>
                ))}
              </select>
            </label>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <span>Tür</span>
              <div className="seg">
                {TASK_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    className={task.type === type ? 'active' : ''}
                    onClick={() => updateTask(task.id, { type })}
                  >
                    {TYPE_META[type].label}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span>Kişi</span>
              <input
                list="assignees"
                value={assignee}
                onChange={(event) => setAssignee(event.target.value)}
                onBlur={() => {
                  if (assignee !== task.assignee) updateTask(task.id, { assignee })
                }}
              />
            </label>
            <label className="field">
              <span>Milestone</span>
              <select
                value={task.milestoneId ?? ''}
                onChange={(event) => updateTask(task.id, { milestoneId: event.target.value || null })}
              >
                <option value="">Yok</option>
                {milestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>{milestone.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Bulunduğu derleme</span>
              <input
                list="builds"
                value={buildFound}
                onChange={(event) => setBuildFound(event.target.value)}
                onBlur={() => {
                  if (buildFound !== task.buildFound) updateTask(task.id, { buildFound })
                  rememberBuild(buildFound)
                }}
              />
            </label>
            <label className="field">
              <span>Çözüldüğü derleme</span>
              <input
                list="builds"
                value={buildFixed}
                onChange={(event) => setBuildFixed(event.target.value)}
                onBlur={() => {
                  if (buildFixed !== task.buildFixed) updateTask(task.id, { buildFixed })
                  rememberBuild(buildFixed)
                }}
              />
            </label>
          </div>
          <datalist id="builds">
            {builds.map((build) => <option key={build.id} value={build.name} />)}
          </datalist>
          <datalist id="assignees">
            {[...new Set(useQuest.getState().tasks.map((item) => item.assignee).filter(Boolean))].map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>

          <div className="tabs">
            <button className={tab === 'write' ? 'btn-ghost' : 'btn'} type="button" onClick={() => setTab('write')}>Yaz</button>
            <button className={tab === 'preview' ? 'btn-ghost' : 'btn'} type="button" onClick={() => setTab('preview')}>Önizle</button>
            <button className="btn" type="button" onClick={() => wrap('**')}>B</button>
            <button className="btn" type="button" onClick={() => wrap('*')}>I</button>
            <button className="btn" type="button" onClick={() => wrap('`')}>kod</button>
            <button className="btn" type="button" onClick={() => wrap('\n- ', '')}>liste</button>
          </div>
          {tab === 'write' ? (
            <textarea
              ref={areaRef}
              className="area"
              value={description}
              placeholder="Tekrar adımları, kabul kriteri, not..."
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => commitDescription(description)}
            />
          ) : (
            <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(description || '*Boş açıklama*') }} />
          )}

          <div className="nav-label">Ekler</div>
          <div className="thumbs">
            {attachments.map((file) => (
              <figure className="thumb" key={file.id}>
                {file.fileType.startsWith('video/') ? (
                  <video src={file.dataUrl} controls />
                ) : (
                  <img src={file.dataUrl} alt={file.filePath} />
                )}
                <div className="thumb-actions">
                  {!file.fileType.startsWith('video/') && (
                    <button className="btn" type="button" onClick={() => openAnnotator(file.id)}>İşaretle</button>
                  )}
                  <button className="btn-danger" type="button" onClick={() => removeAttachment(file.id)}>Sil</button>
                </div>
              </figure>
            ))}
          </div>
          <div
            className={over ? 'dropzone is-over' : 'dropzone'}
            onDragOver={(event) => {
              event.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(event) => {
              event.preventDefault()
              setOver(false)
              void attach([...event.dataTransfer.files])
            }}
          >
            Ekran görüntüsü yapıştır, sürükle ya da{' '}
            <button className="btn" type="button" onClick={() => fileRef.current?.click()}>dosya seç</button>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={(event) => {
                void attach([...(event.target.files ?? [])])
                event.target.value = ''
              }}
            />
          </div>

          <div className="nav-label">Hareket</div>
          <ul className="activity">
            {activity.map((item) => (
              <li key={item.id}>
                <time>{relativeTime(item.createdAt)}</time>
                <span>{item.text}</span>
              </li>
            ))}
            {activity.length === 0 && <li><time /><span>Henüz kayıt yok.</span></li>}
          </ul>
        </div>
        <footer className="drawer-foot">
          <span>Güncellendi {relativeTime(task.updatedAt)}</span>
          <div className="foot-actions">
            <button className="btn-ghost" type="button" onClick={() => duplicateTask(task.id)}>
              <Icon name="copy" size={14} /> Çoğalt
            </button>
            <button
              className="btn-danger"
              type="button"
              onClick={() =>
                askConfirm({
                  title: `${task.key} silinsin mi?`,
                  body: 'Görev, ekleri ve hareket kaydı silinir. Bu yerel defterde geri alınamaz.',
                  confirmLabel: 'Sil',
                  tone: 'danger',
                  action: () => deleteTask(task.id),
                })
              }
            >
              Sil
            </button>
          </div>
        </footer>
      </aside>
    </>
  )
}

