import { DragDropContext, Draggable, Droppable, type DropResult } from '@hello-pangea/dnd'
import { cx } from '../lib/format.ts'
import { useQuest, visibleTasks } from '../store.ts'
import { STATUSES, STATUS_META, filtersActive, type Status } from '../types.ts'
import { Icon } from './Icons.tsx'
import { Avatar, PriorityMarks, TypeChip } from './ui.tsx'

export function Board() {
  const tasks = useQuest((s) => s.tasks)
  const filters = useQuest((s) => s.filters)
  const settings = useQuest((s) => s.settings)
  const milestones = useQuest((s) => s.milestones)
  const attachments = useQuest((s) => s.attachments)
  const selectedTaskId = useQuest((s) => s.selectedTaskId)
  const selectTask = useQuest((s) => s.selectTask)
  const moveTask = useQuest((s) => s.moveTask)
  const openQuickCreate = useQuest((s) => s.openQuickCreate)
  const visible = visibleTasks({ tasks, filters, settings, milestones })

  const onDragEnd = (result: DropResult) => {
    const destination = result.destination
    if (!destination) return
    if (destination.droppableId === result.source.droppableId && destination.index === result.source.index) return
    const status = destination.droppableId as Status
    const column = visible.filter((task) => task.status === status && task.id !== result.draggableId)
    const before = column[destination.index - 1]
    const after = column[destination.index]
    let position = 1000
    if (!before && after) position = after.position - 1000
    else if (before && !after) position = before.position + 1000
    else if (before && after) position = (before.position + after.position) / 2
    moveTask(result.draggableId, status, position)
  }

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="board-scroll">
        <div className="board">
          {STATUSES.map((status) => {
            const column = visible.filter((task) => task.status === status)
            return (
              <Droppable droppableId={status} key={status}>
                {(provided, snapshot) => (
                  <section className={cx('column', snapshot.isDraggingOver && 'is-over')} data-status={status}>
                    <header className="column-head">
                      <kbd>{STATUS_META[status].key}</kbd>
                      <div>
                        <h2>{STATUS_META[status].label}</h2>
                        <p>{STATUS_META[status].hint}</p>
                      </div>
                      <span className="column-count">{column.length}</span>
                      <button
                        className="icon-hit"
                        type="button"
                        aria-label={`${STATUS_META[status].label} sütununa görev`}
                        onClick={() => openQuickCreate(status)}
                      >
                        <Icon name="plus" size={14} />
                      </button>
                    </header>
                    <div className="column-body" ref={provided.innerRef} {...provided.droppableProps}>
                      {column.length === 0 && (
                        <div className="column-empty">
                          {snapshot.isDraggingOver ? 'Bırak' : filtersActive(filters) ? 'Filtre dışı' : 'Boş'}
                        </div>
                      )}
                      {column.map((task, index) => {
                        const milestone = milestones.find((item) => item.id === task.milestoneId)
                        const files = attachments.filter((item) => item.taskId === task.id).length
                        return (
                          <Draggable draggableId={task.id} index={index} key={task.id}>
                            {(drag, dragSnapshot) => (
                              <article
                                ref={drag.innerRef}
                                {...drag.draggableProps}
                                {...drag.dragHandleProps}
                                className={cx(
                                  'card',
                                  dragSnapshot.isDragging && 'is-dragging',
                                  selectedTaskId === task.id && 'is-selected',
                                  task.status === 'done' && 'is-done',
                                )}
                                data-type={task.type}
                                onClick={() => selectTask(task.id, true)}
                              >
                                <div className="card-top">
                                  <span className="key">{task.key}</span>
                                  <TypeChip type={task.type} />
                                  <PriorityMarks priority={task.priority} />
                                </div>
                                <h3>{task.title}</h3>
                                <div className="card-meta">
                                  {milestone && <span className="ms-chip grow">{milestone.name}</span>}
                                  {(task.buildFixed || task.buildFound) && (
                                    <span className="build-chip">{task.buildFixed || task.buildFound}</span>
                                  )}
                                  {files > 0 && <Icon name="image" size={13} />}
                                  <Avatar name={task.assignee} />
                                </div>
                              </article>
                            )}
                          </Draggable>
                        )
                      })}
                      {provided.placeholder}
                    </div>
                  </section>
                )}
              </Droppable>
            )
          })}
        </div>
      </div>
    </DragDropContext>
  )
}
