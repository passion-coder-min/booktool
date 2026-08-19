import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkspaceInfo, Task, Project } from '@booktool/shared'
import { api } from '../api'
import WikiPane from './WikiPane'
import ReportsPane from './ReportsPane'
import TaskOverview from './TaskOverview'
import ProjectTasksView from './ProjectTasksView'
import AllTasksView from './AllTasksView'
import EmptyCard from '../components/EmptyCard'
import { promptAsync } from '../components/PromptHost'

interface Props {
  workspace: WorkspaceInfo | null
  onChanged: () => void
}

type SubView = 'all' | 'overview' | 'tasks' | 'wiki' | 'reports'

const SECTIONS: { key: SubView; label: string }[] = [
  { key: 'wiki', label: '📄 Wiki' },
  { key: 'tasks', label: '✅ 任务' },
  { key: 'reports', label: '📝 日报' },
]

/** 工作活动：CherryTree 结构（项目 → Wiki/任务/日报）+ 全局任务看板页签 */
export default function WorkActivity({ workspace, onChanged }: Props) {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [view, setView] = useState<SubView>('overview')
  const [wikiFile, setWikiFile] = useState('')
  const [reportFile, setReportFile] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  /** Wiki 树已折叠的文件夹路径 */
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  /** CherryTree 树展开的项目 / 分区节点 */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggleCollapsed = useCallback((path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // 首帧默认展开所有项目节点
  useEffect(() => {
    if (!workspace) return
    setExpanded((prev) => {
      if (prev.size > 0) return prev
      const next = new Set<string>()
      for (const p of workspace.projects) next.add(`p:${p.id}`)
      return next
    })
  }, [workspace])

  const refreshTasks = useCallback(() => void api.work.taskList().then(setTasks), [])
  useEffect(() => {
    refreshTasks()
  }, [refreshTasks, workspace])

  // 由 id 派生当前项目：workspace 刷新后自动拿到最新 wikiFiles/reportFiles
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
            项目 = Wiki（知识库）+ 任务（tasks.md 的 markdown checkbox）+ 日报（每周一个 Markdown 文件）。
            <br />
            目录结构：projects/&lt;名称&gt;/{`{project.json, wiki/, reports/, tasks.md}`}
          </>
        }
        actions={
          <button
            className="primary"
            onClick={async () => {
              const name = await promptAsync('项目名称（目录名，仅字母数字连字符）')
              if (name) {
                await api.work.createProject(name)
                onChanged()
              }
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
    setView('overview')
    setWikiFile(p.wikiFiles[0] ?? '')
  }

  const selectSection = (p: Project, key: SubView) => {
    setProjectId(p.id)
    setView(key)
    if (key === 'wiki') {
      setWikiFile((f) => f || (p.wikiFiles[0] ?? ''))
      setExpanded((prev) => new Set(prev).add(`s:${p.id}:wiki`))
    } else if (key === 'reports') {
      setExpanded((prev) => new Set(prev).add(`s:${p.id}:reports`))
    }
  }

  const newProject = async () => {
    const name = await promptAsync('项目名称（目录名，仅字母数字连字符）')
    if (!name) return
    await api.work.createProject(name)
    onChanged()
  }

  const renameProject = async (p: Project) => {
    const newId = await promptAsync('新目录名（仅字母数字连字符）', p.id)
    if (!newId || newId === p.id) return
    const newName = (await promptAsync('新显示名称', p.name)) ?? newId
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
            {workspace.projects.map((p) => {
              const pExpanded = expanded.has(`p:${p.id}`)
              const wikiExpanded = expanded.has(`s:${p.id}:wiki`)
              const reportsExpanded = expanded.has(`s:${p.id}:reports`)
              const isActive = project?.id === p.id
              return (
                <div key={p.id}>
                  <div
                    className={`tree-item${isActive ? ' active' : ''}`}
                    onClick={() => selectProject(p)}
                    style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <span
                      className="wiki-caret"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleExpand(`p:${p.id}`)
                      }}
                    >
                      {pExpanded ? '▾' : '▸'}
                    </span>
                    <span className="proj-dot" style={{ background: p.color, flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tasks.filter((t) => t.project === p.id).length}</span>
                    {isActive && (
                      <span style={{ display: 'flex', flexShrink: 0 }}>
                        <button className="ft-btn" style={{ width: 20, height: 20, fontSize: 10 }} title="重命名" onClick={(e) => { e.stopPropagation(); void renameProject(p) }}>
                          ✎
                        </button>
                        <button className="ft-btn" style={{ width: 20, height: 20, fontSize: 10 }} title="删除" onClick={(e) => { e.stopPropagation(); void deleteProject(p) }}>
                          🗑
                        </button>
                      </span>
                    )}
                  </div>
                  {pExpanded && (
                    <div style={{ paddingLeft: 12 }}>
                      {SECTIONS.map((s) => (
                        <div key={s.key}>
                          <div
                            className={`tree-item${isActive && view === s.key ? ' active' : ''}`}
                            onClick={() => selectSection(p, s.key)}
                            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                          >
                            {s.key === 'wiki' && p.wikiFiles.length > 0 && (
                              <span
                                className="wiki-caret"
                                style={{ cursor: 'pointer' }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  toggleExpand(`s:${p.id}:wiki`)
                                }}
                              >
                                {wikiExpanded ? '▾' : '▸'}
                              </span>
                            )}
                            {s.key !== 'wiki' && <span className="wiki-caret" />}
                            <span>{s.label}</span>
                          </div>
                          {s.key === 'wiki' && wikiExpanded && p.wikiFiles.length > 0 && (
                            <div style={{ paddingLeft: 10 }}>
                              <WikiTree
                                nodes={buildWikiTree(p.wikiFiles)}
                                depth={0}
                                collapsed={collapsed}
                                toggle={toggleCollapsed}
                                wikiFile={isActive ? wikiFile : ''}
                                onSelect={(path) => {
                                  setProjectId(p.id)
                                  setWikiFile(path)
                                  setView('wiki')
                                }}
                                onRename={async (path) => {
                                  const nf = await promptAsync('新文件名（可含 文件夹/ 前缀移动）', path)
                                  if (nf && nf !== path) {
                                    await wikiOp(() => api.work.wikiRename(p.id, path, nf))
                                    setWikiFile(nf.endsWith('.md') ? nf : `${nf}.md`)
                                  }
                                }}
                                onDelete={(path) => {
                                  if (confirm(`删除 wiki 页面「${path}」？`)) void wikiOp(() => api.work.wikiDelete(p.id, path)).then(() => setWikiFile(''))
                                }}
                              />
                            </div>
                          )}
                          {s.key === 'reports' && reportsExpanded && p.reportFiles.length > 0 && (
                            <div style={{ paddingLeft: 18 }}>
                              {p.reportFiles.map((f) => (
                                <div
                                  key={f}
                                  className={`wiki-file${isActive && reportFile === f ? ' active' : ''}`}
                                  onClick={() => {
                                    setProjectId(p.id)
                                    setReportFile(f)
                                    setView('reports')
                                  }}
                                >
                                  {f}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </aside>
      )}

      <section className="pane">
        <div className="pane-header">
          <button className="ft-btn et-icon" title="侧栏开关" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <strong>{view === 'all' ? '全部任务' : (project?.name ?? '')}</strong>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>{view === 'all' ? '跨项目任务看板' : project?.description}</span>
          <span className="spacer" />
          <div className="view-tabs">
            <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
              🗂 全部任务
            </button>
            {project && (
              <>
                <button className={view === 'overview' ? 'active' : ''} onClick={() => setView('overview')}>
                  概览
                </button>
                <button className={view === 'wiki' ? 'active' : ''} onClick={() => setView('wiki')}>
                  📄 Wiki
                </button>
                <button className={view === 'tasks' ? 'active' : ''} onClick={() => setView('tasks')}>
                  ✅ 任务
                </button>
                <button className={view === 'reports' ? 'active' : ''} onClick={() => setView('reports')}>
                  📝 日报
                </button>
              </>
            )}
          </div>
        </div>
        {view === 'all' && <AllTasksView projects={workspace.projects} />}
        {project && view === 'overview' && (
          <TaskOverview project={project} wikiFile={wikiFile} onOpenWiki={() => setView('wiki')} onOpenTasks={() => setView('tasks')} />
        )}
        {project && view === 'tasks' && <ProjectTasksView project={project} />}
        {project && view === 'wiki' && <WikiPane project={project} file={wikiFile} />}
        {project && view === 'reports' && <ReportsPane project={project} file={reportFile} onFile={setReportFile} />}
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
