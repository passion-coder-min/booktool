import { useMemo } from 'react'
import type { Project, Task } from '@booktool/shared'
import { todayStr } from './KanbanView'
import { STATUS_LABEL, PRIORITY_LABEL } from './TaskDetailModal'

interface Props {
  /** 悬停任务与其鼠标坐标 */
  hover: { task: Task; x: number; y: number }
  /** 全部任务：解析依赖状态 */
  tasks: Task[]
  projects: Project[]
}

/** 日历任务悬停浮层：只读详情（非交互，pointer-events:none，不干扰拖拽） */
export default function TaskHoverCard({ hover, tasks, projects }: Props) {
  const { task, x, y } = hover
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const deps = task.dependencies.map((id) => byId.get(id)).filter((t): t is Task => Boolean(t))
  const blocked = task.status === 'blocked'
  const project = projects.find((p) => p.id === task.project)
  const overdue = task.status !== 'done' && task.due !== null && task.due < todayStr()

  const style: React.CSSProperties = {
    left: Math.max(8, Math.min(x + 14, window.innerWidth - 292)),
    top: Math.max(8, Math.min(y + 14, window.innerHeight - 340)),
  }

  return (
    <div className="task-hover-card" style={style}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
        {task.status === 'done' ? <s>{task.title}</s> : task.title}
      </div>
      {project && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
          <span className="proj-dot" style={{ background: project.color, width: 8, height: 8 }} />
          {project.name}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
        <span className={`badge ${task.status}`}>{STATUS_LABEL[task.status]}</span>
        <span className={`badge ${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>
        {overdue && <span className="badge overdue">已逾期</span>}
        {blocked && <span className="badge blocked">阻塞中</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--muted)', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 10px', marginBottom: 6 }}>
        <span>截止</span>
        <span className={overdue ? 'overdue-cell' : ''}>{task.due ?? '—'}</span>
        <span>计划日</span>
        <span>{task.scheduled ?? '—'}</span>
        {task.created && (
          <>
            <span>创建</span>
            <span>{task.created.slice(0, 10)}</span>
          </>
        )}
      </div>
      {deps.length > 0 && (
        <div style={{ fontSize: 12, marginBottom: 6 }}>
          <div style={{ color: 'var(--muted)' }}>依赖</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
            {deps.map((d) => (
              <span key={d.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <span className={`badge ${d.status}`}>{STATUS_LABEL[d.status]}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
              </span>
            ))}
          </div>
        </div>
      )}
      {task.tags.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          {task.tags.map((g) => (
            <span key={g} className="tag" style={{ marginRight: 4 }}>
              {g}
            </span>
          ))}
        </div>
      )}
      {task.body && (
        <div
          style={{
            fontSize: 12, lineHeight: 1.55, color: 'var(--muted)',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {task.body}
        </div>
      )}
    </div>
  )
}
