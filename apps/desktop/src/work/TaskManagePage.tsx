import { useMemo, useState } from 'react'
import type { Project, Task, TaskStatus, TaskPriority } from '@booktool/shared'
import { api } from '../api'
import { todayStr } from './KanbanView'
import EmptyCard from '../components/EmptyCard'

interface Props {
  tasks: Task[]
  project: Project
  allProjects: Project[]
  onMutated: () => void
}

const STATUS_LABEL: Record<TaskStatus, string> = { todo: '待办', doing: '进行中', blocked: '阻塞', done: '已完成' }
const PRIORITY_LABEL: Record<TaskPriority, string> = { low: '低', normal: '普通', high: '高', urgent: '紧急' }

/** 任务管理页：全字段表格 + 筛选 + 行内状态 + 编辑弹窗 */
export default function TaskManagePage({ tasks, project, allProjects, onMutated }: Props) {
  const [fStatus, setFStatus] = useState('all')
  const [fPriority, setFPriority] = useState('all')
  const [fText, setFText] = useState('')
  const [editing, setEditing] = useState<Task | null>(null)
  const [creating, setCreating] = useState(false)

  const list = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (fStatus === 'all' || t.status === fStatus) &&
          (fPriority === 'all' || t.priority === fPriority) &&
          (!fText || t.title.toLowerCase().includes(fText.toLowerCase()) || t.tags.some((g) => g.includes(fText))),
      ),
    [tasks, fStatus, fPriority, fText],
  )

  const today = todayStr()
  const overdue = (t: Task) => t.status !== 'done' && t.due !== null && t.due < today

  const setStatus = async (t: Task, status: TaskStatus) => {
    await api.work.taskUpdate(t.project, t.id, { status })
    onMutated()
  }
  const remove = async (t: Task) => {
    if (confirm(`删除任务「${t.title}」？`)) {
      await api.work.taskDelete(t.project, t.id)
      onMutated()
    }
  }

  if (tasks.length === 0) {
    return (
      <EmptyCard
        icon="✅"
        title="还没有任务"
        desc={
          <>
            任务以 Markdown 文件存储（tasks/*.md + YAML frontmatter），
            <br />
            支持状态、优先级、截止日、计划日（日历拖拽）、标签与 wiki 关联
          </>
        }
        actions={
          <button className="primary" onClick={() => setCreating(true)}>
            + 新建任务
          </button>
        }
      />
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', flexWrap: 'wrap' }}>
        <button className="primary" onClick={() => setCreating(true)}>
          + 新建任务
        </button>
        <input type="text" placeholder="搜索标题/标签…" value={fText} onChange={(e) => setFText(e.target.value)} style={{ width: 180 }} />
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="all">全部状态</option>
          <option value="todo">待办</option>
          <option value="doing">进行中</option>
          <option value="done">已完成</option>
        </select>
        <select value={fPriority} onChange={(e) => setFPriority(e.target.value)}>
          <option value="all">全部优先级</option>
          <option value="urgent">紧急</option>
          <option value="high">高</option>
          <option value="normal">普通</option>
          <option value="low">低</option>
        </select>
        <span style={{ color: 'var(--muted)', fontSize: 12.5, marginLeft: 'auto' }}>
          {list.length}/{tasks.length} 项 · 逾期 {tasks.filter(overdue).length}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 14px' }}>
        <table className="task-table">
          <thead>
            <tr>
              <th style={{ width: '42%' }}>标题</th>
              <th>状态</th>
              <th>优先级</th>
              <th>截止日</th>
              <th>计划日</th>
              <th>项目</th>
              <th style={{ width: 110 }}>操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => {
              const proj = allProjects.find((p) => p.id === t.project)
              return (
                <tr key={t.id}>
                  <td style={{ textAlign: 'left' }}>
                    {t.status === 'done' ? <s style={{ color: 'var(--muted)' }}>{t.title}</s> : t.title}
                    {t.tags.length > 0 && (
                      <span style={{ marginLeft: 6 }}>
                        {t.tags.map((g) => (
                          <span key={g} className="tag" style={{ marginRight: 3 }}>
                            {g}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td>
                    <select value={t.status} onChange={(e) => void setStatus(t, e.target.value as TaskStatus)} style={{ padding: '2px 6px', fontSize: 12 }}>
                      {(['todo', 'doing', 'done'] as TaskStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>
                  </td>
                  <td className={overdue(t) ? 'overdue-cell' : ''}>{t.due ?? '—'}</td>
                  <td>{t.scheduled ?? '—'}</td>
                  <td>
                    {proj && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <span className="proj-dot" style={{ background: proj.color, width: 8, height: 8 }} />
                        {proj.name}
                      </span>
                    )}
                  </td>
                  <td>
                    <button className="small" onClick={() => setEditing(t)}>
                      编辑
                    </button>{' '}
                    <button className="small danger-btn" onClick={() => void remove(t)}>
                      删除
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <TaskEditModal
          task={editing}
          defaultProject={project.id}
          projects={allProjects}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSaved={() => {
            setEditing(null)
            setCreating(false)
            onMutated()
          }}
        />
      )}
    </div>
  )
}

export function TaskEditModal({
  task,
  defaultProject,
  projects,
  seedScheduled,
  onClose,
  onSaved,
}: {
  task: Task | null
  defaultProject: string
  projects: Project[]
  /** 新建时预填的计划日（日历双击日期格传入）；编辑态忽略 */
  seedScheduled?: string
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(task?.title ?? '')
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? 'todo')
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal')
  const [importance, setImportance] = useState(task?.importance ?? true)
  const [due, setDue] = useState(task?.due ?? '')
  const [scheduled, setScheduled] = useState(task?.scheduled ?? seedScheduled ?? '')
  const [tags, setTags] = useState(task?.tags.join(', ') ?? '')
  const [project, setProject] = useState(task?.project ?? defaultProject)
  const [body, setBody] = useState(task?.body ?? '')

  const save = async () => {
    if (!title.trim()) return
    const patch = {
      title: title.trim(),
      status,
      priority,
      importance,
      due: due || null,
      scheduled: scheduled || null,
      tags: tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
      project,
      body,
    }
    if (task) await api.work.taskUpdate(task.project, task.id, patch)
    else await api.work.taskCreate(patch)
    onSaved()
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()}>
        <h2>{task ? '编辑任务' : '新建任务'}</h2>
        <div className="form-row">
          <label>标题</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        {/* 项目（归属容器）与条目本身区分开，避免混淆 */}
        <div className="form-row">
          <label>归属项目</label>
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="form-row">
            <label>状态</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {(['todo', 'doing', 'blocked', 'done'] as TaskStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>紧急程度</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
              {(['low', 'normal', 'high', 'urgent'] as TaskPriority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label>重要（四象限）</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={importance} onChange={(e) => setImportance(e.target.checked)} />
              重要
            </label>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div className="form-row">
            <label>截止日</label>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <div className="form-row">
            <label>计划日</label>
            <input type="date" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
          </div>
          <div className="form-row">
            <label>标签（逗号分隔）</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <label>备注</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
        </div>
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>
            取消
          </button>
          <button className="primary" disabled={!title.trim()} onClick={() => void save()}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
