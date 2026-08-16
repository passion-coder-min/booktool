export type Activity = 'book' | 'work' | 'calendar' | 'stats' | 'settings'

const ITEMS: { key: Activity; icon: string; label: string }[] = [
  { key: 'book', icon: '📖', label: '出版：书籍编辑与 PDF 编译' },
  { key: 'work', icon: '💼', label: '工作：项目 Wiki 与任务看板' },
  { key: 'calendar', icon: '📅', label: '日历：跨项目任务日历' },
  { key: 'stats', icon: '📊', label: '统计：任务统计面板' },
  { key: 'settings', icon: '⚙', label: '设置' },
]

export default function ActivityBar({ active, onSelect }: { active: Activity; onSelect: (a: Activity) => void }) {
  return (
    <nav className="activity-bar">
      {ITEMS.map((it) => (
        <button
          key={it.key}
          className={`activity-item${active === it.key ? ' active' : ''}`}
          title={it.label}
          onClick={() => onSelect(it.key)}
        >
          {it.icon}
        </button>
      ))}
      <div className="activity-spacer" />
    </nav>
  )
}
