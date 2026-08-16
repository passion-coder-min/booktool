import { useEffect, useRef, useState } from 'react'
import type { Diagnostic } from '@booktool/shared'

interface Props {
  diagnostics: Diagnostic[]
  selected: number
  onSelect: (index: number) => void
  onClose: () => void
}

/**
 * 底部编译输出 / 诊断面板（默认收起，点工具栏 ⚠ 或状态栏诊断计数展开）。
 * 点击条目：选中并展开详细错误上下文（typst 原始块 + 源行 + 生成 .typ 片段），同时跳转编辑器。
 * 顶部把手可拖拽调整高度（160~560px，持久化）。
 */
export default function DiagnosticsPanel({ diagnostics, selected, onSelect, onClose }: Props) {
  const errors = diagnostics.filter((d) => d.severity === 'error').length
  const warnings = diagnostics.length - errors
  const sel = selected >= 0 && selected < diagnostics.length ? diagnostics[selected] : null
  const [height, setHeight] = useState(() => {
    try {
      const v = Number(localStorage.getItem('booktool-diag-height'))
      return Number.isFinite(v) && v >= 160 && v <= 560 ? v : 240
    } catch {
      return 240
    }
  })
  const detailRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(false)

  // 选中变化时把详情区滚动到可视区域（列表在上、详情在下）
  useEffect(() => {
    detailRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected, sel])

  // 顶部把手拖拽调高/调低
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const h = window.innerHeight - e.clientY - 40 // 顶部留出工具栏/状态栏余量
      setHeight(Math.min(560, Math.max(160, h)))
    }
    const onUp = () => {
      dragRef.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('booktool-diag-height', String(height))
    } catch {
      /* 忽略 */
    }
  }, [height])

  const copyDetail = async () => {
    if (!sel) return
    const text = [
      `${sel.severity === 'error' ? '[错误]' : '[警告]'} ${sel.message}`,
      `位置：${sel.file}${sel.line > 0 ? ':' + sel.line : ''}${sel.typFile ? `（生成 ${sel.typFile}${sel.typLine > 0 ? ':' + sel.typLine : ''}）` : ''}`,
      '',
      sel.detail ?? '',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* 忽略 */
    }
  }

  return (
    <div className="diag-panel" style={{ height }}>
      <div
        className="diag-resize-handle"
        title="拖动调整高度"
        onMouseDown={(e) => {
          dragRef.current = true
          e.preventDefault()
        }}
      />
      <div className="diag-panel-head">
        <span className="diag-panel-title">
          {'编译输出 / 诊断'}
          <span className="diag-counts">
            {errors > 0 && <span className="err">✗ {errors}</span>}
            {warnings > 0 && <span className="warn-c">⚠ {warnings}</span>}
            {diagnostics.length === 0 && <span className="ok">✓ 无问题</span>}
          </span>
        </span>
        <span className="spacer" />
        {sel && (
          <button className="ft-btn et-icon" title="复制错误信息" onClick={() => void copyDetail()}>
            ⧉
          </button>
        )}
        <button className="ft-btn et-icon" title="收起" onClick={onClose}>
          ▾
        </button>
      </div>
      <div className="diag-panel-body">
        <div className="diag-list">
          {diagnostics.length === 0 && <div className="diag-empty">编译成功，暂无输出（点击「编译 PDF」开始）。</div>}
          {diagnostics.map((d, i) => (
            <div
              key={i}
              className={`diag-item ${d.severity}${i === selected ? ' selected' : ''}`}
              onClick={() => onSelect(i)}
              title={d.message}
            >
              <span className="diag-icon">{d.severity === 'error' ? '✗' : '⚠'}</span>
              <span className="diag-msg">{d.message}</span>
              <span className="diag-file">
                {d.file}
                {d.line > 0 ? `:${d.line}` : ''}
              </span>
            </div>
          ))}
        </div>
        {sel ? (
          <div className="diag-detail" ref={detailRef}>
            <div className="diag-detail-head">
              <b>{sel.severity === 'error' ? '错误' : '警告'}：{sel.message}</b>
              <span className="diag-file">
                {sel.file}
                {sel.line > 0 ? `:${sel.line}` : ''}
                {sel.typFile ? `（${sel.typFile}:${sel.typLine}）` : ''}
              </span>
            </div>
            <pre className="diag-detail-body">{sel.detail ?? '（暂无更多上下文，可点击「编译 PDF」重新生成）'}</pre>
          </div>
        ) : (
          <div className="diag-detail diag-detail-empty">
            <div className="diag-detail-head">
              <b>未选择诊断项</b>
            </div>
            <div className="diag-detail-body">点击上方任意错误 / 警告条目，此处展开完整上下文（源码行 + Typst 生成片段）。</div>
          </div>
        )}
      </div>
    </div>
  )
}
