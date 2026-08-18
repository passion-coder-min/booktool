/** 「加载更多」按钮（列表底部，剩余为 0 时不渲染） */
export function LoadMore({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  if (remaining <= 0) return null
  return (
    <button className="small" style={{ width: '100%', marginTop: 4 }} onClick={onClick}>
      加载更多（还有 {remaining} 项）
    </button>
  )
}
