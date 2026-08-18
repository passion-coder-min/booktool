import { useCallback, useState } from 'react'

/** 分页切片（纯函数，便于测试）：返回前 visibleCount 项与剩余数量 */
export function slicePaged<T>(items: T[], visibleCount: number): { visible: T[]; remaining: number } {
  const visible = items.length <= visibleCount ? items : items.slice(0, visibleCount)
  return { visible, remaining: items.length - visible.length }
}

/**
 * 懒加载分页：先渲染前 pageSize 项，「加载更多」增量展开。
 * 任务清单可能达到 10 万级（tasks.md 一行一任务），一次性渲染全部 DOM 会卡死/崩溃，
 * 看板列 / 四象限格 / 表格统一用它控制渲染节点数。
 */
export function usePaged<T>(items: T[], pageSize = 50) {
  const [visibleCount, setVisibleCount] = useState(pageSize)
  const { visible, remaining } = slicePaged(items, visibleCount)
  const loadMore = useCallback(() => setVisibleCount((c) => c + pageSize), [pageSize])
  return { visible, remaining, loadMore }
}
