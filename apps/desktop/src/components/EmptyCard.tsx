import type { ReactNode } from 'react'

/** 统一空状态卡片：图标 + 标题 + 说明 + 主操作 */
export default function EmptyCard({
  icon,
  title,
  desc,
  actions,
}: {
  icon: string
  title: string
  desc?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', maxWidth: 420, padding: 32 }}>
        <div style={{ fontSize: 44, marginBottom: 12, opacity: 0.9 }}>{icon}</div>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>{title}</div>
        {desc && <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.8, marginBottom: 16 }}>{desc}</div>}
        {actions && <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>{actions}</div>}
      </div>
    </div>
  )
}
