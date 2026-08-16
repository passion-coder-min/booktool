import { useMemo } from 'react'
import type { Project, Task } from '@booktool/shared'

interface Props {
  tasks: Task[]
  projects: Project[]
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function mondayOf(d: Date): Date {
  const x = new Date(d)
  x.setDate(x.getDate() - (x.getDay() + 6) % 7)
  x.setHours(0, 0, 0, 0)
  return x
}

export default function StatsView({ tasks, projects }: Props) {
  const stats = useMemo(() => {
    const today = todayStr()
    const mon = fmt(mondayOf(new Date()))

    // 本周任务：计划日在本周
    const thisWeek = tasks.filter((t) => t.scheduled !== null && t.scheduled >= mon && t.scheduled <= today)
    const weekTotal = thisWeek.length
    const weekDone = thisWeek.filter((t) => t.status === 'done').length

    // 逾期：截止日 < 今天且未完成（全量快照）
    const overdueNotDone = tasks.filter(
      (t) => t.status !== 'done' && t.due !== null && t.due < today,
    ).length
    // 完成超期：完成时间晚于截止日
    const overdueDone = tasks.filter(
      (t) => t.status === 'done' && t.completed !== null && t.due !== null && t.completed.slice(0, 10) > t.due,
    ).length

    // 按项目完成率
    const byProject = projects.map((p) => {
      const list = tasks.filter((t) => t.project === p.id)
      const done = list.filter((t) => t.status === 'done').length
      return { name: p.name, color: p.color, total: list.length, done }
    })

    // 近 8 周完成趋势（按 completed 所在周）
    const weeks: { label: string; count: number }[] = []
    for (let i = 7; i >= 0; i--) {
      const wStart = mondayOf(new Date())
      wStart.setDate(wStart.getDate() - 7 * i)
      const wEnd = new Date(wStart)
      wEnd.setDate(wEnd.getDate() + 6)
      const count = tasks.filter((t) => {
        if (!t.completed) return false
        const d = t.completed.slice(0, 10)
        return d >= fmt(wStart) && d <= fmt(wEnd)
      }).length
      weeks.push({ label: `${wStart.getMonth() + 1}/${wStart.getDate()}`, count })
    }

    return { weekTotal, weekDone, overdueNotDone, overdueDone, byProject, weeks }
  }, [tasks, projects])

  const maxWeek = Math.max(1, ...stats.weeks.map((w) => w.count))

  return (
    <div className="stats">
      <div className="stat-cards">
        <div className="stat-card">
          <div className="num">{stats.weekTotal}</div>
          <div className="lbl">本周任务总数</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: 'var(--ok)' }}>{stats.weekDone}</div>
          <div className="lbl">本周已完成</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: 'var(--danger)' }}>{stats.overdueNotDone}</div>
          <div className="lbl">逾期未完成</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: 'var(--warn)' }}>{stats.overdueDone}</div>
          <div className="lbl">完成超期</div>
        </div>
      </div>

      <div className="stat-section">
        <h3>按项目完成率</h3>
        {stats.byProject.map((p) => (
          <div key={p.name} className="proj-bar-row">
            <span className="name" title={p.name}>{p.name}</span>
            <div className="proj-bar">
              <div
                style={{
                  width: p.total === 0 ? 0 : `${(p.done / p.total) * 100}%`,
                  background: p.color,
                }}
              />
            </div>
            <span style={{ width: 64, textAlign: 'right', color: 'var(--muted)', fontSize: 12 }}>
              {p.done}/{p.total}
            </span>
          </div>
        ))}
      </div>

      <div className="stat-section">
        <h3>近 8 周完成趋势</h3>
        <div className="trend">
          {stats.weeks.map((w) => (
            <div key={w.label} className="col">
              <span className="cnt">{w.count || ''}</span>
              <div className="bar" style={{ height: `${(w.count / maxWeek) * 100}%` }} />
              <span className="wk">{w.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
