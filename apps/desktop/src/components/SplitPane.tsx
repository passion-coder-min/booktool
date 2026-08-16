import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

/** 布局三态：拆分 / 仅编辑 / 仅预览（Ctrl+\ 循环） */
export type LayoutMode = 'split' | 'edit' | 'preview'

export function usePersistedState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : initial
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setState((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          /* 忽略 */
        }
        return next
      })
    },
    [key],
  )
  return [state, set]
}

/**
 * 可拖拽分栏容器：左侧 + 6px 分隔条 + 右侧。
 * 比例（左占比）持久化，限制 20%~80%。
 */
export default function SplitPane({
  left,
  right,
  ratioKey = 'booktool-split-ratio',
  initial = 0.55,
}: {
  left: ReactNode
  right: ReactNode
  ratioKey?: string
  initial?: number
}) {
  const [ratio, setRatio] = usePersistedState(ratioKey, initial)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const onDown = (e: React.MouseEvent) => {
    dragging.current = true
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const r = (e.clientX - rect.left) / rect.width
      setRatio(Math.min(0.8, Math.max(0.2, r)))
    }
    const onUp = () => {
      dragging.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [setRatio])

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
      <div style={{ width: `${ratio * 100}%`, display: 'flex', flexDirection: 'column', minWidth: 0 }}>{left}</div>
      <div
        className="split-handle"
        onMouseDown={onDown}
        title="拖动调整比例"
        style={{
          width: 6,
          flexShrink: 0,
          cursor: 'col-resize',
          background: 'var(--border)',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute', inset: 0, left: 2, width: 2,
            background: dragging.current ? 'var(--accent)' : 'transparent',
          }}
        />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>{right}</div>
    </div>
  )
}
