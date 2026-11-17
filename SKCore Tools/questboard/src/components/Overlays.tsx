import { useEffect, useState } from 'react'
import { prefixFromName } from '../lib/format.ts'
import { useQuest } from '../store.ts'
import {
  MILESTONE_STATUSES,
  MILESTONE_META,
  PROJECT_COLORS,
  type MilestoneStatus,
} from '../types.ts'
import { Icon } from './Icons.tsx'

export function Overlays() {
  return (
    <>
      <ProjectModal />
      <MilestoneModal />
      <BuildPrompt />
      <ConfirmDialog />
      <HelpDialog />
      <Toasts />
      <BackupInput />
    </>
  )
}

function ProjectModal() {
  const modal = useQuest((s) => s.projectModal)
  const project = useQuest((s) => s.projects.find((item) => item.id === (modal?.mode === 'edit' ? modal.id : '')))
  const closeTop = useQuest((s) => s.closeTop)
  const createProject = useQuest((s) => s.createProject)
  const updateProject = useQuest((s) => s.updateProject)
  const deleteProject = useQuest((s) => s.deleteProject)
  const askConfirm = useQuest((s) => s.askConfirm)
  const [name, setName] = useState('')
  const [prefix, setPrefix] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [description, setDescription] = useState('')
  const [prefixTouched, setPrefixTouched] = useState(false)

  useEffect(() => {
    if (!modal) return
    setName(project?.name ?? '')
    setPrefix(project?.prefix ?? '')
    setColor(project?.color ?? PROJECT_COLORS[0])
    setDescription(project?.description ?? '')
    setPrefixTouched(modal.mode === 'edit')
  }, [modal, project?.id])

  if (!modal) return null
  const save = () => {
    const input = { name, prefix: prefix || prefixFromName(name), color, description }
    if (modal.mode === 'edit') updateProject(modal.id, input)
    else createProject(input)
  }

  return (
    <>
      <div className="overlay-backdrop" onClick={closeTop} />
      <div className="modal" role="dialog" aria-label="Proje">
        <div className="modal-head"><strong>{modal.mode === 'edit' ? 'Projeyi düzenle' : 'Yeni proje'}</strong></div>
        <form className="modal-body" onSubmit={(event) => { event.preventDefault(); save() }}>
          <label className="field">
            <span>Ad</span>
            <input
              className="text-input"
              value={name}
              autoFocus
              onChange={(event) => {
                setName(event.target.value)
                if (!prefixTouched) setPrefix(prefixFromName(event.target.value))
              }}
            />
          </label>
          <div className="meta-grid" style={{ marginTop: 10 }}>
            <label className="field">
              <span>Önek</span>
              <input
                className="text-input"
                value={prefix}
                maxLength={4}
                onChange={(event) => {
                  setPrefixTouched(true)
                  setPrefix(event.target.value.toUpperCase())
                }}
              />
            </label>
            <div className="field">
              <span>Renk</span>
              <div className="swatches">
                {PROJECT_COLORS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={item === color ? 'swatch active' : 'swatch'}
                    style={{ background: item }}
                    onClick={() => setColor(item)}
                    aria-label={item}
                  />
                ))}
              </div>
            </div>
          </div>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Not</span>
            <textarea className="area" style={{ minHeight: 80 }} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="modal-foot" style={{ padding: '12px 0 0' }}>
            {modal.mode === 'edit' ? (
              <button
                className="btn-danger"
                type="button"
                onClick={() =>
                  askConfirm({
                    title: 'Proje silinsin mi?',
                    body: 'Görevleri ve milestone’ları ile birlikte silinir.',
                    confirmLabel: 'Sil',
                    tone: 'danger',
                    action: () => deleteProject(modal.id),
                  })
                }
              >
                Sil
              </button>
            ) : <span />}
            <div className="foot-actions">
              <button className="btn-ghost" type="button" onClick={closeTop}>Vazgeç</button>
              <button className="btn-primary" type="submit">Kaydet</button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}

