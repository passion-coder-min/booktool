import { DndContext, DragEndEvent, useDraggable, useDroppable, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import type { Project, Task, TaskPriority, TaskStatus } from '@booktool/shared'
import { api } from '../api'
import { usePaged } from './usePaged'
import { LoadMore } from './LoadMore'

export const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'blocked', label: '阻塞' },
  { key: 'done', label: '已完成' },
]

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: '待办', doing: '进行中', blocked: '阻塞', done: '已完成' }

/** 紧急程度色（卡片右边 3px） */
export const PRIORITY_COLOR: Record<TaskPriority, string> = {
  low: '#8a94a3',
  normal: '#3d8bfd',
  high: '#e08030',
  urgent: '#d94a4a',
}

export const isOverdue = (t: Task) =>
  t.status !== 'done' && t.due !== null && t.due < todayStr()

export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface Props {
  project: Project
  tasks: Task[]
  onMutated: () => void
  /** 点卡片打开详情/编辑 */
  onOpen?: (task: Task) => void
}

/** 项目任务看板：四列拖拽改状态（列内分页懒加载）；添加统一走清单 checkbox，此处不提供表单 */
export default function KanbanView({ project, tasks, onMutated, onOpen }: Props) {
  // 拖拽需移动 4px 才激活，单击留给"点开详情"
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = async (e: DragEndEvent) => {
    const overId = String(e.over?.id ?? '')
    if (!overId.startsWith('col:')) return
    const status = overId.slice(4) as TaskStatus
    const task = tasks.find((t) => t.id === String(e.active.id))
    if (!task || task.status === status) return
    await api.work.taskUpdate(task.project, task.id, { status })
    onMutated()
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="kanban">
          {COLUMNS.map((col) => (
            <PagedColumn
              key={col.key}
              colKey={col.key}
              label={col.label}
              tasks={tasks.filter((t) => t.status === col.key)}
              renderCard={(t) => (
                <TaskCard key={t.id} task={t} projectColor={project.color} onDeleted={onMutated} onOpen={onOpen} />
              )}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}

/** 看板列：droppable + 分页渲染（大量任务时不一次性铺满 DOM） */
export function PagedColumn({
  colKey,
  label,
  tasks,
  renderCard,
}: {
  colKey: TaskStatus
  label: string
  tasks: Task[]
  renderCard: (t: Task) => React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${colKey}` })
  const { visible, remaining, loadMore } = usePaged(tasks)
  return (
    <div className={`kanban-col${isOver ? ' drag-over' : ''}`} ref={setNodeRef}>
      <div className="kanban-col-title">
        <span>{label}</span>
        <span>{tasks.length}</span>
      </div>
      {visible.map(renderCard)}
      <LoadMore remaining={remaining} onClick={loadMore} />
    </div>
  )
}

/** 可拖拽任务卡：左边 3px = 项目色，右边 3px = 紧急色，重要任务标 ★；点卡片打开详情/编辑 */
export function TaskCard({
  task,
  projectColor,
  projectName,
  onDeleted,
  onOpen,
}: {
  task: Task
  projectColor: string
  /** 跨项目视图（全局看板）显示项目名；单项目视图省略 */
  projectName?: string
  onDeleted: () => void
  onOpen?: (task: Task) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const del = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`删除任务「${task.title}」？`)) {
      await api.work.taskDelete(task.project, task.id)
      onDeleted()
    }
  }
  const cardStyle: React.CSSProperties = {
    boxShadow: `inset 3px 0 0 ${projectColor}, inset -3px 0 0 ${PRIORITY_COLOR[task.priority]}, var(--shadow)`,
  }
  return (
    <div
      className={`task-card${isDragging ? ' dragging' : ''}`}
      style={cardStyle}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      title="拖拽移动；点击编辑详情"
      onClick={() => onOpen?.(task)}
    >
      <div className="t-title">
        {task.importance && <span style={{ color: '#e0a030', marginRight: 4 }}>★</span>}
        {task.title}
      </div>
      <div className="t-meta">
        {projectName && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span className="proj-dot" style={{ background: projectColor, width: 8, height: 8 }} />
            {projectName}
          </span>
        )}
        <span className={`badge ${task.priority}`}>
          {{ low: '低', normal: '普通', high: '高', urgent: '紧急' }[task.priority]}
        </span>
        {task.due && (
          <span className={`badge ${isOverdue(task) ? 'overdue' : task.status === 'done' ? 'done' : ''}`}>
            {isOverdue(task) ? '逾期 ' : ''}
            {task.due}
          </span>
        )}
        {task.scheduled && <span>📅{task.scheduled}</span>}
        {task.tags.map((tag) => (
          <span key={tag} className="tag">
            {tag}
          </span>
        ))}
        <button className="t-del" onClick={del} title="删除">
          ✕
        </button>
      </div>
    </div>
  )
}
