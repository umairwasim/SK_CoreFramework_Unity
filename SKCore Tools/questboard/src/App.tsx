import { useEffect, useState } from 'react'
import { Annotator } from './components/Annotator.tsx'
import { Board } from './components/Board.tsx'
import { CommandPalette } from './components/CommandPalette.tsx'
import { Icon, Mark } from './components/Icons.tsx'
import { ListView } from './components/ListView.tsx'
import { MilestoneView } from './components/MilestoneView.tsx'
import { Overlays } from './components/Overlays.tsx'
import { QuickCreate } from './components/QuickCreate.tsx'
import { Sidebar } from './components/Sidebar.tsx'
import { TaskDrawer } from './components/TaskDrawer.tsx'
import { daysLabel, formatDate, progressOf, cx } from './lib/format.ts'
import {
  activeProject,
  focusSearch,
  projectMilestones,
  resolveActiveMilestone,
  useQuest,
  visibleTasks,
} from './store.ts'
import { PRIORITY_META, STATUSES, STATUS_META, TYPE_META, filtersActive, type Status, type TaskType } from './types.ts'

export default function App() {
  const ready = useQuest((s) => s.ready)
  const error = useQuest((s) => s.error)
  const init = useQuest((s) => s.init)
  const sidebarOpen = useQuest((s) => s.sidebarOpen)
  useEffect(() => {
    void init()
  }, [init])
  useHotkeys()

  if (!ready) return <Boot error={error} onRetry={() => void init()} />

  return (
    <div className={cx('app', !sidebarOpen && 'sidebar-collapsed')}>
      <Sidebar />
      <main className="main">
        <Topbar />
        <QuestStrip />
        <Workspace />
      </main>
      <TaskDrawer />
      <CommandPalette />
      <QuickCreate />
      <Annotator />
      <Overlays />
    </div>
  )
}

function Workspace() {
  const view = useQuest((s) => s.view)
  if (view === 'list') return <ListView />
  if (view === 'milestones') return <MilestoneView />
  return <Board />
}

function Topbar() {
  const projects = useQuest((s) => s.projects)
  const settingsForProject = useQuest((s) => s.settings)
  const project = activeProject({ projects, settings: settingsForProject })
  const view = useQuest((s) => s.view)
  const filters = useQuest((s) => s.filters)
  const milestones = useQuest((s) => s.milestones)
  const setView = useQuest((s) => s.setView)
  const setFilters = useQuest((s) => s.setFilters)
  const clearFilters = useQuest((s) => s.clearFilters)
  const toggleSidebar = useQuest((s) => s.toggleSidebar)
  const openPalette = useQuest((s) => s.openPalette)
  const openQuickCreate = useQuest((s) => s.openQuickCreate)
  const filterOpen = useQuest((s) => s.filterOpen)
  const toggleFilterOpen = useQuest((s) => s.toggleFilterOpen)
  const tasks = useQuest((s) => s.tasks)
  const settings = useQuest((s) => s.settings)
  const critical = tasks.filter(
    (task) => task.projectId === settings.activeProjectId && task.type === 'bug' && task.priority === 'critical' && task.status !== 'done',
  ).length
  const milestone = milestones.find((item) => item.id === filters.milestoneId)

  return (
    <>
      <header className="topbar">
        <button className="icon-btn" type="button" onClick={toggleSidebar} aria-label="Kenar çubuğu">
          <Icon name="sidebar" />
        </button>
        <div className="topbar-title">{project?.name ?? 'QuestBoard'}</div>
        {critical > 0 && <span className="type-chip type-bug">{critical} kritik</span>}
        <div className="views">
          <button type="button" className={view === 'board' ? 'active' : ''} onClick={() => setView('board')}>Pano</button>
          <button type="button" className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>Liste</button>
          <button type="button" className={view === 'milestones' ? 'active' : ''} onClick={() => setView('milestones')}>Milestone</button>
        </div>
        <label className="search">
          <Icon name="search" size={15} />
          <input
            id="quest-search"
            value={filters.query}
            placeholder="Görev, kişi, derleme ara"
            onChange={(event) => setFilters({ query: event.target.value })}
          />
        </label>
        <button className={filterOpen ? 'icon-btn' : 'icon-btn'} type="button" onClick={toggleFilterOpen} aria-label="Filtreler" style={filtersActive(filters) ? { borderColor: 'var(--gold)', color: 'var(--gold)' } : undefined}>
          <Icon name="filter" size={15} />
        </button>
        <button className="btn-ghost" type="button" onClick={openPalette}>
          <kbd>Ctrl</kbd> <kbd>K</kbd>
        </button>
        <button className="btn-primary" type="button" onClick={() => openQuickCreate('backlog')}>Yeni görev</button>
      </header>
      {filtersActive(filters) && (
        <div className="chip-row">
          {filters.types.map((type) => (
            <span className="chip" key={type}>
              {TYPE_META[type].label}
              <button type="button" onClick={() => setFilters({ types: filters.types.filter((item) => item !== type) })}>×</button>
            </span>
          ))}
          {filters.priorities.map((priority) => (
            <span className="chip" key={priority}>
              {PRIORITY_META[priority].label}
              <button type="button" onClick={() => setFilters({ priorities: filters.priorities.filter((item) => item !== priority) })}>×</button>
            </span>
          ))}
          {filters.statuses.map((status) => (
            <span className="chip" key={status}>
              {STATUS_META[status].label}
              <button type="button" onClick={() => setFilters({ statuses: filters.statuses.filter((item) => item !== status) })}>×</button>
            </span>
          ))}
          {filters.milestoneId !== 'all' && (
            <span className="chip">
              {filters.milestoneId === 'none' ? 'Milestone yok' : milestone?.name ?? 'Milestone'}
              <button type="button" onClick={() => setFilters({ milestoneId: 'all' })}>×</button>
            </span>
          )}
          {filters.assignee !== 'all' && (
            <span className="chip">
              {filters.assignee === 'me' ? 'Bana atanan' : filters.assignee === 'unassigned' ? 'Atanmamış' : filters.assignee}
              <button type="button" onClick={() => setFilters({ assignee: 'all' })}>×</button>
            </span>
          )}
          {filters.build !== 'all' && (
            <span className="chip">
              {filters.build}
              <button type="button" onClick={() => setFilters({ build: 'all' })}>×</button>
            </span>
          )}
          {filters.query && (
            <span className="chip">
              “{filters.query}”
              <button type="button" onClick={() => setFilters({ query: '' })}>×</button>
            </span>
          )}
          <button className="btn" type="button" onClick={clearFilters}>Temizle</button>
        </div>
      )}
      {filterOpen && <FilterPanel />}
    </>
  )
}

