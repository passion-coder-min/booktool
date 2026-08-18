import { DndContext, DragEndEvent, useDroppable, useSensor, useSensors, PointerSensor } from '@dnd-kit/core'
import type { Project, Task } from '@booktool/shared'
import { api } from '../api'
import { TaskCard } from './KanbanView'
import { usePaged } from './usePaged'
import { LoadMore } from './LoadMore'

interface QuadrantDef {
  key: string
  label: string
  importance: boolean
  urgent: boolean
}

const QUADRANTS: QuadrantDef[] = [
  { key: 'imp-urg', label: '重要 · 紧急', importance: true, urgent: true },
  { key: 'imp', label: '重要 · 不紧急（默认）', importance: true, urgent: false },
  { key: 'urg', label: '不重要 · 紧急', importance: false, urgent: true },
  { key: 'none', label: '不重要 · 不紧急', importance: false, urgent: false },
]

/** 四象限（重要 × 紧急）：拖拽任务换格 → 改写行的 (不重要)/(紧急) 标记；点卡片打开编辑 */
export default function QuadrantView({ project, tasks, onMutated, onOpen }: { project: Project; tasks: Task[]; onMutated: () => void; onOpen?: (task: Task) => void }) {
  // 拖拽需移动 4px 才激活，单击留给"点开详情"
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const onDragEnd = async (e: DragEndEvent) => {
    const q = QUADRANTS.find((x) => x.key === String(e.over?.id ?? ''))
    if (!q) return
    const task = tasks.find((t) => t.id === String(e.active.id))
    if (!task) return
    const patch: Record<string, unknown> = { importance: q.importance }
    if (q.urgent) patch.priority = 'urgent'
    else if (task.priority === 'urgent') patch.priority = 'normal'
    await api.work.taskUpdate(task.project, task.id, patch)
    onMutated()
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, padding: 14 }}>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="quadrant">
          {QUADRANTS.map((q) => (
            <QuadCell
              key={q.key}
              q={q}
              tasks={tasks.filter((t) => t.importance === q.importance && (t.priority === 'urgent') === q.urgent)}
              projectColor={project.color}
              onMutated={onMutated}
              onOpen={onOpen}
            />
          ))}
        </div>
      </DndContext>
    </div>
  )
}

function QuadCell({
  q,
  tasks,
  projectColor,
  onMutated,
  onOpen,
}: {
  q: QuadrantDef
  tasks: Task[]
  projectColor: string
  onMutated: () => void
  onOpen?: (task: Task) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: q.key })
  const { visible, remaining, loadMore } = usePaged(tasks)
  const hot = q.importance && q.urgent
  return (
    <div ref={setNodeRef} className={`quad-cell${hot ? ' hot' : ''}${isOver ? ' drag-over' : ''}`}>
      <div className="quad-cell-title">
        <span>{q.label}</span>
        <span className="quad-cell-count">{tasks.length}</span>
      </div>
      <div className="quad-cell-body">
        {visible.map((t) => (
          <TaskCard key={t.id} task={t} projectColor={projectColor} onDeleted={onMutated} onOpen={onOpen} />
        ))}
        <LoadMore remaining={remaining} onClick={loadMore} />
      </div>
    </div>
  )
}
