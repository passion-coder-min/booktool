import { useCallback, useEffect, useMemo, useState } from 'react'
import { DndContext, DragEndEvent, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import type { Project, Task, TaskStatus } from '@booktool/shared'
import { api } from '../api'
import { COLUMNS, PagedColumn, TaskCard } from './KanbanView'
import { TaskEditModal } from './TaskManagePage'

interface Props {
  projects: Project[]
}

/** 全局任务看板：跨项目四列，拖拽改状态；支持按标题/标签搜索；卡片双色（项目色 + 紧急色），点击编辑详情 */
export default function AllTasksView({ projects }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [editing, setEditing] = useState<Task | null>(null)
  const [query, setQuery] = useState('')
  const refresh = useCallback(() => void api.work.taskList().then(setTasks), [])
  useEffect(refresh, [refresh])

  // 拖拽需移动 4px 才激活，单击留给"点开详情"
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const colorOf = (t: Task) => projects.find((p) => p.id === t.project)?.color ?? '#3d8bfd'
  const nameOf = (t: Task) => projects.find((p) => p.id === t.project)?.name ?? t.project

  // 任务搜索：标题/标签不区分大小写包含
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter(
      (t) => t.title.toLowerCase().includes(q) || t.tags.some((g) => g.toLowerCase().includes(q)),
    )
  }, [tasks, query])

  const onDragEnd = async (e: DragEndEvent) => {
    const overId = String(e.over?.id ?? '')
    if (!overId.startsWith('col:')) return
    const status = overId.slice(4) as TaskStatus
    const task = tasks.find((t) => t.id === String(e.active.id))
    if (!task || task.status === status) return
    await api.work.taskUpdate(task.project, task.id, { status })
    refresh()
  }

  return (
    <>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="pane-header">
          <input
            type="text"
            placeholder="搜索任务标题 / 标签…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 260 }}
          />
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {query.trim() ? `命中 ${filtered.length} / ${tasks.length}` : `共 ${tasks.length} 项`}
          </span>
          <span className="spacer" />
        </div>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="kanban">
              {COLUMNS.map((col) => (
                <PagedColumn
                  key={col.key}
                  colKey={col.key}
                  label={col.label}
                  tasks={filtered.filter((t) => t.status === col.key)}
                  renderCard={(t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      projectColor={colorOf(t)}
                      projectName={nameOf(t)}
                      onDeleted={refresh}
                      onOpen={setEditing}
                    />
                  )}
                />
              ))}
            </div>
          </DndContext>
        </div>
      </div>
      {editing && (
        <TaskEditModal
          task={editing}
          defaultProject={editing.project}
          projects={projects}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </>
  )
}