function FilterPanel() {
  const filters = useQuest((s) => s.filters)
  const setFilters = useQuest((s) => s.setFilters)
  const milestonesAll = useQuest((s) => s.milestones)
  const settings = useQuest((s) => s.settings)
  const allBuilds = useQuest((s) => s.builds)
  const allTasks = useQuest((s) => s.tasks)
  const milestones = projectMilestones({ milestones: milestonesAll, settings })
  const builds = allBuilds.filter((item) => item.projectId === settings.activeProjectId)
  const assignees = [...new Set(allTasks.map((task) => task.assignee).filter(Boolean))]
  const toggle = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value]

  return (
    <div className="chip-row" style={{ alignItems: 'end' }}>
      <div className="field">
        <span>Tür</span>
        <div className="seg">
          {(Object.keys(TYPE_META) as TaskType[]).map((type) => (
            <button key={type} type="button" className={filters.types.includes(type) ? 'active' : ''} onClick={() => setFilters({ types: toggle(filters.types, type) })}>
              {TYPE_META[type].label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Öncelik</span>
        <div className="seg">
          {(['low', 'medium', 'high', 'critical'] as const).map((priority) => (
            <button key={priority} type="button" className={filters.priorities.includes(priority) ? 'active' : ''} onClick={() => setFilters({ priorities: toggle(filters.priorities, priority) })}>
              {PRIORITY_META[priority].label}
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Milestone</span>
        <select value={filters.milestoneId} onChange={(event) => setFilters({ milestoneId: event.target.value })}>
          <option value="all">Tümü</option>
          <option value="none">Bağsız</option>
          {milestones.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Kişi</span>
        <select value={filters.assignee} onChange={(event) => setFilters({ assignee: event.target.value })}>
          <option value="all">Tümü</option>
          <option value="me">Bana atanan</option>
          <option value="unassigned">Atanmamış</option>
          {assignees.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Derleme</span>
        <select value={filters.build} onChange={(event) => setFilters({ build: event.target.value })}>
          <option value="all">Tümü</option>
          {builds.map((build) => <option key={build.id} value={build.name}>{build.name}</option>)}
        </select>
      </label>
    </div>
  )
}

function QuestStrip() {
  const view = useQuest((s) => s.view)
  const tasks = useQuest((s) => s.tasks)
  const milestones = useQuest((s) => s.milestones)
  const settings = useQuest((s) => s.settings)
  const setView = useQuest((s) => s.setView)
  if (view === 'milestones') return null
  const milestone = resolveActiveMilestone({ milestones, settings })
  if (!milestone) {
    return (
      <button className="quest-strip" type="button" onClick={() => setView('milestones')}>
        <div className="quest-kicker">Milestone yok</div>
        <div className="quest-name">Bir hedef seç</div>
      </button>
    )
  }
  const related = tasks.filter((task) => task.milestoneId === milestone.id)
  const pct = progressOf(related)
  const due = daysLabel(milestone.targetDate)
  const counts = (['bug', 'feature', 'asset', 'polish'] as TaskType[])
    .map((type) => ({ type, n: related.filter((task) => task.type === type && task.status !== 'done').length }))
    .filter((item) => item.n)
  return (
    <button className="quest-strip" type="button" onClick={() => setView('milestones')}>
      <div>
        <div className="quest-kicker">Aktif milestone</div>
        <div className="quest-name">{milestone.name}</div>
      </div>
      <div className="quest-side">
        <strong className={due.tone === 'late' ? 'tone-late' : due.tone === 'soon' ? 'tone-soon' : ''}>{due.text}</strong>
        {formatDate(milestone.targetDate)}
      </div>
      <div className="quest-desc">{milestone.description}</div>
      <div className="meter"><span style={{ width: `${pct}%` }} /></div>
      <div className="quest-counts">
        <span>{pct}% tamam</span>
        {counts.map((item) => (
          <span key={item.type}>{item.n} {TYPE_META[item.type].label.toLocaleLowerCase('tr-TR')}</span>
        ))}
      </div>
    </button>
  )
}

function Boot({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), 140)
    return () => window.clearTimeout(timer)
  }, [])
  if (!show && !error) return <div className="boot boot-blank" />
  return (
    <div className="boot">
      <div className="boot-card">
        <Mark size={42} />
        <h1>QuestBoard</h1>
        <p>{error ?? 'Yerel defter açılıyor'}</p>
        {error && <button className="btn-primary" type="button" onClick={onRetry}>Yeniden dene</button>}
      </div>
    </div>
  )
}

function useHotkeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = useQuest.getState()
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        useQuest.setState({ paletteOpen: !state.paletteOpen, quickCreateOpen: false })
        return
      }
      if (event.key === 'Escape') {
        const blocked = state.annotatorId || state.confirm || state.helpOpen || state.projectModal || state.milestoneModal || state.buildPromptOpen || state.paletteOpen || state.quickCreateOpen || state.filterOpen || state.drawerOpen || state.selectedTaskId
        if (blocked) {
          event.preventDefault()
          state.closeTop()
        }
        return
      }
      if (isTyping(event.target)) return
      if (state.annotatorId || state.confirm || state.helpOpen || state.projectModal || state.milestoneModal || state.buildPromptOpen || state.paletteOpen || state.quickCreateOpen) return
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault()
        state.openQuickCreate('backlog')
      } else if (event.key === 'f' || event.key === 'F' || event.key === '/') {
        event.preventDefault()
        focusSearch()
      } else if (event.key === '?') {
        state.openHelp()
      } else if (event.key === 'j' || event.key === 'J' || event.key === 'k' || event.key === 'K') {
        moveSelection(event.key.toLowerCase() === 'j' ? 1 : -1)
      } else if (event.key === 'Enter' && state.selectedTaskId) {
        event.preventDefault()
        state.selectTask(state.selectedTaskId, true)
      } else if (['1', '2', '3', '4', '5'].includes(event.key)) {
        moveColumn(Number(event.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

function orderedVisible() {
  const state = useQuest.getState()
  const tasks = visibleTasks(state)
  if (state.view === 'board') {
    return STATUSES.flatMap((status) => tasks.filter((task) => task.status === status))
  }
  return tasks
}

function moveSelection(delta: number) {
  const state = useQuest.getState()
  const tasks = orderedVisible()
  if (!tasks.length) return
  const current = tasks.findIndex((task) => task.id === state.selectedTaskId)
  const next = tasks[current === -1 ? (delta > 0 ? 0 : tasks.length - 1) : Math.min(tasks.length - 1, Math.max(0, current + delta))]
  if (next) state.selectTask(next.id, state.drawerOpen)
}

function moveColumn(index: number) {
  const state = useQuest.getState()
  const status = STATUSES[index] as Status
  if (!state.selectedTaskId) {
    state.toast('Önce bir görev seç')
    return
  }
  const task = state.tasks.find((item) => item.id === state.selectedTaskId)
  if (!task || task.status === status) return
  const column = state.tasks.filter((item) => item.projectId === task.projectId && item.status === status)
  const position = column.reduce((max, item) => Math.max(max, item.position), 0) + 1000
  state.moveTask(task.id, status, position)
  state.toast(`${task.key} → ${STATUS_META[status].label}`)
}
