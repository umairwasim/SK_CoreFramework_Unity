import { create } from 'zustand'
import {
  all,
  insertBuild,
  insertMilestone,
  insertTask,
  isMemoryOnly,
  openDatabase,
  putSetting,
  readSnapshot,
  replaceAll,
  run,
  schedulePersist,
  tx,
  wipeDatabase,
  type Snapshot,
} from './db.ts'
import { hooks } from './integrations.ts'
import { downloadText } from './lib/files.ts'
import {
  csvEscape,
  nowIso,
  prefixFromName,
  slugFile,
  taskMatches,
  uid,
} from './lib/format.ts'
import {
  PRIORITY_META,
  STATUS_META,
  TYPE_META,
  emptyFilters,
  type Activity,
  type ConfirmState,
  type Filters,
  type Milestone,
  type MilestoneModal,
  type MilestoneStatus,
  type Priority,
  type Project,
  type ProjectModal,
  type Status,
  type Task,
  type TaskType,
  type Toast,
  type ViewId,
} from './types.ts'

type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'description'
    | 'type'
    | 'status'
    | 'priority'
    | 'assignee'
    | 'milestoneId'
    | 'buildFound'
    | 'buildFixed'
    | 'position'
  >
>

type State = Snapshot & {
  ready: boolean
  error: string | null
  memoryOnly: boolean
  view: ViewId
  selectedTaskId: string | null
  drawerOpen: boolean
  filters: Filters
  filterOpen: boolean
  paletteOpen: boolean
  quickCreateOpen: boolean
  quickCreateStatus: Status
  helpOpen: boolean
  projectModal: ProjectModal
  milestoneModal: MilestoneModal
  buildPromptOpen: boolean
  confirm: ConfirmState | null
  annotatorId: string | null
  toasts: Toast[]
  sidebarOpen: boolean
  listSort: { key: 'key' | 'title' | 'type' | 'status' | 'priority' | 'assignee' | 'updatedAt'; dir: 'asc' | 'desc' }
  lastType: TaskType
  lastPriority: Priority
}

type Actions = {
  init: () => Promise<void>
  toast: (message: string) => void
  dismissToast: (id: string) => void
  setView: (view: ViewId) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebar: () => void
  selectTask: (id: string | null, openDrawer?: boolean) => void
  closeTop: () => void
  setFilters: (patch: Partial<Filters>) => void
  clearFilters: () => void
  toggleFilterOpen: () => void
  applyPreset: (preset: 'mine' | 'critical' | 'assets' | 'unassigned' | 'review') => void
  openPalette: () => void
  openQuickCreate: (status?: Status) => void
  openHelp: () => void
  openProjectModal: (modal: ProjectModal) => void
  openMilestoneModal: (modal: MilestoneModal) => void
  openBuildPrompt: () => void
  openAnnotator: (id: string) => void
  askConfirm: (confirm: ConfirmState) => void
  setListSort: (key: State['listSort']['key']) => void
  createTask: (input: {
    title: string
    type?: TaskType
    status?: Status
    priority?: Priority
    milestoneId?: string | null
    assignee?: string
    description?: string
  }) => string | null
  updateTask: (id: string, patch: TaskPatch) => void
  moveTask: (id: string, status: Status, position: number) => void
  deleteTask: (id: string) => void
  duplicateTask: (id: string) => void
  createProject: (input: { name: string; prefix: string; color: string; description: string }) => void
  updateProject: (id: string, input: { name: string; prefix: string; color: string; description: string }) => void
  deleteProject: (id: string) => void
  setActiveProject: (id: string) => void
  createMilestone: (input: {
    name: string
    targetDate: string | null
    status: MilestoneStatus
    description: string
  }) => void
  updateMilestone: (
    id: string,
    input: { name: string; targetDate: string | null; status: MilestoneStatus; description: string },
  ) => void
  deleteMilestone: (id: string) => void
  setActiveMilestone: (id: string | null) => void
  addBuild: (name: string) => void
  deleteBuild: (id: string) => void
  setCurrentUser: (name: string) => void
  addAttachment: (taskId: string, file: { name: string; type: string; dataUrl: string }) => void
  removeAttachment: (id: string) => void
  saveAnnotations: (id: string, annotations: AttachmentAnnotations, dataUrl: string) => void
  exportJson: () => void
  exportCsv: () => void
  importBackup: (text: string) => void
  resetDemo: () => Promise<void>
}

