import { useMemo, useState } from 'react'
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import type { Project, Task } from '@booktool/shared'
import { api } from '../api'
import { todayStr } from './KanbanView'

interface Props {
  project: Project
  tasks: Task[]
  onMutated: () => void
  /** 双击日期格 → 打开新建任务弹窗（参数为 YYYY-MM-DD 计划日） */
  onAddTask?: (date: string) => void
  /** 点击已存在任务卡片 → 打开详情弹窗 */
  onTaskClick?: (task: Task) => void
}

const DOW = ['一', '二', '三', '四', '五', '六', '日']

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 周一为一周开始 */
function mondayOf(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

export default function CalendarView({ project, tasks, onMutated, onAddTask, onTaskClick }: Props) {
  const [mode, setMode] = useState<'week' | 'month'>('week')
  const [anchor, setAnchor] = useState(() => new Date())

  const days = useMemo(() => {
    if (mode === 'week') {
      const mon = mondayOf(anchor)
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(mon)
        d.setDate(d.getDate() + i)
        return d
      })
    }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
    const gridStart = mondayOf(first)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [anchor, mode])

  const rangeLabel = useMemo(() => {
    if (mode === 'week') {
      const mon = mondayOf(anchor)
      const sun = new Date(mon)
      sun.setDate(sun.getDate() + 6)
      return `${fmt(mon)} ~ ${fmt(sun)}`
    }
    return `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月`
  }, [anchor, mode])

  const byDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.scheduled) continue
      const list = map.get(t.scheduled) ?? []
      list.push(t)
      map.set(t.scheduled, list)
    }
    return map
  }, [tasks])

  const unscheduled = tasks.filter((t) => !t.scheduled)

  // 被依赖阻塞的任务 id：存在依赖项未完成（或依赖缺失）即视为阻塞
  const blockedIds = useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const s = new Set<string>()
    for (const t of tasks) {
      if (t.dependencies.some((did) => { const d = byId.get(did); return !d || d.status !== 'done' })) s.add(t.id)
    }
    return s
  }, [tasks])

  const shift = (dir: number) => {
    const d = new Date(anchor)
    if (mode === 'week') d.setDate(d.getDate() + 7 * dir)
    else d.setMonth(d.getMonth() + dir)
    setAnchor(d)
  }

  const onDragEnd = async (e: DragEndEvent) => {
    const overId = String(e.over?.id ?? '')
    const task = tasks.find((t) => t.id === String(e.active.id))
    if (!task) return
    let scheduled: string | null = null
    if (overId.startsWith('day:')) scheduled = overId.slice(4)
    else if (overId !== 'unscheduled') return
    if (task.scheduled === scheduled) return
    await api.work.taskUpdate(task.project, task.id, { scheduled })
    onMutated()
  }

  const today = todayStr()

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      <DndContext onDragEnd={onDragEnd}>
        <div className="calendar">
          <div className="cal-head">
            <button className="small" onClick={() => shift(-1)}>
              ‹
            </button>
            <button className="small" onClick={() => setAnchor(new Date())}>
              今天
            </button>
            <button className="small" onClick={() => shift(1)}>
              ›
            </button>
            <span className="range">{rangeLabel}</span>
            <span className="spacer" style={{ flex: 1 }} />
            <div className="view-tabs">
              <button className={mode === 'week' ? 'active' : ''} onClick={() => setMode('week')}>
                周
              </button>
              <button className={mode === 'month' ? 'active' : ''} onClick={() => setMode('month')}>
                月
              </button>
            </div>
          </div>
          <div className="cal-grid" style={mode === 'month' ? { gridTemplateRows: 'auto repeat(6, 1fr)' } : { gridTemplateRows: 'auto 1fr' }}>
            {DOW.map((d) => (
              <div key={d} className="cal-dow">
                周{d}
              </div>
            ))}
            {days.map((d) => (
              <DayCell
                key={d.toISOString()}
                date={fmt(d)}
                tasks={byDate.get(fmt(d)) ?? []}
                today={fmt(d) === today}
                blockedIds={blockedIds}
                onAddTask={onAddTask}
                onTaskClick={onTaskClick}
              />
            ))}
          </div>
        </div>
        <Unscheduled tasks={unscheduled} blockedIds={blockedIds} onTaskClick={onTaskClick} />
      </DndContext>
    </div>
  )
}

function DayCell({
  date,
  tasks,
  today,
  blockedIds,
  onAddTask,
  onTaskClick,
}: {
  date: string
  tasks: Task[]
  today: boolean
  blockedIds: Set<string>
  onAddTask?: (date: string) => void
  onTaskClick?: (task: Task) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${date}` })
  const isOtherMonth = tasks.length === 0 && false // 月视图淡显由 CSS :has 处理简化，跳过
  void isOtherMonth
  return (
    <div
      className={`cal-cell${today ? ' today' : ''}${isOver ? ' drag-over' : ''}`}
      ref={setNodeRef}
      onDoubleClick={() => onAddTask?.(date)}
      title="双击在此日期新建任务"
    >
      <div className="cal-date">{Number(date.slice(8))}</div>
      {tasks.map((t) => (
        <DraggableCalTask key={t.id} task={t} blocked={blockedIds.has(t.id)} onClick={onTaskClick} />
      ))}
    </div>
  )
}

function DraggableCalTask({
  task,
  blocked,
  onClick,
}: {
  task: Task
  blocked: boolean
  onClick?: (task: Task) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const overdue =
    task.status !== 'done' && task.due !== null && task.due < todayStr()
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cal-task${task.status === 'done' ? ' done' : ''}${overdue ? ' overdue' : ''}${blocked ? ' blocked' : ''}`}
      title={`${task.title}${task.due ? `\n截止 ${task.due}` : ''}${blocked ? '\n⛔ 被依赖阻塞' : ''}`}
      style={isDragging ? { opacity: 0.5 } : undefined}
      onClick={() => onClick?.(task)}
    >
      {task.title}
      {blocked && <span style={{ marginLeft: 4 }}>⛔</span>}
    </div>
  )
}

function Unscheduled({
  tasks,
  blockedIds,
  onTaskClick,
}: {
  tasks: Task[]
  blockedIds: Set<string>
  onTaskClick?: (task: Task) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' })
  return (
    <div className={`unscheduled${isOver ? ' drag-over' : ''}`} ref={setNodeRef}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
        未安排（{tasks.length}）
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tasks.map((t) => (
          <CompactTask key={t.id} task={t} blocked={blockedIds.has(t.id)} onClick={onTaskClick} />
        ))}
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>
        拖动任务到日期格安排计划日；拖回此处取消安排。点击任务卡片查看详情。
      </p>
    </div>
  )
}

function CompactTask({
  task,
  blocked,
  onClick,
}: {
  task: Task
  blocked: boolean
  onClick?: (task: Task) => void
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`cal-task${task.status === 'done' ? ' done' : ''}${blocked ? ' blocked' : ''}`}
      style={{ whiteSpace: 'normal' }}
      title={`${task.title}${blocked ? '\n⛔ 被依赖阻塞' : ''}`}
      onClick={() => onClick?.(task)}
    >
      {task.title}
      {blocked && <span style={{ marginLeft: 4 }}>⛔</span>}
    </div>
  )
}
