import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceInfo, Task, Project } from '@booktool/shared'
import { api } from '../api'
import KanbanView from './KanbanView'
import WikiPane from './WikiPane'
import TaskManagePage from './TaskManagePage'
import EmptyCard from '../components/EmptyCard'

interface Props {
  workspace: WorkspaceInfo | null
  onChanged: () => void
}

type SubView = 'tasks' | 'kanban' | 'wiki'

/** 工作活动：项目管理（侧栏）+ 三子页（任务管理 / 看板 / Wiki） */
export default function WorkActivity({ workspace, onChanged }: Props) {
  const [project, setProject] = useState<Project | null>(null)
  const [wikiFile, setWikiFile] = useState('')
  const [view, setView] = useState<SubView>('tasks')
  const [tasks, setTasks] = useState<Task[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const refreshTasks = useCallback(() => void api.work.taskList().then(setTasks), [])
  useEffect(() => {
    refreshTasks()
  }, [refreshTasks, workspace])

  useEffect(() => {
    if (workspace && workspace.projects.length > 0 && !project) {
      setProject(workspace.projects[0])
      setWikiFile(workspace.projects[0].wikiFiles[0] ?? '')
    }
  }, [workspace, project])

  if (!workspace) return null

  if (workspace.projects.length === 0) {
    return (
      <EmptyCard
        icon="💼"
        title="还没有项目"
        desc={
          <>
            项目 = Wiki（知识库）+ 任务（Markdown 文件存储）。
            <br />
            目录结构：projects/&lt;名称&gt;/{`{project.json, wiki/, tasks/}`}
          </>
        }
        actions={
          <button
            className="primary"
            onClick={() => {
              const name = prompt('项目名称（目录名，仅字母数字连字符）')
              if (name) void api.work.createProject(name).then(() => onChanged())
            }}
          >
            + 新建项目
          </button>
        }
      />
    )
  }

  const selectProject = (p: Project) => {
    setProject(p)
    setWikiFile(p.wikiFiles[0] ?? '')
  }

  const newProject = async () => {
    const name = prompt('项目名称（目录名，仅字母数字连字符）')
    if (!name) return
    await api.work.createProject(name)
    onChanged()
  }

  const renameProject = async (p: Project) => {
    const newId = prompt('新目录名（仅字母数字连字符）', p.id)
    if (!newId || newId === p.id) return
    const newName = prompt('新显示名称', p.name) ?? newId
    await api.work.renameProject(p.id, newId, newName)
    setProject(null)
    onChanged()
  }

  const deleteProject = async (p: Project) => {
    if (!confirm(`确认删除项目「${p.name}」？将删除其 Wiki 与全部任务文件，不可恢复。`)) return
    await api.work.deleteProject(p.id)
    setProject(null)
    onChanged()
  }

  const wikiOp = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
      onChanged()
    } catch (e) {
      alert(String(e))
    }
  }

  const projectTasks = project ? tasks.filter((t) => t.project === project.id) : []

  return (
    <div className="workbench">
      {sidebarOpen && (
      <aside className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            项目
            <button className="small" onClick={newProject} title="新建项目">
              +
            </button>
          </div>
          {workspace.projects.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div
                className={`proj-item${project?.id === p.id ? ' active' : ''}`}
                style={{ flex: 1, minWidth: 0 }}
                onClick={() => selectProject(p)}
              >
                <span className="proj-dot" style={{ background: p.color }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>
                  {tasks.filter((t) => t.project === p.id).length}
                </span>
              </div>
              {project?.id === p.id && (
                <span style={{ display: 'flex', flexShrink: 0 }}>
                  <button className="ft-btn" style={{ width: 20, height: 20, fontSize: 10 }} title="重命名" onClick={() => void renameProject(p)}>
                    ✎
                  </button>
                  <button className="ft-btn" style={{ width: 20, height: 20, fontSize: 10 }} title="删除" onClick={() => void deleteProject(p)}>
                    🗑
                  </button>
                </span>
              )}
            </div>
          ))}
        </div>

        {project && project.wikiFiles.length > 0 && view === 'wiki' && (
          <div className="sidebar-section">
            <div className="sidebar-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              Wiki 文件
              <span style={{ display: 'flex', gap: 4 }}>
                <button
                  className="small"
                  title="新建页面"
                  onClick={() => {
                    const f = prompt('新页面文件名（如 notes.md）')
                    if (f) void wikiOp(() => api.work.wikiCreate(project.id, f, f.replace(/\.md$/, '')))
                  }}
                >
                  +
                </button>
              </span>
            </div>
            {project.wikiFiles.map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center' }}>
                <div
                  className={`wiki-file${wikiFile === f ? ' active' : ''}`}
                  style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => setWikiFile(f)}
                >
                  {f}
                </div>
                <span style={{ display: 'flex', flexShrink: 0 }}>
                  <button
                    className="ft-btn"
                    style={{ width: 20, height: 20, fontSize: 10 }}
                    title="重命名"
                    onClick={() => {
                      const nf = prompt('新文件名', f)
                      if (nf && nf !== f) void wikiOp(() => api.work.wikiRename(project.id, f, nf)).then(() => setWikiFile(nf.endsWith('.md') ? nf : `${nf}.md`))
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="ft-btn"
                    style={{ width: 20, height: 20, fontSize: 10 }}
                    title="删除"
                    onClick={() => {
                      if (confirm(`删除 wiki 页面「${f}」？`)) void wikiOp(() => api.work.wikiDelete(project.id, f)).then(() => setWikiFile(''))
                    }}
                  >
                    🗑
                  </button>
                </span>
              </div>
            ))}
          </div>
        )}
      </aside>
      )}

      <section className="pane">
        <div className="pane-header">
          <button className="ft-btn et-icon" title="侧栏开关" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <strong>{project?.name}</strong>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{project?.description}</span>
          <span className="spacer" />
          <div className="view-tabs">
            <button className={view === 'tasks' ? 'active' : ''} onClick={() => setView('tasks')}>
              ✅ 任务管理
            </button>
            <button className={view === 'kanban' ? 'active' : ''} onClick={() => setView('kanban')}>
              📋 看板
            </button>
            <button className={view === 'wiki' ? 'active' : ''} onClick={() => setView('wiki')}>
              📄 Wiki
            </button>
          </div>
        </div>
        {project && view === 'tasks' && (
          <TaskManagePage tasks={projectTasks} project={project} allProjects={workspace.projects} onMutated={refreshTasks} />
        )}
        {project && view === 'kanban' && (
          <KanbanView project={project} tasks={projectTasks} onMutated={refreshTasks} />
        )}
        {project && view === 'wiki' && <WikiPane project={project} file={wikiFile} />}
      </section>
    </div>
  )
}