type AttachmentAnnotations = import('./types.ts').Annotation[]

const COLUMN_MAP: Record<keyof TaskPatch, string> = {
  title: 'title',
  description: 'description',
  type: 'type',
  status: 'status',
  priority: 'priority',
  assignee: 'assignee',
  milestoneId: 'milestone_id',
  buildFound: 'build_found',
  buildFixed: 'build_fixed',
  position: 'position',
}

function fire(fn: () => void) {
  try {
    fn()
  } catch (error) {
    console.error('QuestBoard entegrasyon kancası hata verdi.', error)
  }
}

function logActivity(taskId: string, text: string) {
  run('INSERT INTO activity (id, task_id, text, created_at) VALUES (?, ?, ?, ?)', [uid('act'), taskId, text, nowIso()])
}

function syncToHub(snap: Snapshot) {
  if (typeof window === 'undefined') return
  try {
    const tasks = snap.tasks || []
    const inProg = tasks.filter((t) => t.status === 'in_progress').length
    const completed = tasks.filter((t) => t.status === 'done').length
    const criticalBugs = tasks.filter(
      (t) => t.type === 'bug' && (t.priority === 'critical' || t.priority === 'high'),
    ).length
    const sprintPct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0

    const questTelemetry = {
      total: tasks.length,
      inProgress: inProg,
      completed,
      criticalBugs,
      sprintProgress: sprintPct,
    }

    try {
      const current = localStorage.getItem('skcore_hub_telemetry')
      const telem = current ? JSON.parse(current) : {}
      telem.quest = questTelemetry
      localStorage.setItem('skcore_hub_telemetry', JSON.stringify(telem))

      // Sync active tasks to quick tasks
      const quick = tasks.slice(0, 30).map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status === 'done' ? 'done' : t.status === 'in_progress' ? 'in-progress' : 'todo',
        category: t.type.toUpperCase(),
      }))
      localStorage.setItem('skcore_quick_tasks', JSON.stringify(quick))
    } catch {}

    try {
      if (typeof window.BroadcastChannel === 'function') {
        const bc = new BroadcastChannel('skcore_bus')
        bc.postMessage({
          type: 'TELEMETRY_UPDATED',
          payload: { system: 'quest', data: questTelemetry },
          timestamp: Date.now(),
        })
        bc.close()
      }
    } catch {}
  } catch {}
}

