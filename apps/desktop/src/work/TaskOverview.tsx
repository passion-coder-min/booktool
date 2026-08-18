import { useCallback, useEffect, useState } from 'react'
import type { Project, Task } from '@booktool/shared'
import { api } from '../api'
import WikiPane from './WikiPane'
import KanbanView from './KanbanView'
import { TaskEditModal } from './TaskManagePage'

interface Props {
  project: Project
  wikiFile: string
  /** 跳到完整 Wiki 视图 */
  onOpenWiki: () => void
  /** 跳到完整任务视图 */
  onOpenTasks: () => void
}

/** 项目概览：左「部分 Wiki」+ 右「项目任务看板」，顶部常驻开关可随时打开/关闭任意面板 */
export default function TaskOverview({ project, wikiFile, onOpenWiki, onOpenTasks }: Props) {
  const [showWiki, setShowWiki] = useState(true)
  const [showKanban, setShowKanban] = useState(true)
  const [tasks, setTasks] = useState<Task[]>([])
  const [editing, setEditing] = useState<Task | null>(null)

  const refresh = useCallback(() => {
    void api.work.taskList().then((l) => setTasks(l.filter((t) => t.project === project.id)))
  }, [project.id])
  useEffect(refresh, [refresh])

  return (
    <>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="pane-header">
        <strong>项目概览</strong>
        <span className="spacer" />
        <button className={`small${showWiki ? ' primary' : ''}`} onClick={() => setShowWiki((v) => !v)} title="打开/关闭 Wiki 面板">
          📄 Wiki
        </button>
        <button className={`small${showKanban ? ' primary' : ''}`} onClick={() => setShowKanban((v) => !v)} title="打开/关闭任务看板面板">
          📋 看板
        </button>
      </div>
      {!showWiki && !showKanban && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--muted)', fontSize: 13 }}>
          两个面板都已关闭，用上方开关重新打开
        </div>
      )}
      {showWiki || showKanban ? (
        <div className="content-area" style={{ flex: 1 }}>
          {showWiki && (
            <div className="pane">
              <div className="pane-header">
                <span className="doc-title" title={wikiFile}>
                  📄 Wiki：{wikiFile || '未选择页面'}
                </span>
                <span className="spacer" />
                <button className="small" onClick={onOpenWiki} title="打开完整 Wiki 视图">
                  完整 Wiki
                </button>
                <button className="small" onClick={() => setShowWiki(false)} title="关闭此面板">
                  ✕
                </button>
              </div>
              <WikiPane project={project} file={wikiFile} />
            </div>
          )}
          {showKanban && (
            <div className="pane">
              <div className="pane-header">
                <span className="doc-title">✅ 项目任务看板（{tasks.length}）</span>
                <span className="spacer" />
                <button className="small" onClick={onOpenTasks} title="打开完整任务视图（清单/四象限/看板）">
                  任务管理
                </button>
                <button className="small" onClick={() => setShowKanban(false)} title="关闭此面板">
                  ✕
                </button>
              </div>
              <KanbanView project={project} tasks={tasks} onMutated={refresh} onOpen={setEditing} />
            </div>
          )}
        </div>
      ) : null}
    </div>
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
    </>
  )
}
