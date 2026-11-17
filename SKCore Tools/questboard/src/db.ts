import { get, set, del } from 'idb-keyval'
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import schemaSql from '../schema.sql?raw'
import { buildSeed, type SeedBundle } from './seed.ts'
import type {
  Activity,
  Annotation,
  Attachment,
  Build,
  Milestone,
  Project,
  Settings,
  Task,
} from './types.ts'

type SqlValue = string | number | Uint8Array | null
type Row = Record<string, SqlValue>

type Statement = {
  bind: (params?: SqlValue[]) => boolean
  step: () => boolean
  getAsObject: () => Row
  free: () => boolean
}

type SqlDatabase = {
  run: (sql: string, params?: SqlValue[]) => unknown
  exec: (sql: string) => unknown
  prepare: (sql: string) => Statement
  export: () => Uint8Array
  close: () => void
}

const STORAGE_KEY = 'questboard-sqlite-v2'
let database: SqlDatabase | null = null
let opening: Promise<void> | null = null
let memoryOnly = false
let saveTimer = 0
let flushHooked = false
let epoch = 0
let io: Promise<void> = Promise.resolve()

function enqueue(task: () => Promise<void>) {
  const run = io.then(task, task)
  io = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function isMemoryOnly() {
  return memoryOnly
}

export function openDatabase() {
  opening ??= doOpen().catch((error: unknown) => {
    opening = null
    throw error
  })
  return opening
}

async function doOpen() {
  let wasmBinary: ArrayBuffer | Uint8Array | undefined
  try {
    if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
      throw new Error('File protocol requires embedded wasm')
    }
    const response = await fetch(wasmUrl)
    if (!response.ok) throw new Error('Fetch failed')
    wasmBinary = await response.arrayBuffer()
  } catch {
    const { wasmBase64 } = await import('./wasm-base64.ts')
    const binStr = atob(wasmBase64)
    const len = binStr.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binStr.charCodeAt(i)
    }
    wasmBinary = bytes
  }
  const SQL = await initSqlJs({ wasmBinary: wasmBinary as any })
  const saved = await get<Uint8Array>(STORAGE_KEY).catch(() => undefined)
  if (saved && saved.byteLength > 0) {
    database = new SQL.Database(saved) as unknown as SqlDatabase
    try {
      const snap = readSnapshot()
      if (snap.projects.length === 0) {
        applySeed(buildSeed())
        await flush()
      }
    } catch {
      database.close()
      database = new SQL.Database() as unknown as SqlDatabase
      database.exec(schemaSql)
      applySeed(buildSeed())
      await flush()
    }
  } else {
    database = new SQL.Database() as unknown as SqlDatabase
    database.exec(schemaSql)
    applySeed(buildSeed())
    await flush()
  }
  hookFlush()
}

function hookFlush() {
  if (flushHooked || typeof window === 'undefined') return
  flushHooked = true
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
  window.addEventListener('pagehide', () => {
    void flush()
  })
}

export function schedulePersist() {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    void flush()
  }, 180)
}

export async function flush() {
  window.clearTimeout(saveTimer)
  const token = epoch
  const current = database
  if (!current) return
  const bytes = current.export()
  await enqueue(async () => {
    if (token !== epoch) return
    try {
      await set(STORAGE_KEY, bytes)
      memoryOnly = false
    } catch {
      memoryOnly = true
    }
  })
}

export async function wipeDatabase() {
  epoch += 1
  window.clearTimeout(saveTimer)
  database?.close()
  database = null
  opening = null
  await enqueue(async () => {
    await del(STORAGE_KEY)
  })
}

function db() {
  if (!database) throw new Error('Veritabanı açık değil')
  return database
}

export function run(sql: string, params: SqlValue[] = []) {
  db().run(sql, params)
}

export function all(sql: string, params: SqlValue[] = []) {
  const statement = db().prepare(sql)
  if (params.length) statement.bind(params)
  const rows: Row[] = []
  while (statement.step()) rows.push(statement.getAsObject())
  statement.free()
  return rows
}

export function tx(fn: () => void) {
  run('BEGIN')
  try {
    fn()
    run('COMMIT')
  } catch (error) {
    try {
      run('ROLLBACK')
    } catch {
      /* yarıda kalan işlem */
    }
    throw error
  }
}

function str(value: SqlValue | undefined) {
  return value == null ? '' : String(value)
}

function num(value: SqlValue | undefined) {
  return typeof value === 'number' ? value : Number(value ?? 0)
}

export type Snapshot = {
  projects: Project[]
  milestones: Milestone[]
  tasks: Task[]
  attachments: Attachment[]
  builds: Build[]
  activity: Activity[]
  settings: Settings
}

export function readSnapshot(): Snapshot {
  return {
    projects: all('SELECT * FROM projects ORDER BY created_at').map(mapProject),
    milestones: all('SELECT * FROM milestones ORDER BY target_date IS NULL, target_date').map(mapMilestone),
    tasks: all('SELECT * FROM tasks ORDER BY position').map(mapTask),
    attachments: all('SELECT * FROM attachments ORDER BY created_at').map(mapAttachment),
    builds: all('SELECT * FROM builds ORDER BY created_at DESC').map(mapBuild),
    activity: all('SELECT * FROM activity ORDER BY created_at DESC').map(mapActivity),
    settings: readSettings(),
  }
}

function mapProject(row: Row): Project {
  return {
    id: str(row.id),
    name: str(row.name),
    prefix: str(row.prefix),
    color: str(row.color),
    description: str(row.description),
    createdAt: str(row.created_at),
  }
}

function mapMilestone(row: Row): Milestone {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    name: str(row.name),
    targetDate: row.target_date ? str(row.target_date) : null,
    status: str(row.status) as Milestone['status'],
    description: str(row.description),
  }
}

