import { useEffect, useRef, useState } from 'react'

/**
 * 输入弹窗（替代 window.prompt）。
 *
 * Electron 渲染进程不支持 `window.prompt()`（调用即抛 `prompt() is not supported`），
 * 而全应用的输入交互（新建项目/章节、重命名等）都依赖它——打包环境里点击后无任何反应。
 * 这里用与其它弹窗一致的 `.modal` 组件实现异步版 `promptAsync(message, defaultValue?)`：
 * 返回 `Promise<string | null>`，确认返回输入值、取消/关闭返回 `null`。
 * 调用方统一 `const v = await promptAsync(...)` 即可。
 */

interface PendingPrompt {
  id: number
  message: string
  defaultValue?: string
  resolve: (value: string | null) => void
}

let pending: PendingPrompt | null = null
let seq = 0
const subscribers = new Set<() => void>()

function emit() {
  for (const s of subscribers) s()
}

/** 弹出输入框，返回用户输入（取消/关闭返回 null） */
export function promptAsync(message: string, defaultValue?: string): Promise<string | null> {
  return new Promise((resolve) => {
    pending = { id: ++seq, message, defaultValue, resolve }
    emit()
  })
}

function finish(value: string | null) {
  if (!pending) return
  const r = pending.resolve
  pending = null
  emit()
  r(value)
}

/** 全局输入弹窗宿主：在 App 根部挂载一次 */
export default function PromptHost() {
  const [active, setActive] = useState<PendingPrompt | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const sync = () => setActive(pending)
    subscribers.add(sync)
    sync()
    return () => {
      subscribers.delete(sync)
    }
  }, [])

  // 打开时自动聚焦并选中默认值
  useEffect(() => {
    if (active) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [active])

  if (!active) return null
  return (
    <div className="modal-mask" onClick={() => finish(null)}>
      <div className="modal" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h2>{active.message}</h2>
        <input
          ref={inputRef}
          defaultValue={active.defaultValue ?? ''}
          style={{ width: '100%', padding: '6px 10px', marginBottom: 14, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--panel-2)', color: 'var(--text)' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish((e.target as HTMLInputElement).value)
            else if (e.key === 'Escape') finish(null)
          }}
        />
        <div className="modal-actions">
          <button className="ghost" onClick={() => finish(null)}>
            取消
          </button>
          <button className="primary" onClick={() => finish(inputRef.current?.value ?? '')}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
