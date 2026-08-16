import { useState } from 'react'
import { DndContext, DragEndEvent, useDraggable, useDroppable } from '@dnd-kit/core'
import type { Project, Task, TaskStatus } from '@booktool/shared'
import { api } from '../api'

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: '待办' },
  { key: 'doing', label: '进行中' },
  { key: 'done', label: '已完成' },
]

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
}

export default function KanbanView({ project, tasks, onMutated }: Props) {
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [priority, setPriority] = useState('normal')

  const add = async () => {
    if (!title.trim()) return
    await api.work.taskCreate({
      title: title.trim(),
      project: project.id,
      priority: priority as Task['priority'],
      due: due || null,
      scheduled: null,
    })
    setTitle('')
    onMutated()
  }

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="quick-add">
        <input
          type="text"
          placeholder="新任务标题，回车添加"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} title="截止日" />
        <select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="low">低</option>
          <option value="normal">普通</option>
          <option value="high">高</option>
          <option value="urgent">紧急</option>
        </select>
        <button className="primary" onClick={add}>
          添加
        </button>
      </div>
      <DndContext onDragEnd={onDragEnd}>
        <div className="kanban">
          {COLUMNS.map((col) => {
            const list = tasks.filter((t) => t.status === col.key)
            return (
              <Column key={col.key} colKey={col.key} label={col.label} count={list.length}>
                {list.map((t) => (
                  <TaskCard key={t.id} task={t} onDeleted={onMutated} />
                ))}
              </Column>
            )
          })}
        </div>
      </DndContext>
    </div>
  )
}

function Column({
  colKey,
  label,
  count,
  children,
}: {
  colKey: TaskStatus
  label: string
  count: number
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${colKey}` })
  return (
    <div className={`kanban-col${isOver ? ' drag-over' : ''}`} ref={setNodeRef}>
      <div className="kanban-col-title">
        <span>{label}</span>
        <span>{count}</span>
      </div>
      {children}
    </div>
  )
}

export function TaskCard({ task, onDeleted }: { task: Task; onDeleted: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  const del = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`删除任务「${task.title}」？`)) {
      await api.work.taskDelete(task.project, task.id)
      onDeleted()
    }
  }
  return (
    <div
      className={`task-card${isDragging ? ' dragging' : ''}`}
      ref={setNodeRef}
      {...attributes}
      {...listeners}
    >
      <div className="t-title">{task.title}</div>
      <div className="t-meta">
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
        {task.links.length > 0 && <span title={task.links.join(', ')}>🔗</span>}
        <button className="t-del" onClick={del} title="删除">
          ✕
        </button>
      </div>
    </div>
  )
}