function mapTask(row: Row): Task {
  return {
    id: str(row.id),
    key: str(row.key),
    projectId: str(row.project_id),
    milestoneId: row.milestone_id ? str(row.milestone_id) : null,
    title: str(row.title),
    description: str(row.description),
    type: str(row.type) as Task['type'],
    status: str(row.status) as Task['status'],
    priority: str(row.priority) as Task['priority'],
    assignee: str(row.assignee),
    buildFound: str(row.build_found),
    buildFixed: str(row.build_fixed),
    position: num(row.position),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  }
}

function mapAttachment(row: Row): Attachment {
  let annotations: Annotation[] = []
  try {
    const parsed = JSON.parse(str(row.annotations) || '[]') as Annotation[]
    if (Array.isArray(parsed)) annotations = parsed
  } catch {
    annotations = []
  }
  return {
    id: str(row.id),
    taskId: str(row.task_id),
    filePath: str(row.file_path),
    fileType: str(row.file_type),
    dataUrl: str(row.data_url),
    originalDataUrl: str(row.original_data_url) || str(row.data_url),
    annotations,
    createdAt: str(row.created_at),
  }
}

function mapBuild(row: Row): Build {
  return {
    id: str(row.id),
    projectId: str(row.project_id),
    name: str(row.name),
    createdAt: str(row.created_at),
  }
}

function mapActivity(row: Row): Activity {
  return {
    id: str(row.id),
    taskId: str(row.task_id),
    text: str(row.text),
    createdAt: str(row.created_at),
  }
}

function readSettings(): Settings {
  const rows = all('SELECT key, value FROM settings')
  const map = new Map(rows.map((row) => [str(row.key), str(row.value)]))
  return {
    currentUser: map.get('current_user') || 'Ege',
    activeProjectId: map.get('active_project_id') || '',
    activeMilestoneId: map.get('active_milestone_id') || null,
  }
}

export function putSetting(key: string, value: string) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, value],
  )
}

function applySeed(seed: SeedBundle) {
  tx(() => {
    for (const project of seed.projects) {
      run(
        'INSERT INTO projects (id, name, prefix, color, description, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [project.id, project.name, project.prefix, project.color, project.description, project.createdAt],
      )
    }
    for (const milestone of seed.milestones) insertMilestone(milestone)
    for (const item of seed.builds) insertBuild(item)
    for (const item of seed.tasks) insertTask(item)
    for (const item of seed.activity) {
      run('INSERT INTO activity (id, task_id, text, created_at) VALUES (?, ?, ?, ?)', [
        item.id,
        item.taskId,
        item.text,
        item.createdAt,
      ])
    }
    putSetting('current_user', seed.settings.currentUser)
    putSetting('active_project_id', seed.settings.activeProjectId)
    putSetting('active_milestone_id', seed.settings.activeMilestoneId ?? '')
    putSetting('schema_version', '1')
  })
}

export function insertMilestone(milestone: Milestone) {
  run(
    'INSERT INTO milestones (id, project_id, name, target_date, status, description) VALUES (?, ?, ?, ?, ?, ?)',
    [
      milestone.id,
      milestone.projectId,
      milestone.name,
      milestone.targetDate,
      milestone.status,
      milestone.description,
    ],
  )
}

export function insertBuild(item: Build) {
  run('INSERT INTO builds (id, project_id, name, created_at) VALUES (?, ?, ?, ?)', [
    item.id,
    item.projectId,
    item.name,
    item.createdAt,
  ])
}

export function insertTask(item: Task) {
  run(
    `INSERT INTO tasks (
      id, key, project_id, milestone_id, title, description, type, status, priority,
      assignee, build_found, build_fixed, position, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.id,
      item.key,
      item.projectId,
      item.milestoneId,
      item.title,
      item.description,
      item.type,
      item.status,
      item.priority,
      item.assignee,
      item.buildFound,
      item.buildFixed,
      item.position,
      item.createdAt,
      item.updatedAt,
    ],
  )
}

export function replaceAll(seed: SeedBundle) {
  tx(() => {
    run('DELETE FROM activity')
    run('DELETE FROM attachments')
    run('DELETE FROM tasks')
    run('DELETE FROM builds')
    run('DELETE FROM milestones')
    run('DELETE FROM projects')
    run('DELETE FROM settings')
    for (const project of seed.projects) {
      run(
        'INSERT INTO projects (id, name, prefix, color, description, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [project.id, project.name, project.prefix, project.color, project.description, project.createdAt],
      )
    }
    for (const milestone of seed.milestones) insertMilestone(milestone)
    for (const item of seed.builds) insertBuild(item)
    for (const item of seed.tasks) insertTask(item)
    for (const item of seed.attachments) {
      run(
        `INSERT INTO attachments (
          id, task_id, file_path, file_type, data_url, original_data_url, annotations, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.id,
          item.taskId,
          item.filePath,
          item.fileType,
          item.dataUrl,
          item.originalDataUrl,
          JSON.stringify(item.annotations ?? []),
          item.createdAt,
        ],
      )
    }
    for (const item of seed.activity) {
      run('INSERT INTO activity (id, task_id, text, created_at) VALUES (?, ?, ?, ?)', [
        item.id,
        item.taskId,
        item.text,
        item.createdAt,
      ])
    }
    putSetting('current_user', seed.settings.currentUser || 'Ege')
    putSetting('active_project_id', seed.settings.activeProjectId || seed.projects[0]?.id || '')
    putSetting('active_milestone_id', seed.settings.activeMilestoneId ?? '')
    putSetting('schema_version', '1')
  })
}
