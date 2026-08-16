import { useCallback, useEffect, useState } from 'react'
import type { WorkspaceInfo, Task } from '@booktool/shared'
import { api } from '../api'
import EmptyCard from '../components/EmptyCard'
import StatsView from './StatsView'

/** 统计活动：跨项目任务统计 */
export default function StatsActivity({ workspace }: { workspace: WorkspaceInfo | null }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const refresh = useCallback(() => void api.work.taskList().then(setTasks), [])
  useEffect(refresh, [refresh, workspace])

  if (!workspace || workspace.projects.length === 0) {
    return (
      <EmptyCard
        icon="📊"
        title="暂无统计数据"
        desc={<>创建项目与任务后，这里会展示本周完成量、逾期、项目完成率与 8 周趋势</>}
      />
    )
  }

  return (
    <div className="workbench">
      <div className="pane" style={{ borderRight: 'none' }}>
        <div className="pane-header">
          <strong>统计面板</strong>
          <span style={{ color: 'var(--muted)', fontSize: 12 }}>共 {tasks.length} 个任务</span>
        </div>
        <StatsView tasks={tasks} projects={workspace.projects} />
      </div>
    </div>
  )
}
