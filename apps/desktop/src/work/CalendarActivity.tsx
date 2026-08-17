import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkspaceInfo, Task } from '@booktool/shared'
import { api } from '../api'
import EmptyCard from '../components/EmptyCard'
import CalendarView from './CalendarView'
import { TaskEditModal } from './TaskManagePage'
import TaskHoverCard from './TaskHoverCard'
import type { Project } from '@booktool/shared'

interface Props {
  workspace: WorkspaceInfo | null
}

/** 日历活动：跨项目任务日历（拖拽改期即时落盘；双击日期格新建；悬停查看详情；双击卡片编辑） */
export default function CalendarActivity({ workspace }: Props) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projectFilter, setProjectFilter] = useState<string>('all')
  /** 双击日期格待新建的计划日（YYYY-MM-DD） */
  const [addingDate, setAddingDate] = useState<string | null>(null)
  /** 悬停任务卡片 → 详情浮层（含鼠标坐标） */
  const [hover, setHover] = useState<{ task: Task; x: number; y: number } | null>(null)
  /** 双击任务卡片 → 编辑弹窗 */
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const refresh = useCallback(() => void api.work.taskList().then(setTasks), [])
  useEffect(refresh, [refresh, workspace])

  const projectMap = useMemo(() => {
    const m = new Map<string, Project>()
    for (const p of workspace?.projects ?? []) m.set(p.id, p)
    return m
  }, [workspace])

  const filtered = projectFilter === 'all' ? tasks : tasks.filter((t) => t.project === projectFilter)

  // CalendarView 需要 project 对象用于 taskUpdate；用虚拟 all-project 兜底
  const virtualProject: Project = useMemo(
    () => ({ id: '', name: '全部', color: '#3d8bfd', description: '', dir: '', wikiFiles: [], reportFiles: [], taskCount: 0 }),
    [],
  )

  if (!workspace || workspace.projects.length === 0) {
    return (
      <EmptyCard
        icon="📅"
        title="暂无任务可排期"
        desc={<>请先到「工作」活动创建项目与任务，任务设置计划日后会出现在日历中</>}
      />
    )
  }

  return (
    <div className="workbench">
      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-title">项目筛选</div>
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} style={{ width: '100%' }}>
            <option value="all">全部项目（{tasks.length}）</option>
            {workspace.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{tasks.filter((t) => t.project === p.id).length}）
              </option>
            ))}
          </select>
        </div>
        <div className="sidebar-section" style={{ marginTop: 10, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.8 }}>
          <div className="sidebar-title">图例</div>
          <div>
            <span className="badge overdue">红边</span> 逾期任务
          </div>
          <div>
            <span className="badge done" style={{ background: 'none', color: 'var(--ok)', border: '1px solid var(--ok)' }}>
              删除线
            </span>{' '}
            已完成
          </div>
          <div>拖动卡片到日期格安排计划日，拖回「未安排」取消。</div>
          <div>双击日期格：新建该日任务；双击任务卡片：编辑；悬停：查看详情。</div>
        </div>
      </aside>
      <section className="pane">
        <div className="pane-header">
          <strong>任务日历</strong>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>
            {projectFilter === 'all' ? '全部项目' : projectMap.get(projectFilter)?.name}
          </span>
        </div>
        <CalendarView
          project={virtualProject}
          tasks={filtered}
          onMutated={refresh}
          onAddTask={setAddingDate}
          onTaskEdit={setEditingTask}
          onTaskHover={(task, x, y) => setHover({ task, x, y })}
          onTaskLeave={() => setHover(null)}
        />
      </section>

      {hover && <TaskHoverCard hover={hover} tasks={filtered} projects={workspace.projects} />}

      {addingDate && (
        <TaskEditModal
          task={null}
          defaultProject={projectFilter !== 'all' ? projectFilter : (workspace.projects[0]?.id ?? '')}
          projects={workspace.projects}
          seedScheduled={addingDate}
          onClose={() => setAddingDate(null)}
          onSaved={() => {
            setAddingDate(null)
            refresh()
          }}
        />
      )}

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          defaultProject={editingTask.project}
          projects={workspace.projects}
          onClose={() => setEditingTask(null)}
          onSaved={() => {
            setEditingTask(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}
