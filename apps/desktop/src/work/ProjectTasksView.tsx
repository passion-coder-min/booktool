import { useCallback, useEffect, useState } from 'react'
import type { Project, Task } from '@booktool/shared'
import { api } from '../api'
import TaskChecklist from './TaskChecklist'
import TaskTableView from './TaskTableView'
import QuadrantView from './QuadrantView'
import KanbanView from './KanbanView'
import { TaskEditModal } from './TaskManagePage'

type TaskSub = 'checklist' | 'table' | 'quadrant' | 'kanban'

/** 项目任务视图：清单（checkbox 添加）/ 表格（单元格编辑）/ 四象限（重要×紧急）/ 看板（状态四列） */
export default function ProjectTasksView({ project }: { project: Project }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [sub, setSub] = useState<TaskSub>('checklist')
  const [editing, setEditing] = useState<Task | null>(null)

  const refresh = useCallback(() => {
    void api.work.taskList().then((list) => setTasks(list.filter((t) => t.project === project.id)))
  }, [project.id])
  useEffect(refresh, [refresh])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="pane-header">
        <div className="view-tabs">
          <button className={sub === 'checklist' ? 'active' : ''} onClick={() => setSub('checklist')}>
            📝 清单
          </button>
          <button className={sub === 'table' ? 'active' : ''} onClick={() => setSub('table')}>
            ▦ 表格
          </button>
          <button className={sub === 'quadrant' ? 'active' : ''} onClick={() => setSub('quadrant')}>
            🎯 四象限
          </button>
          <button className={sub === 'kanban' ? 'active' : ''} onClick={() => setSub('kanban')}>
            📋 看板
          </button>
        </div>
        <span className="spacer" />
        <span style={{ color: 'var(--muted)', fontSize: 12 }}>
          {tasks.length} 项进行中 · 添加在「清单」写 `- [ ] 任务`（默认 重要·不紧急）
        </span>
      </div>
      {sub === 'checklist' && <TaskChecklist project={project} onMutated={refresh} />}
      {sub === 'table' && <TaskTableView project={project} tasks={tasks} onMutated={refresh} />}
      {sub === 'quadrant' && <QuadrantView project={project} tasks={tasks} onMutated={refresh} onOpen={setEditing} />}
      {sub === 'kanban' && <KanbanView project={project} tasks={tasks} onMutated={refresh} onOpen={setEditing} />}
      {editing && (
        <TaskEditModal
          task={editing}
          defaultProject={project.id}
          projects={[project]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