export const useQuest = create<State & Actions>((set, get) => {
  const sync = (extra: Partial<State> = {}) => {
    schedulePersist()
    const snap = readSnapshot()
    syncToHub(snap)
    set({ ...snap, memoryOnly: isMemoryOnly(), ...extra })
  }

  return {
    projects: [],
    milestones: [],
    tasks: [],
    attachments: [],
    builds: [],
    activity: [],
    settings: { currentUser: 'Developer', activeProjectId: '', activeMilestoneId: null },
    ready: false,
    error: null,
    memoryOnly: false,
    view: 'board',
    selectedTaskId: null,
    drawerOpen: false,
    filters: emptyFilters(),
    filterOpen: false,
    paletteOpen: false,
    quickCreateOpen: false,
    quickCreateStatus: 'backlog',
    helpOpen: false,
    projectModal: null,
    milestoneModal: null,
    buildPromptOpen: false,
    confirm: null,
    annotatorId: null,
    toasts: [],
    sidebarOpen: true,
    listSort: { key: 'updatedAt', dir: 'desc' },
    lastType: 'bug',
    lastPriority: 'medium',

    init: async () => {
      if (get().ready) return
      try {
        await openDatabase()
        const snap = readSnapshot()
        syncToHub(snap)
        set({ ...snap, ready: true, error: null, memoryOnly: isMemoryOnly() })
      } catch (error) {
        set({
          error: error instanceof Error ? error.message : 'Yerel veritabanı açılamadı',
          ready: false,
        })
      }
    },

    toast: (message) => {
      const id = uid('toast')
      set((state) => ({ toasts: [...state.toasts, { id, message }] }))
      window.setTimeout(() => get().dismissToast(id), 2600)
    },
    dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),

    setView: (view) => set({ view, paletteOpen: false }),
    setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    selectTask: (id, openDrawer = false) =>
      set({ selectedTaskId: id, drawerOpen: openDrawer ? Boolean(id) : get().drawerOpen && Boolean(id) }),
    closeTop: () => {
      const state = get()
      if (state.annotatorId) return set({ annotatorId: null })
      if (state.confirm) return set({ confirm: null })
      if (state.helpOpen) return set({ helpOpen: false })
      if (state.projectModal) return set({ projectModal: null })
      if (state.milestoneModal) return set({ milestoneModal: null })
      if (state.buildPromptOpen) return set({ buildPromptOpen: false })
      if (state.paletteOpen) return set({ paletteOpen: false })
      if (state.quickCreateOpen) return set({ quickCreateOpen: false })
      if (state.filterOpen) return set({ filterOpen: false })
      if (state.drawerOpen) return set({ drawerOpen: false })
      if (state.selectedTaskId) set({ selectedTaskId: null })
    },
    setFilters: (patch) => set((state) => ({ filters: { ...state.filters, ...patch } })),
    clearFilters: () => set({ filters: emptyFilters() }),
    toggleFilterOpen: () => set((state) => ({ filterOpen: !state.filterOpen })),
    applyPreset: (preset) => {
      const next = emptyFilters()
      if (preset === 'mine') next.assignee = 'me'
      if (preset === 'critical') {
        next.types = ['bug']
        next.priorities = ['critical']
      }
      if (preset === 'assets') next.types = ['asset']
      if (preset === 'unassigned') next.assignee = 'unassigned'
      if (preset === 'review') next.statuses = ['review']
      set({ filters: next, view: 'board', filterOpen: false, paletteOpen: false })
    },
    openPalette: () => set({ paletteOpen: true, quickCreateOpen: false }),
    openQuickCreate: (status = 'backlog') =>
      set({ quickCreateOpen: true, quickCreateStatus: status, paletteOpen: false }),
    openHelp: () => set({ helpOpen: true, paletteOpen: false }),
    openProjectModal: (projectModal) => set({ projectModal, paletteOpen: false }),
    openMilestoneModal: (milestoneModal) => set({ milestoneModal, paletteOpen: false }),
    openBuildPrompt: () => set({ buildPromptOpen: true, paletteOpen: false }),
    openAnnotator: (annotatorId) => set({ annotatorId }),
    askConfirm: (confirm) => set({ confirm }),
    setListSort: (key) =>
      set((state) => ({
        listSort:
          state.listSort.key === key
            ? { key, dir: state.listSort.dir === 'asc' ? 'desc' : 'asc' }
            : { key, dir: key === 'title' || key === 'key' || key === 'assignee' ? 'asc' : 'desc' },
      })),

    createTask: (input) => {
      const title = input.title.trim()
      if (!title) {
        get().toast('Bir başlık gerekli')
        return null
      }
      const state = get()
      const projectId = state.settings.activeProjectId
      if (!projectId) return null
      const type = input.type ?? state.lastType
      const priority = input.priority ?? state.lastPriority
      const status = input.status ?? state.quickCreateStatus
      const id = uid('task')
      const key = nextKey(projectId)
      const created = nowIso()
      const item: Task = {
        id,
        key,
        projectId,
        milestoneId: input.milestoneId === undefined ? state.settings.activeMilestoneId : input.milestoneId,
        title,
        description: input.description ?? '',
        type,
        status,
        priority,
        assignee: input.assignee ?? '',
        buildFound: '',
        buildFixed: '',
        position: nextPosition(projectId, status),
        createdAt: created,
        updatedAt: created,
      }
      tx(() => {
        insertTask(item)
        logActivity(id, 'Görev oluşturuldu')
      })
      sync({
        selectedTaskId: id,
        quickCreateOpen: false,
        lastType: type,
        lastPriority: priority,
      })
      const fresh = get().tasks.find((task) => task.id === id)
      if (fresh) {
        fire(() => hooks.onTaskCreated(fresh))
        if (fresh.type === 'bug' && fresh.priority === 'critical') fire(() => hooks.onCriticalBugCreated(fresh))
      }
      get().toast(`${key} eklendi`)
      return id
    },

    updateTask: (id, patch) => {
      const prev = get().tasks.find((task) => task.id === id)
      if (!prev) return
      if (patch.status && patch.status !== prev.status && patch.position === undefined) {
        patch = { ...patch, position: nextPosition(prev.projectId, patch.status) }
      }
      const sets: string[] = []
      const params: Array<string | number | null> = []
      for (const key of Object.keys(patch) as (keyof TaskPatch)[]) {
        sets.push(`${COLUMN_MAP[key]} = ?`)
        const value = patch[key]
        params.push(value === undefined ? null : value)
      }
      if (!sets.length) return
      const updatedAt = nowIso()
      sets.push('updated_at = ?')
      params.push(updatedAt, id)
      tx(() => {
        run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params)
        writeDiff(prev, patch)
      })
      sync()
      const fresh = get().tasks.find((task) => task.id === id)
      if (!fresh) return
      if (patch.status && patch.status !== prev.status) {
        fire(() => hooks.onTaskStatusChanged(fresh, prev.status, patch.status as Status))
        return
      }
      const structural = (Object.keys(patch) as (keyof TaskPatch)[]).some((key) => key !== 'position')
      if (structural) fire(() => hooks.onTaskUpdated(fresh))
    },

    moveTask: (id, status, position) => {
      get().updateTask(id, { status, position })
    },

    deleteTask: (id) => {
      const task = get().tasks.find((item) => item.id === id)
      if (!task) return
      tx(() => {
        run('DELETE FROM activity WHERE task_id = ?', [id])
        run('DELETE FROM attachments WHERE task_id = ?', [id])
        run('DELETE FROM tasks WHERE id = ?', [id])
      })
      const selected = get().selectedTaskId === id
      sync({
        selectedTaskId: selected ? null : get().selectedTaskId,
        drawerOpen: selected ? false : get().drawerOpen,
        confirm: null,
      })
      fire(() => hooks.onTaskDeleted(task))
      get().toast(`${task.key} silindi`)
    },

    duplicateTask: (id) => {
      const source = get().tasks.find((task) => task.id === id)
      if (!source) return
      get().createTask({
        title: `${source.title} (kopya)`,
        type: source.type,
        status: 'backlog',
        priority: source.priority,
        milestoneId: source.milestoneId,
        assignee: source.assignee,
        description: source.description,
      })
    },

    createProject: (input) => {
      const name = input.name.trim()
      if (!name) return
      const id = uid('proj')
      const createdAt = nowIso()
      run(
        'INSERT INTO projects (id, name, prefix, color, description, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, input.prefix.trim().toUpperCase() || prefixFromName(name), input.color, input.description.trim(), createdAt],
      )
      putSetting('active_project_id', id)
      putSetting('active_milestone_id', '')
      sync({
        projectModal: null,
        filters: emptyFilters(),
        selectedTaskId: null,
        drawerOpen: false,
        view: 'board',
      })
      get().toast(`${name} açıldı`)
    },

    updateProject: (id, input) => {
      run('UPDATE projects SET name = ?, prefix = ?, color = ?, description = ? WHERE id = ?', [
        input.name.trim(),
        input.prefix.trim().toUpperCase() || 'QB',
        input.color,
        input.description.trim(),
        id,
      ])
      sync({ projectModal: null })
    },

    deleteProject: (id) => {
      if (get().projects.length < 2) {
        get().toast('Son proje silinemez')
        return
      }
      const next = get().projects.find((project) => project.id !== id)
      tx(() => {
        const taskIds = all('SELECT id FROM tasks WHERE project_id = ?', [id]).map((row) => String(row.id))
        for (const taskId of taskIds) {
          run('DELETE FROM activity WHERE task_id = ?', [taskId])
          run('DELETE FROM attachments WHERE task_id = ?', [taskId])
        }
        run('DELETE FROM tasks WHERE project_id = ?', [id])
        run('DELETE FROM milestones WHERE project_id = ?', [id])
        run('DELETE FROM builds WHERE project_id = ?', [id])
        run('DELETE FROM projects WHERE id = ?', [id])
        if (next) {
          putSetting('active_project_id', next.id)
          putSetting('active_milestone_id', '')
        }
      })
      sync({ projectModal: null, confirm: null, filters: emptyFilters(), selectedTaskId: null, drawerOpen: false })
    },

    setActiveProject: (id) => {
      putSetting('active_project_id', id)
      putSetting('active_milestone_id', '')
      sync({ filters: emptyFilters(), selectedTaskId: null, drawerOpen: false, view: 'board' })
    },

    createMilestone: (input) => {
      const projectId = get().settings.activeProjectId
      const name = input.name.trim()
      if (!projectId || !name) return
      const id = uid('ms')
      const milestone: Milestone = {
        id,
        projectId,
        name,
        targetDate: input.targetDate,
        status: input.status,
        description: input.description.trim(),
      }
      tx(() => {
        if (input.status === 'active') {
          run(`UPDATE milestones SET status = 'planned' WHERE project_id = ? AND status = 'active'`, [projectId])
        }
        insertMilestone(milestone)
        putSetting('active_milestone_id', id)
      })
      sync({ milestoneModal: null })
      if (input.status === 'completed') fire(() => hooks.onMilestoneCompleted(milestone))
      get().toast(`${name} eklendi`)
    },

    updateMilestone: (id, input) => {
      const prev = get().milestones.find((item) => item.id === id)
      if (!prev) return
      tx(() => {
        if (input.status === 'active') {
          run(`UPDATE milestones SET status = 'planned' WHERE project_id = ? AND status = 'active' AND id != ?`, [
            prev.projectId,
            id,
          ])
        }
        run('UPDATE milestones SET name = ?, target_date = ?, status = ?, description = ? WHERE id = ?', [
          input.name.trim(),
          input.targetDate,
          input.status,
          input.description.trim(),
          id,
        ])
      })
      sync({ milestoneModal: null })
      if (prev.status !== 'completed' && input.status === 'completed') {
        const fresh = get().milestones.find((item) => item.id === id)
        if (fresh) fire(() => hooks.onMilestoneCompleted(fresh))
      }
    },

    deleteMilestone: (id) => {
      const milestone = get().milestones.find((item) => item.id === id)
      tx(() => {
        run('UPDATE tasks SET milestone_id = NULL WHERE milestone_id = ?', [id])
        run('DELETE FROM milestones WHERE id = ?', [id])
        if (get().settings.activeMilestoneId === id) putSetting('active_milestone_id', '')
      })
      sync({ confirm: null, milestoneModal: null })
      if (milestone) get().toast(`${milestone.name} silindi`)
    },

    setActiveMilestone: (id) => {
      putSetting('active_milestone_id', id ?? '')
      sync()
    },

    addBuild: (name) => {
      const trimmed = name.trim()
      const projectId = get().settings.activeProjectId
      if (!trimmed || !projectId) return
      if (get().builds.some((item) => item.projectId === projectId && item.name === trimmed)) {
        get().toast('Bu derleme zaten var')
        set({ buildPromptOpen: false })
        return
      }
      insertBuild({ id: uid('bld'), projectId, name: trimmed, createdAt: nowIso() })
      sync({ buildPromptOpen: false })
      get().toast(`${trimmed} eklendi`)
    },

    deleteBuild: (id) => {
      run('DELETE FROM builds WHERE id = ?', [id])
      sync()
    },

    setCurrentUser: (name) => {
      putSetting('current_user', name.trim() || 'Ege')
      sync()
    },

    addAttachment: (taskId, file) => {
      const id = uid('att')
      run(
        `INSERT INTO attachments (
          id, task_id, file_path, file_type, data_url, original_data_url, annotations, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, taskId, file.name, file.type, file.dataUrl, file.dataUrl, '[]', nowIso()],
      )
      logActivity(taskId, `Ek: ${file.name}`)
      sync()
      const task = get().tasks.find((item) => item.id === taskId)
      if (task) fire(() => hooks.onAttachmentAdded(task, file.name))
    },

    removeAttachment: (id) => {
      run('DELETE FROM attachments WHERE id = ?', [id])
      sync({ annotatorId: get().annotatorId === id ? null : get().annotatorId })
    },

    saveAnnotations: (id, annotations, dataUrl) => {
      run('UPDATE attachments SET annotations = ?, data_url = ? WHERE id = ?', [
        JSON.stringify(annotations),
        dataUrl,
        id,
      ])
      sync({ annotatorId: null })
      get().toast('İşaretleme kaydedildi')
    },

    exportJson: () => {
      const state = get()
      const project = state.projects.find((item) => item.id === state.settings.activeProjectId)
      const payload = {
        version: 1,
        exportedAt: nowIso(),
        projects: state.projects,
        milestones: state.milestones,
        tasks: state.tasks,
        attachments: state.attachments,
        builds: state.builds,
        activity: state.activity,
        settings: state.settings,
      }
      downloadText(
        `${slugFile(project?.name ?? 'questboard')}-questboard.json`,
        JSON.stringify(payload, null, 2),
        'application/json',
      )
      get().toast('JSON yedeği indirildi')
    },

    exportCsv: () => {
      const state = get()
      const project = state.projects.find((item) => item.id === state.settings.activeProjectId)
      const rows = state.tasks.filter((task) => task.projectId === state.settings.activeProjectId)
      const header = [
        'key',
        'title',
        'type',
        'status',
        'priority',
        'assignee',
        'milestone',
        'build_found',
        'build_fixed',
        'created_at',
        'updated_at',
        'description',
      ]
      const lines = [header.join(',')]
      for (const task of rows) {
        const milestone = state.milestones.find((item) => item.id === task.milestoneId)
        lines.push(
          [
            task.key,
            task.title,
            task.type,
            task.status,
            task.priority,
            task.assignee,
            milestone?.name ?? '',
            task.buildFound,
            task.buildFixed,
            task.createdAt,
            task.updatedAt,
            task.description,
          ]
            .map((value) => csvEscape(value))
            .join(','),
        )
      }
      downloadText(
        `${slugFile(project?.name ?? 'gorevler')}-gorevler.csv`,
        `\uFEFF${lines.join('\n')}`,
        'text/csv;charset=utf-8',
      )
      get().toast('CSV indirildi')
    },

    importBackup: (text) => {
      const data = JSON.parse(text) as {
        version?: number
        projects?: Project[]
        milestones?: Milestone[]
        tasks?: Task[]
        attachments?: Snapshot['attachments']
        builds?: Snapshot['builds']
        activity?: Activity[]
        settings?: Snapshot['settings']
      }
      if (data.version !== 1 || !Array.isArray(data.projects) || !Array.isArray(data.tasks)) {
        throw new Error('Bu dosya QuestBoard yedeği değil')
      }
      replaceAll({
        projects: data.projects,
        milestones: data.milestones ?? [],
        tasks: data.tasks,
        attachments: data.attachments ?? [],
        builds: data.builds ?? [],
        activity: data.activity ?? [],
        settings: data.settings ?? {
          currentUser: 'Ege',
          activeProjectId: data.projects[0]?.id ?? '',
          activeMilestoneId: null,
        },
      })
      sync({ confirm: null, filters: emptyFilters(), selectedTaskId: null, drawerOpen: false })
      get().toast('Yedek yüklendi')
    },

    resetDemo: async () => {
      await wipeDatabase()
      await openDatabase()
      set({
        ...readSnapshot(),
        ready: true,
        confirm: null,
        filters: emptyFilters(),
        selectedTaskId: null,
        drawerOpen: false,
        view: 'board',
        memoryOnly: isMemoryOnly(),
      })
      get().toast('Örnek Kor Yolu yüklendi')
    },
  }
})

function writeDiff(prev: Task, patch: TaskPatch) {
  if (patch.status && patch.status !== prev.status) {
    logActivity(prev.id, `Durum: ${STATUS_META[prev.status].label} → ${STATUS_META[patch.status].label}`)
  }
  if (patch.priority && patch.priority !== prev.priority) {
    logActivity(prev.id, `Öncelik: ${PRIORITY_META[patch.priority].label}`)
  }
  if (patch.type && patch.type !== prev.type) {
    logActivity(prev.id, `Tür: ${TYPE_META[patch.type].label}`)
  }
  if (patch.assignee !== undefined && patch.assignee !== prev.assignee) {
    logActivity(prev.id, patch.assignee ? `${patch.assignee} atandı` : 'Atama kaldırıldı')
  }
  if (patch.milestoneId !== undefined && patch.milestoneId !== prev.milestoneId) {
    const name = patch.milestoneId
      ? String(all('SELECT name FROM milestones WHERE id = ?', [patch.milestoneId])[0]?.name ?? 'Milestone')
      : ''
    logActivity(prev.id, name ? `Milestone: ${name}` : 'Milestone kaldırıldı')
  }
  if (patch.buildFound !== undefined && patch.buildFound !== prev.buildFound) {
    logActivity(prev.id, patch.buildFound ? `Bulunduğu derleme: ${patch.buildFound}` : 'Bulunduğu derleme temizlendi')
  }
  if (patch.buildFixed !== undefined && patch.buildFixed !== prev.buildFixed) {
    logActivity(prev.id, patch.buildFixed ? `Çözüldüğü derleme: ${patch.buildFixed}` : 'Çözüldüğü derleme temizlendi')
  }
}

function nextKey(projectId: string) {
  const project = all('SELECT prefix FROM projects WHERE id = ?', [projectId])[0]
  const prefix = String(project?.prefix || 'QB')
  const rows = all('SELECT key FROM tasks WHERE project_id = ?', [projectId])
  let max = 0
  for (const row of rows) {
    const match = String(row.key).match(/(\d+)$/)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `${prefix}-${max + 1}`
}

function nextPosition(projectId: string, status: string) {
  const rows = all('SELECT COALESCE(MAX(position), 0) AS m FROM tasks WHERE project_id = ? AND status = ?', [
    projectId,
    status,
  ])
  return Number(rows[0]?.m ?? 0) + 1000
}

export function visibleTasks(state: Pick<State, 'tasks' | 'filters' | 'settings' | 'milestones'>) {
  return state.tasks
    .filter((task) => task.projectId === state.settings.activeProjectId)
    .filter((task) => taskMatches(task, state.filters, state.settings.currentUser, state.milestones))
    .sort((a, b) => a.position - b.position || a.key.localeCompare(b.key, 'tr'))
}

export function activeProject(state: Pick<State, 'projects' | 'settings'>) {
  return state.projects.find((project) => project.id === state.settings.activeProjectId) ?? state.projects[0]
}

export function projectMilestones(state: Pick<State, 'milestones' | 'settings'>) {
  return state.milestones.filter((item) => item.projectId === state.settings.activeProjectId)
}

export function projectBuilds(state: Pick<State, 'builds' | 'settings'>) {
  return state.builds.filter((item) => item.projectId === state.settings.activeProjectId)
}

export function resolveActiveMilestone(state: Pick<State, 'milestones' | 'settings'>) {
  const list = projectMilestones(state)
  if (state.settings.activeMilestoneId) {
    const found = list.find((item) => item.id === state.settings.activeMilestoneId)
    if (found) return found
  }
  return list.find((item) => item.status === 'active') ?? list[0] ?? null
}

export function focusSearch() {
  const input = document.getElementById('quest-search')
  if (input instanceof HTMLInputElement) {
    input.focus()
    input.select()
  }
}

