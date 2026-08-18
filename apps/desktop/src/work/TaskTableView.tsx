import { useEffect, useRef, useState } from 'react'
import type { Project, Task } from '@booktool/shared'
import { api } from '../api'
import { COLUMNS } from './KanbanView'
import { usePaged } from './usePaged'
import { LoadMore } from './LoadMore'

interface Props {
  project: Project
  tasks: Task[]
  onMutated: () => void
}

/** 任务表格编辑：状态/标题/重要/紧急/截止/计划 单元格直接编辑（写回 tasks.md 的 checkbox 行），分页渲染 */
export default function TaskTableView({ project, tasks, onMutated }: Props) {
  const [newTitle, setNewTitle] = useState('')
  const { visible, remaining, loadMore } = usePaged(tasks)

  const add = async () => {
    if (!newTitle.trim()) return
    await api.work.taskCreate({ title: newTitle.trim(), project: project.id })
    setNewTitle('')
    onMutated()
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
      <div className="quick-add">
        <input
          type="text"
          placeholder="新任务标题，回车添加（默认 重要 · 不紧急）"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
        <button className="primary" disabled={!newTitle.trim()} onClick={() => void add()}>
          添加
        </button>
      </div>
      <table className="task-table">
        <thead>
          <tr>
            <th style={{ width: 92, textAlign: 'left' }}>状态</th>
            <th style={{ textAlign: 'left' }}>标题</th>
            <th style={{ width: 48 }}>重要</th>
            <th style={{ width: 48 }}>紧急</th>
            <th style={{ width: 140 }}>截止日</th>
            <th style={{ width: 140 }}>计划日</th>
            <th style={{ width: 56 }}>操作</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((t) => (
            <TaskRow key={t.id} task={t} onMutated={onMutated} />
          ))}
          {tasks.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: 'var(--muted)', textAlign: 'center', padding: 18 }}>
                暂无任务，在上方输入标题添加
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <LoadMore remaining={remaining} onClick={loadMore} />
    </div>
  )
}

function TaskRow({ task, onMutated }: { task: Task; onMutated: () => void }) {
  // 标题变更会改变任务 id（由标题派生），须本地暂存、失焦/回车提交后刷新拿新对象
  const [title, setTitle] = useState(task.title)
  useEffect(() => setTitle(task.title), [task.title])
  const dirty = useRef(false)

  const patch = (p: Record<string, unknown>) => void api.work.taskUpdate(task.project, task.id, p).then(onMutated)

  const commitTitle = async () => {
    const v = title.trim()
    if (!dirty.current || !v || v === task.title) return
    dirty.current = false
    await api.work.taskUpdate(task.project, task.id, { title: v })
    onMutated()
  }

  const del = () => {
    if (confirm(`删除任务「${task.title}」？`)) void api.work.taskDelete(task.project, task.id).then(onMutated)
  }

  return (
    <tr>
      <td>
        <select value={task.status} onChange={(e) => patch({ status: e.target.value })}>
          {COLUMNS.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          value={title}
          onChange={(e) => {
            dirty.current = true
            setTitle(e.target.value)
          }}
          onBlur={() => void commitTitle()}
          onKeyDown={(e) => e.key === 'Enter' && void commitTitle()}
          style={{ width: '100%' }}
        />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={task.importance}
          title={task.importance ? '重要（取消变不重要）' : '标为重要'}
          onChange={(e) => patch({ importance: e.target.checked })}
        />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input
          type="checkbox"
          checked={task.priority === 'urgent'}
          title="紧急"
          onChange={(e) => patch({ priority: e.target.checked ? 'urgent' : 'normal' })}
        />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="date" value={task.due ?? ''} onChange={(e) => patch({ due: e.target.value || null })} />
      </td>
      <td style={{ textAlign: 'center' }}>
        <input type="date" value={task.scheduled ?? ''} onChange={(e) => patch({ scheduled: e.target.value || null })} />
      </td>
      <td style={{ textAlign: 'center' }}>
        <button className="small danger-btn" onClick={del} title="删除">
          🗑
        </button>
      </td>
    </tr>
  )
}
