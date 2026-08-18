import { useMemo, useState } from 'react'
import type { Project, Task, TaskStatus } from '@booktool/shared'
import { api } from '../api'
import { todayStr } from './KanbanView'

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: '待办', doing: '进行中', blocked: '阻塞', done: '已完成' }
export const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'done']
export const PRIORITY_LABEL: Record<Task['priority'], string> = { low: '低', normal: '普通', high: '高', urgent: '紧急' }

interface Props {
  task: Task
  /** 全部任务：解析依赖状态与候选添加 */
  tasks: Task[]
  projects: Project[]
  onClose: () => void
  onSaved: () => void
}

/** 任务详情弹窗：进度（进行中/已结束）+ 依赖阻塞 + 信息与正文 */
export default function TaskDetailModal({ task, tasks, projects, onClose, onSaved }: Props) {
  const [status, setStatus] = useState<TaskStatus>(task.status)
  const [picked, setPicked] = useState('')

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const deps = useMemo(
    () =>
      task.dependencies
        .map((id) => byId.get(id))
        .filter((t): t is Task => Boolean(t)),
    [task.dependencies, byId],
  )
  const blocked = deps.some((d) => d.status !== 'done')
  const candidates = useMemo(
    () => tasks.filter((t) => t.id !== task.id && !task.dependencies.includes(t.id)),
    [tasks, task],
  )
  const project = projects.find((p) => p.id === task.project)
  const overdue = task.status !== 'done' && task.due !== null && task.due < todayStr()

  const changeStatus = async (s: TaskStatus) => {
    if (s === status) return
    await api.work.taskUpdate(task.project, task.id, { status: s })
    setStatus(s)
    onSaved()
  }

  const addDep = async () => {
    if (!picked) return
    const next = [...task.dependencies, picked]
    await api.work.taskUpdate(task.project, task.id, { dependencies: next })
    setPicked('')
    onSaved()
  }

  const removeDep = async (id: string) => {
    await api.work.taskUpdate(task.project, task.id, {
      dependencies: task.dependencies.filter((d) => d !== id),
    })
    onSaved()
  }

  const remove = async () => {
    if (confirm(`删除任务「${task.title}」？`)) {
      await api.work.taskDelete(task.project, task.id)
      onSaved()
      onClose()
    }
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="detail-title-row">
          <h2 style={{ margin: 0 }}>{task.status === 'done' ? <s>{task.title}</s> : task.title}</h2>
          {project && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--muted)' }}>
              <span className="proj-dot" style={{ background: project.color, width: 8, height: 8 }} />
              {project.name}
            </span>
          )}
        </div>

        {/* 进度：待办 / 进行中 / 已结束 */}
        <div className="form-row" style={{ marginTop: 4 }}>
          <label>进度</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                className={status === s ? `badge ${s}` : 'ghost'}
                style={{ cursor: 'pointer', padding: '4px 12px' }}
                onClick={() => void changeStatus(s)}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* 依赖阻塞 */}
        <div className="form-row">
          <label>依赖</label>
          <div style={{ flex: 1, minWidth: 0 }}>
            {deps.length === 0 ? (
              <span style={{ color: 'var(--muted)', fontSize: 12.5 }}>无依赖</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {deps.map((d) => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                    <span className={`badge ${d.status}`}>{STATUS_LABEL[d.status]}</span>
                    <span style={{ flex: 1 }}>{d.title}</span>
                    <button className="small danger-btn" onClick={() => void removeDep(d.id)}>
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            {blocked && (
              <div style={{ marginTop: 6, color: '#d94a4a', fontSize: 12.5 }}>
                ⛔ 被依赖阻塞：依赖项未全部完成
              </div>
            )}
            {candidates.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <select value={picked} onChange={(e) => setPicked(e.target.value)} style={{ flex: 1 }}>
                  <option value="">+ 添加依赖任务…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <button className="small" disabled={!picked} onClick={() => void addDep()}>
                  添加
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 信息 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="form-row">
            <label>优先级</label>
            <div>
              <span className={`badge ${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>
            </div>
          </div>
          <div className="form-row">
            <label>截止日</label>
            <div className={overdue ? 'overdue-cell' : ''}>{task.due ?? '—'}</div>
          </div>
          <div className="form-row">
            <label>计划日</label>
            <div>{task.scheduled ?? '—'}</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="form-row">
            <label>创建</label>
            <div style={{ fontSize: 12.5 }}>{task.created ? task.created.slice(0, 10) : '—'}</div>
          </div>
          <div className="form-row">
            <label>完成</label>
            <div style={{ fontSize: 12.5 }}>{task.completed ? new Date(task.completed).toLocaleDateString() : '—'}</div>
          </div>
        </div>
        {task.tags.length > 0 && (
          <div className="form-row">
            <label>标签</label>
            <div>
              {task.tags.map((g) => (
                <span key={g} className="tag" style={{ marginRight: 4 }}>
                  {g}
                </span>
              ))}
            </div>
          </div>
        )}
        {task.body && (
          <div className="form-row">
            <label>备注</label>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12.5, fontFamily: 'inherit', lineHeight: 1.6 }}>
              {task.body}
            </pre>
          </div>
        )}

        <div className="modal-actions">
          <button className="ghost danger-btn" onClick={() => void remove()}>
            删除
          </button>
          <span className="spacer" style={{ flex: 1 }} />
          <button className="ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
