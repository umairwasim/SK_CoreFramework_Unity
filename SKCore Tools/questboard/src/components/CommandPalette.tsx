import { useEffect, useMemo, useRef, useState } from 'react'
import { fold } from '../lib/format.ts'
import { activeProject, useQuest, visibleTasks } from '../store.ts'
import { STATUS_META } from '../types.ts'

type Command = { id: string; section: string; label: string; hint?: string; run: () => void }

export function CommandPalette() {
  const open = useQuest((s) => s.paletteOpen)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const closeTop = useQuest((s) => s.closeTop)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setIndex(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(timer)
  }, [open])

  const commands = useMemo(() => (open ? buildCommands(query) : []), [open, query, useQuest((s) => s.tasks), useQuest((s) => s.projects)])
  useEffect(() => setIndex(0), [query])

  useEffect(() => {
    const node = listRef.current?.querySelector('[data-active="true"]')
    if (node instanceof HTMLElement) node.scrollIntoView({ block: 'nearest' })
  }, [index, commands.length])

  if (!open) return null
  const active = commands[Math.min(index, Math.max(commands.length - 1, 0))]
  const searching = query.trim().length > 0
  let lastSection = ''

  return (
    <>
      <div className="overlay-backdrop" onClick={closeTop} />
      <div className="palette" role="dialog" aria-label="Komut paleti">
        <input
          ref={inputRef}
          value={query}
          placeholder="Görev, komut veya milestone ara"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setIndex((value) => Math.min(value + 1, commands.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setIndex((value) => Math.max(value - 1, 0))
            } else if (event.key === 'Enter' && active) {
              event.preventDefault()
              active.run()
            }
          }}
        />
        <div className="palette-list" ref={listRef}>
          {commands.map((command, commandIndex) => {
            const show = command.section !== lastSection
            lastSection = command.section
            return (
              <div key={command.id}>
                {show && !searching && <div className="cmd-section">{command.section}</div>}
                <button
                  type="button"
                  className={commandIndex === index ? 'cmd active' : 'cmd'}
                  data-active={commandIndex === index}
                  onMouseEnter={() => setIndex(commandIndex)}
                  onClick={command.run}
                >
                  {command.label}
                  {command.hint && <small>{command.hint}</small>}
                </button>
              </div>
            )
          })}
          {commands.length === 0 && <div className="cmd-section">Sonuç yok</div>}
        </div>
        <div className="palette-foot">
          <span>{activeProject(useQuest.getState())?.name} · yerel</span>
          <span>↑↓ seç · Enter çalıştır · Esc kapat</span>
        </div>
      </div>
    </>
  )
}

function score(text: string, query: string) {
  const q = fold(query.trim())
  if (!q) return 1
  const hay = fold(text)
  if (hay.startsWith(q)) return 3
  if (hay.includes(q)) return 2
  const tokens = q.split(/\s+/).filter(Boolean)
  return tokens.every((token) => hay.includes(token)) ? 1 : 0
}

function buildCommands(query: string): Command[] {
  const state = useQuest.getState()
  const close = () => useQuest.setState({ paletteOpen: false })
  const commands: Command[] = [
    { id: 'new-task', section: 'Oluştur', label: 'Yeni görev', hint: 'N', run: () => state.openQuickCreate('backlog') },
    { id: 'new-project', section: 'Oluştur', label: 'Yeni proje', run: () => state.openProjectModal({ mode: 'create' }) },
    { id: 'new-ms', section: 'Oluştur', label: 'Yeni milestone', run: () => state.openMilestoneModal({ mode: 'create' }) },
    { id: 'new-build', section: 'Oluştur', label: 'Yeni derleme', run: () => state.openBuildPrompt() },
    { id: 'view-board', section: 'Görünüm', label: 'Pano', run: () => { state.setView('board'); close() } },
    { id: 'view-list', section: 'Görünüm', label: 'Liste', run: () => { state.setView('list'); close() } },
    { id: 'view-ms', section: 'Görünüm', label: 'Milestone’lar', run: () => { state.setView('milestones'); close() } },
    { id: 'filter-clear', section: 'Filtre', label: 'Filtreleri temizle', run: () => { state.clearFilters(); close() } },
    { id: 'filter-mine', section: 'Filtre', label: 'Bana atananlar', run: () => state.applyPreset('mine') },
    { id: 'filter-crit', section: 'Filtre', label: 'Kritik hatalar', run: () => state.applyPreset('critical') },
    { id: 'filter-asset', section: 'Filtre', label: 'Asset görevleri', run: () => state.applyPreset('assets') },
    { id: 'filter-none', section: 'Filtre', label: 'Atanmamış görevler', run: () => state.applyPreset('unassigned') },
    { id: 'filter-review', section: 'Filtre', label: 'İncelemedekiler', run: () => state.applyPreset('review') },
    { id: 'json', section: 'Veri', label: 'JSON yedeği indir', run: () => { state.exportJson(); close() } },
    { id: 'csv', section: 'Veri', label: 'CSV indir', run: () => { state.exportCsv(); close() } },
    {
      id: 'import',
      section: 'Veri',
      label: 'Yedek yükle',
      run: () => {
        close()
        document.getElementById('backup-file')?.click()
      },
    },
    { id: 'help', section: 'Yardım', label: 'Kısayollar', hint: '?', run: () => state.openHelp() },
  ]
  const selected = state.tasks.find((task) => task.id === state.selectedTaskId)
  if (selected) {
    commands.unshift(
      {
        id: 'done',
        section: 'Seçili görev',
        label: `${selected.key} tamamlandı işaretle`,
        run: () => {
          state.updateTask(selected.id, { status: 'done' })
          close()
        },
      },
      {
        id: 'dup',
        section: 'Seçili görev',
        label: `${selected.key} çoğalt`,
        run: () => {
          state.duplicateTask(selected.id)
          close()
        },
      },
    )
  }
  if (query.trim()) {
    for (const task of visibleTasks(state).concat(state.tasks.filter((task) => task.projectId === state.settings.activeProjectId))) {
      if (commands.some((command) => command.id === task.id)) continue
      commands.push({
        id: task.id,
        section: 'Görevler',
        label: `${task.key}  ${task.title}`,
        hint: STATUS_META[task.status].label,
        run: () => {
          state.selectTask(task.id, true)
          close()
        },
      })
    }
    for (const milestone of state.milestones.filter((item) => item.projectId === state.settings.activeProjectId)) {
      commands.push({
        id: milestone.id,
        section: 'Milestone',
        label: milestone.name,
        run: () => {
          state.setActiveMilestone(milestone.id)
          state.setFilters({ milestoneId: milestone.id })
          state.setView('board')
          close()
        },
      })
    }
    for (const project of state.projects) {
      commands.push({
        id: project.id,
        section: 'Projeler',
        label: project.name,
        run: () => {
          state.setActiveProject(project.id)
          close()
        },
      })
    }
  }
  return commands
    .map((command) => ({ command, rank: score(`${command.label} ${command.section}`, query) }))
    .filter((item) => item.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .map((item) => item.command)
}