function MilestoneModal() {
  const modal = useQuest((s) => s.milestoneModal)
  const milestone = useQuest((s) => s.milestones.find((item) => item.id === (modal?.mode === 'edit' ? modal.id : '')))
  const closeTop = useQuest((s) => s.closeTop)
  const createMilestone = useQuest((s) => s.createMilestone)
  const updateMilestone = useQuest((s) => s.updateMilestone)
  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [status, setStatus] = useState<MilestoneStatus>('planned')
  const [description, setDescription] = useState('')

  useEffect(() => {
    if (!modal) return
    setName(milestone?.name ?? '')
    setDate(milestone?.targetDate ?? '')
    setStatus(milestone?.status ?? 'planned')
    setDescription(milestone?.description ?? '')
  }, [modal, milestone?.id])

  if (!modal) return null
  const save = () => {
    const input = { name, targetDate: date || null, status, description }
    if (modal.mode === 'edit') updateMilestone(modal.id, input)
    else createMilestone(input)
  }

  return (
    <>
      <div className="overlay-backdrop" onClick={closeTop} />
      <div className="modal" role="dialog" aria-label="Milestone">
        <div className="modal-head"><strong>{modal.mode === 'edit' ? 'Milestone' : 'Yeni milestone'}</strong></div>
        <form className="modal-body" onSubmit={(event) => { event.preventDefault(); save() }}>
          <label className="field">
            <span>Ad</span>
            <input className="text-input" value={name} autoFocus onChange={(event) => setName(event.target.value)} placeholder="Vertical Slice" />
          </label>
          <div className="meta-grid" style={{ marginTop: 10 }}>
            <label className="field">
              <span>Hedef tarih</span>
              <input className="text-input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="field">
              <span>Durum</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as MilestoneStatus)}>
                {MILESTONE_STATUSES.map((item) => (
                  <option key={item} value={item}>{MILESTONE_META[item]}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field" style={{ marginTop: 10 }}>
            <span>Hedef</span>
            <textarea className="area" style={{ minHeight: 80 }} value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <div className="modal-foot" style={{ padding: '12px 0 0' }}>
            <span />
            <div className="foot-actions">
              <button className="btn-ghost" type="button" onClick={closeTop}>Vazgeç</button>
              <button className="btn-primary" type="submit">Kaydet</button>
            </div>
          </div>
        </form>
      </div>
    </>
  )
}

function BuildPrompt() {
  const open = useQuest((s) => s.buildPromptOpen)
  const addBuild = useQuest((s) => s.addBuild)
  const closeTop = useQuest((s) => s.closeTop)
  const [name, setName] = useState('')
  useEffect(() => { if (open) setName('') }, [open])
  if (!open) return null
  return (
    <>
      <div className="overlay-backdrop" onClick={closeTop} />
      <div className="modal" role="dialog" aria-label="Derleme">
        <div className="modal-head"><strong>Yeni derleme</strong></div>
        <form className="modal-body" onSubmit={(event) => { event.preventDefault(); addBuild(name) }}>
          <label className="field">
            <span>Etiket</span>
            <input className="text-input" autoFocus value={name} placeholder="v0.4.3" onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="modal-foot" style={{ padding: '12px 0 0' }}>
            <span>Görevlere sonra bağlanır</span>
            <button className="btn-primary" type="submit">Ekle</button>
          </div>
        </form>
      </div>
    </>
  )
}

function ConfirmDialog() {
  const confirm = useQuest((s) => s.confirm)
  const closeTop = useQuest((s) => s.closeTop)
  if (!confirm) return null
  return (
    <>
      <div className="overlay-backdrop" onClick={closeTop} />
      <div className="modal" role="dialog" aria-label={confirm.title}>
        <div className="modal-head"><strong>{confirm.title}</strong></div>
        <div className="modal-body">
          <p style={{ color: 'var(--mute)', marginTop: 0 }}>{confirm.body}</p>
          <div className="foot-actions" style={{ justifyContent: 'flex-end' }}>
            <button className="btn-ghost" type="button" onClick={closeTop} autoFocus>Vazgeç</button>
            <button
              className={confirm.tone === 'danger' ? 'btn-danger' : 'btn-primary'}
              type="button"
              onClick={confirm.action}
            >
              {confirm.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

function HelpDialog() {
  const open = useQuest((s) => s.helpOpen)
  const closeTop = useQuest((s) => s.closeTop)
  if (!open) return null
  const rows = [
    ['Ctrl K', 'Komut paleti'],
    ['N', 'Yeni görev'],
    ['F veya /', 'Arama'],
    ['1 – 5', 'Seçili görevi sütuna taşı'],
    ['J / K', 'Görevler arasında gez'],
    ['Enter', 'Seçili görevi aç'],
    ['Esc', 'Paneli kapat'],
    ['?', 'Bu liste'],
  ]
  return (
    <>
      <div className="overlay-backdrop" onClick={closeTop} />
      <div className="help" role="dialog" aria-label="Kısayollar">
        <div className="modal-head">
          <strong>Klavye</strong>
          <button className="icon-btn" type="button" style={{ marginLeft: 'auto' }} onClick={closeTop} aria-label="Kapat">
            <Icon name="close" />
          </button>
        </div>
        <div className="help-body">
          <div className="shortcut-grid">
            {rows.map(([key, label]) => (
              <div key={key}><span>{label}</span><kbd>{key}</kbd></div>
            ))}
          </div>
          <p style={{ color: 'var(--faint)', fontSize: 13 }}>
            Pano beş şerit: 1 Backlog, 2 Yapılacak, 3 Devam Eden, 4 İnceleme, 5 Tamamlandı.
            Git, ATS, OmniProfiler ve bildirimler bu çekirdekte yok — `src/integrations.ts`.
          </p>
        </div>
      </div>
    </>
  )
}

function Toasts() {
  const toasts = useQuest((s) => s.toasts)
  if (!toasts.length) return null
  return (
    <div className="toast-wrap">
      {toasts.map((toast) => (
        <div className="toast" key={toast.id}>{toast.message}</div>
      ))}
    </div>
  )
}

function BackupInput() {
  const importBackup = useQuest((s) => s.importBackup)
  const toast = useQuest((s) => s.toast)
  return (
    <input
      id="backup-file"
      hidden
      type="file"
      accept="application/json,.json"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (!file) return
        const reader = new FileReader()
        reader.onload = () => {
          try {
            importBackup(String(reader.result))
          } catch (error) {
            toast(error instanceof Error ? error.message : 'Yedek okunamadı')
          }
        }
        reader.readAsText(file)
      }}
    />
  )
}
