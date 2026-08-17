import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkspaceInfo, Task, Project } from '@booktool/shared'
import { api } from '../api'
import KanbanView from './KanbanView'
import WikiPane from './WikiPane'
import ReportsPane from './ReportsPane'
import TaskManagePage from './TaskManagePage'
import EmptyCard from '../components/EmptyCard'

interface Props {
  workspace: WorkspaceInfo | null
  onChanged: () => void
}

type SubView = 'tasks' | 'kanban' | 'wiki' | 'reports'

/** 工作活动：项目管理（侧栏）+ 子页（任务管理 / 看板 / Wiki / 日报） */
export default function WorkActivity({ workspace, onChanged }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [wikiFile, setWikiFile] = useState('')
  const [reportFile, setReportFile] = useState('')
  const [view, setView] = useState<SubView>('tasks')
  const [tasks, setTasks] = useState<Task[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  /** Wiki 树已折叠的文件夹路径 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCollapsed = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const refreshTasks = useCallback(() => void api.work.taskList().then(setTasks), [])
  useEffect(() => {
    refreshTasks()
  }, [refreshTasks, workspace])

  // 由 id 派生当前项目：workspace 刷新（wiki/日报增删）后自动拿到最新 wikiFiles/reportFiles
  const project = useMemo(() => {
    if (!workspace) return null
    return workspace.projects.find((p) => p.id === projectId) ?? workspace.projects[0] ?? null
  }, [workspace, projectId])

  useEffect(() => {
    if (workspace && workspace.projects.length > 0 && !projectId) {
      const first = workspace.projects[0]
      setProjectId(first.id)
      setWikiFile(first.wikiFiles[0] ?? '')
    }
  }, [workspace, projectId])

  // 进入日报视图：确保当前周文件存在（一周过去后自动创建下一个 md 文件）
  useEffect(() => {
    if (view !== 'reports' || !projectId) return
    let cancelled = false
    void api.work.reportEnsureWeek(projectId).then((r) => {
      if (!cancelled) {
        setReportFile(r.file)
        onChanged()
      }
    })
    return () => {
      cancelled = true
    }
  }, [view, projectId, onChanged])

  if (!workspace) return null

  if (workspace.projects.length === 0) {
    return (
      <EmptyCard
        icon="💼"
        title="还没有项目"
        desc={
          <>
            项目 = Wiki（知识库）+ 日报（每周一个 Markdown 文件）+ 任务（Markdown 文件存储）。
            <br />
            目录结构：projects/&lt;名称&gt;/{`{project.json, wiki/, reports/, tasks/}`}
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
    setProjectId(p.id)
    setWikiFile(p.wikiFiles[0] ?? '')
    setReportFile('')
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
    setProjectId(null)
    onChanged()
  }

  const deleteProject = async (p: Project) => {
    if (!confirm(`确认删除项目「${p.name}」？将删除其 Wiki、日报与全部任务文件，不可恢复。`)) return
    await api.work.deleteProject(p.id)
    setProjectId(null)
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

          {project && view === 'wiki' && (
            <div className="sidebar-section">
              <div className="sidebar-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Wiki 文件
                <button
                  className="small"
                  title="新建页面（可用 文件夹/名.md 建到子目录）"
                  onClick={() => {
                    const f = prompt('新页面文件（可用 文件夹/名.md）')
                    if (f) void wikiOp(() => api.work.wikiCreate(project.id, f, f.replace(/\.md$/, '').split('/').pop() ?? f))
                  }}
                >
                  +
                </button>
              </div>
              {project.wikiFiles.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 6px' }}>暂无页面，点「+」新建</div>
              ) : (
                <WikiTree
                  nodes={buildWikiTree(project.wikiFiles)}
                  depth={0}
                  collapsed={collapsed}
                  toggle={toggleCollapsed}
                  wikiFile={wikiFile}
                  onSelect={setWikiFile}
                  onRename={(path) => {
                    const nf = prompt('新文件名（可含 文件夹/ 前缀移动）', path)
                    if (nf && nf !== path) void wikiOp(() => api.work.wikiRename(project.id, path, nf)).then(() => setWikiFile(nf.endsWith('.md') ? nf : `${nf}.md`))
                  }}
                  onDelete={(path) => {
                    if (confirm(`删除 wiki 页面「${path}」？`)) void wikiOp(() => api.work.wikiDelete(project.id, path)).then(() => setWikiFile(''))
                  }}
                />
              )}
            </div>
          )}

          {project && view === 'reports' && (
            <div className="sidebar-section">
              <div className="sidebar-title">工作日报（按周）</div>
              {project.reportFiles.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '4px 6px' }}>本周文件已自动创建，开始写日报吧</div>
              ) : (
                project.reportFiles.map((f) => (
                  <div key={f} className={`wiki-file${reportFile === f ? ' active' : ''}`} onClick={() => setReportFile(f)}>
                    {f}
                  </div>
                ))
              )}
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
            <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>
              📝 日报
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
        {project && view === 'reports' && (
          <ReportsPane project={project} file={reportFile} onFile={setReportFile} />
        )}
      </section>
    </div>
  )
}

/* ---------- Wiki 层级树（CherryTree 式：文件夹 + 叶子页面） ---------- */

interface WikiNode {
  name: string
  /** 相对 wiki 根的路径（叶子为 .md 文件路径，文件夹为前缀） */
  path: string
  /** 是否为可编辑的 .md 文件（文件夹名可能与文件名同名） */
  file: boolean
  children: WikiNode[]
}

function buildWikiTree(files: string[]): WikiNode[] {
  const root: WikiNode[] = []
  for (const f of files) {
    const parts = f.split('/')
    let level = root
    let acc = ''
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!
      acc = acc ? `${acc}/${part}` : part
      let node = level.find((n) => n.name === part)
      if (!node) {
        node = { name: part, path: acc, file: i === parts.length - 1, children: [] }
        level.push(node)
      }
      if (i === parts.length - 1) node.file = true
      level = node.children
    }
  }
  return root
}

function WikiTree({
  nodes,
  depth,
  collapsed,
  toggle,
  wikiFile,
  onSelect,
  onRename,
  onDelete,
}: {
  nodes: WikiNode[]
  depth: number
  collapsed: Set<string>
  toggle: (path: string) => void
  wikiFile: string
  onSelect: (path: string) => void
  onRename: (path: string) => void
  onDelete: (path: string) => void
}) {
  return (
    <>
      {nodes.map((n) => {
        const hasChildren = n.children.length > 0
        const isCollapsed = collapsed.has(n.path)
        const indent = { paddingLeft: depth * 14 + 6 }
        return (
          <div key={n.path}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span
                className="wiki-caret"
                style={{ cursor: hasChildren ? 'pointer' : 'default' }}
                onClick={() => hasChildren && toggle(n.path)}
              >
                {hasChildren ? (isCollapsed ? '▸' : '▾') : ''}
              </span>
              <div
                className={`wiki-file${wikiFile === n.path ? ' active' : ''}`}
                style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...indent }}
                onClick={() => {
                  if (n.file) onSelect(n.path)
                  else toggle(n.path)
                }}
                title={n.file ? n.path : undefined}
              >
                {n.name}
                {!n.file ? '/' : ''}
              </div>
              {n.file && (
                <span style={{ display: 'flex', flexShrink: 0 }}>
                  <button className="ft-btn" style={{ width: 20, height: 20, fontSize: 10 }} title="重命名/移动" onClick={() => onRename(n.path)}>
                    ✎
                  </button>
                  <button className="ft-btn" style={{ width: 20, height: 20, fontSize: 10 }} title="删除" onClick={() => onDelete(n.path)}>
                    🗑
                  </button>
                </span>
              )}
            </div>
            {hasChildren && !isCollapsed && (
              <WikiTree nodes={n.children} depth={depth + 1} collapsed={collapsed} toggle={toggle} wikiFile={wikiFile} onSelect={onSelect} onRename={onRename} onDelete={onDelete} />
            )}
          </div>
        )
      })}
    </>
  )
}
