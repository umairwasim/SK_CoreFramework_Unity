import { filtersActive } from '../types.ts'
import { progressOf } from '../lib/format.ts'
import { activeProject, projectBuilds, projectMilestones, resolveActiveMilestone, useQuest } from '../store.ts'
import { Icon, Mark } from './Icons.tsx'

const presets = [
  { id: 'all', label: 'Tümü' },
  { id: 'mine', label: 'Bana atanan' },
  { id: 'critical', label: 'Kritik hatalar' },
  { id: 'assets', label: 'Asset’ler' },
  { id: 'unassigned', label: 'Atanmamış' },
  { id: 'review', label: 'İncelemede' },
] as const

export function Sidebar() {
  const projects = useQuest((s) => s.projects)
  const tasks = useQuest((s) => s.tasks)
  const settings = useQuest((s) => s.settings)
  const filters = useQuest((s) => s.filters)
  const memoryOnly = useQuest((s) => s.memoryOnly)
  const milestonesAll = useQuest((s) => s.milestones)
  const buildsAll = useQuest((s) => s.builds)
  const milestones = projectMilestones({ milestones: milestonesAll, settings })
  const builds = projectBuilds({ builds: buildsAll, settings })
  const current = activeProject({ projects, settings })
  const activeMs = resolveActiveMilestone({ milestones: milestonesAll, settings })
  const setActiveProject = useQuest((s) => s.setActiveProject)
  const applyPreset = useQuest((s) => s.applyPreset)
  const clearFilters = useQuest((s) => s.clearFilters)
  const setFilters = useQuest((s) => s.setFilters)
  const setView = useQuest((s) => s.setView)
  const openProjectModal = useQuest((s) => s.openProjectModal)
  const openMilestoneModal = useQuest((s) => s.openMilestoneModal)
  const openBuildPrompt = useQuest((s) => s.openBuildPrompt)
  const deleteBuild = useQuest((s) => s.deleteBuild)
  const setActiveMilestone = useQuest((s) => s.setActiveMilestone)
  const setCurrentUser = useQuest((s) => s.setCurrentUser)
  const exportJson = useQuest((s) => s.exportJson)
  const exportCsv = useQuest((s) => s.exportCsv)
  const openHelp = useQuest((s) => s.openHelp)
  const askConfirm = useQuest((s) => s.askConfirm)
  const resetDemo = useQuest((s) => s.resetDemo)

  const presetActive = (id: (typeof presets)[number]['id']) => {
    if (id === 'all') return !filtersActive(filters)
    if (id === 'mine') return filters.assignee === 'me' && !filters.types.length
    if (id === 'critical') return filters.types[0] === 'bug' && filters.priorities[0] === 'critical'
    if (id === 'assets') return filters.types.length === 1 && filters.types[0] === 'asset'
    if (id === 'unassigned') return filters.assignee === 'unassigned'
    return filters.statuses.length === 1 && filters.statuses[0] === 'review'
  }

  return (
    <aside className="sidebar">
      <div style={{ padding: '10px 14px 2px 14px' }}>
        <a
          href="../../index.html"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 8px',
            borderRadius: 6,
            background: 'var(--panel-2)',
            border: '1px solid var(--line-strong)',
            color: 'var(--gold)',
            fontSize: 11,
            fontWeight: 600,
            textDecoration: 'none',
            fontFamily: 'var(--mono)',
            transition: 'all 0.15s ease'
          }}
        >
          <span>◂</span> Hub Deck
        </a>
      </div>
      <div className="brand">
        <span className="brand-mark">
          <Mark />
        </span>
        <div>
          <div className="brand-name">QuestBoard</div>
          <div className="brand-sub">
            <i className={memoryOnly ? 'local-dot warn' : 'local-dot'} />
            {memoryOnly ? 'bellekte' : 'yerel sqlite'}
          </div>
        </div>
      </div>
      <div className="sidebar-scroll">
        <div className="nav-label">
          Projeler
          <button className="icon-hit" type="button" aria-label="Yeni proje" onClick={() => openProjectModal({ mode: 'create' })}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        {projects.length === 0 ? (
          <div style={{ padding: '8px 10px', fontSize: '11px', color: 'var(--faint)', lineHeight: 1.4 }}>
            No projects yet.<br />
            <button
              type="button"
              onClick={() => openProjectModal({ mode: 'create' })}
              style={{ color: 'var(--gold)', background: 'none', border: 'none', padding: '4px 0 0 0', cursor: 'pointer', textDecoration: 'underline', fontSize: '11px' }}
            >
              + Create First Project
            </button>
          </div>
        ) : (
          projects.map((project) => {
            const count = tasks.filter((task) => task.projectId === project.id && task.status !== 'done').length
            return (
              <div
                key={project.id}
                className={project.id === settings.activeProjectId ? 'project-row active' : 'project-row'}
              >
                <button type="button" className="ghost-row" onClick={() => setActiveProject(project.id)}>
                  <i className="project-dot" style={{ background: project.color }} />
                  <span className="row-title grow">{project.name}</span>
                  <span className="row-meta">{count}</span>
                </button>
                <button
                  className="icon-hit"
                  type="button"
                  aria-label="Projeyi düzenle"
                  onClick={() => openProjectModal({ mode: 'edit', id: project.id })}
                >
                  <Icon name="pen" size={13} />
                </button>
              </div>
            )
          })
        )}

        <div className="nav-label">Hızlı filtre</div>
        <div className="filter-grid">
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={presetActive(preset.id) ? 'filter-btn active' : 'filter-btn'}
              onClick={() => (preset.id === 'all' ? clearFilters() : applyPreset(preset.id))}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="nav-label">
          Milestone’lar
          <button className="icon-hit" type="button" aria-label="Yeni milestone" onClick={() => openMilestoneModal({ mode: 'create' })}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        {milestones.map((milestone) => {
          const related = tasks.filter((task) => task.milestoneId === milestone.id)
          const pct = progressOf(related)
          return (
            <div key={milestone.id} className={activeMs?.id === milestone.id ? 'ms-row active' : 'ms-row'}>
              <button
                type="button"
                className="ghost-row"
                onClick={() => {
                  setActiveMilestone(milestone.id)
                  setFilters({ milestoneId: milestone.id })
                  setView('board')
                }}
              >
                <span className="row-title grow">{milestone.name}</span>
                <span className="row-meta">{pct}%</span>
              </button>
              <button
                className="icon-hit"
                type="button"
                aria-label="Milestone düzenle"
                onClick={() => openMilestoneModal({ mode: 'edit', id: milestone.id })}
              >
                <Icon name="pen" size={13} />
              </button>
            </div>
          )
        })}
        {milestones.length === 0 && <p className="row-meta" style={{ padding: '0 8px' }}>Henüz yok.</p>}

        <div className="nav-label">
          Derlemeler
          <button className="icon-hit" type="button" aria-label="Derleme ekle" onClick={openBuildPrompt}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        {builds.map((build) => {
          const count = tasks.filter(
            (task) => task.projectId === current?.id && (task.buildFound === build.name || task.buildFixed === build.name),
          ).length
          return (
            <div key={build.id} className={filters.build === build.name ? 'build-row active' : 'build-row'}>
              <button
                type="button"
                className="ghost-row"
                style={{ padding: 0, border: 0, flex: 1 }}
                onClick={() => {
                  setFilters({ build: filters.build === build.name ? 'all' : build.name })
                  setView('board')
                }}
              >
                <span className="row-title" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                  {build.name}
                </span>
                <span className="row-meta">{count}</span>
              </button>
              <button className="icon-hit" type="button" aria-label="Derlemeyi sil" onClick={() => deleteBuild(build.id)}>
                <Icon name="close" size={12} />
              </button>
            </div>
          )
        })}
      </div>
      <footer className="sidebar-foot">
        <div className="foot-actions">
          <button className="btn-ghost" type="button" onClick={exportJson}>JSON</button>
          <button className="btn-ghost" type="button" onClick={exportCsv}>CSV</button>
          <button className="btn-ghost" type="button" onClick={() => document.getElementById('backup-file')?.click()}>
            Yedek
          </button>
        </div>
        <label className="user-field">
          <span className="label">Adın</span>
          <input
            value={settings.currentUser}
            onChange={(event) => setCurrentUser(event.target.value)}
            aria-label="Geçerli kullanıcı"
          />
        </label>
        <div className="foot-actions">
          <button className="btn-ghost" type="button" onClick={openHelp}>Kısayollar</button>
          <button
            className="btn-ghost"
            type="button"
            onClick={() =>
              askConfirm({
                title: 'Örnek veriyi yükle',
                body: 'Kor Yolu panosu geri gelir. Şu anki yerel defterin üzerine yazılır.',
                confirmLabel: 'Yükle',
                tone: 'danger',
                action: () => void resetDemo(),
              })
            }
          >
            Örneği sıfırla
          </button>
        </div>
      </footer>
    </aside>
  )
}
